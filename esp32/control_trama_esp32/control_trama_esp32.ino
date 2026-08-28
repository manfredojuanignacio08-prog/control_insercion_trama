/*
 * ============================================================
 *  Control de Inserción de Trama — Firmware ESP32 (Gateway)
 * ============================================================
 *
 *  Este firmware está hecho A MEDIDA del hardware documentado en
 *  "Documentación Eléctrica Telar - ESP32":
 *
 *   - El ESP32 actúa como GATEWAY: NO controla los motores del telar
 *     (la placa nativa de la máquina conserva toda su lógica).
 *   - Tres relés optoacoplados van conectados EN PARALELO a los botones
 *     físicos de Marcha (Inicio), Pausa y Retroceder del telar. Energizar
 *     un relé durante un instante = "apretar el botón" sin tocar la
 *     botonera.
 *   - Alimentación: 220V de red → fusible lento 1A → módulo HLK-5M05
 *     (5V) → ESP32 (VIN) + módulo de relés (VCC, con el jumper JD-VCC
 *     puesto). Es una fuente propia, independiente del telar: el sistema
 *     no toma corriente de la máquina.
 *
 *  Qué hace:
 *   1. Se conecta al Wi-Fi.
 *   2. Sondea el backend (GET /api/telares/1) cada pocos segundos.
 *   3. Cuando el estado deseado cambia:
 *        - pasa a "tejiendo"  → pulso en el relé de MARCHA (GPIO 25)
 *        - deja de "tejiendo" → pulso en el relé de PAUSA  (GPIO 26)
 *      Es decir: asignar un patrón desde la web/app arranca la máquina
 *      real, y el botón "Pausa" de la web/app la pausa. Los botones
 *      físicos del telar siguen funcionando igual (la conexión es en
 *      paralelo). Nota: el telar real tiene 3 botones — Marcha, Pausa y
 *      Retroceder — no existe un "Detener" físico distinto, por eso la
 *      web tampoco lo tiene: el único botón de corte es "Pausa".
 *   3b. Además, sondea "retroceder_seq". Cada vez que ese número cambia
 *       respecto al último conocido, pulsa el relé de RETROCEDER (GPIO
 *       27) una sola vez — es una acción puntual (corregir tras un corte
 *       de hilo), no un estado persistente como Marcha/Pausa.
 *   3c. Los MISMOS tres botones se sensan además en sentido inverso: si un
 *       operario los aprieta a mano en la máquina, el ESP32 se entera y
 *       avisa al backend (POST /evento-fisico), para que la web refleje lo
 *       que realmente está pasando en el telar. Sin esto, alguien podía
 *       arrancar el telar a mano y la web seguía mostrando "detenido".
 *       Cada botón está aislado con un optoacoplador (24V AC del botón ->
 *       puente rectificador -> resistencia limitadora -> LED del PC817; el
 *       fototransistor, con pull-up a 3.3V, cae a nivel bajo mientras el
 *       botón está apretado).
 *       OJO: al pulsar un relé, ese mismo sensado detecta el pulso propio.
 *       Por eso hay una ventana de ignorado (IGNORAR_ECO_MS) tras cada
 *       pulso, para no leer las propias órdenes como si fueran manuales.
 *   4. Si falla la red, NO hace nada peligroso (fail-safe): los relés
 *      quedan sueltos y el telar sigue gobernado por su botonera física.
 *   5. Reporta fallas propias a POST /api/errores para que queden en el
 *      log del sistema.
 *
 *  Protecciones DE CÓDIGO incluidas (complementan las eléctricas):
 *   - Arranque seguro de relés: se escribe el nivel INACTIVO en los GPIO
 *     ANTES de configurarlos como salida, para que los relés no den un
 *     "golpe" fantasma al encender o reiniciar el ESP32.
 *   - Pulso con duración fija y acotada: un relé JAMÁS queda pegado; si
 *     algo sale mal, igual se apaga al vencer el tiempo del pulso.
 *   - Watchdog por hardware: si el programa se cuelga (por ruido
 *     eléctrico, por ejemplo), el ESP32 se reinicia solo en segundos.
 *   - Anti-doble-pulso: tiempo mínimo entre comandos, para no "apretar"
 *     dos veces por una lectura repetida del backend.
 *
 *  Librerías (Library Manager del IDE de Arduino):
 *   - WiFi.h, HTTPClient.h → incluidas con el core de ESP32
 *   - ArduinoJson (Benoît Blanchon, v7.x)
 *
 *  Completar config.h antes de subir el sketch.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include "config.h"

// ------------------------------------------------------------
// Pines (según la documentación eléctrica del proyecto)
// ------------------------------------------------------------
const int PIN_RELE_MARCHA     = 25;  // IN1 del módulo relé → botón Inicio/Marcha
const int PIN_RELE_PAUSA      = 26;  // IN2 del módulo relé → botón Pausa/Parada
const int PIN_RELE_RETROCEDER = 27;  // IN3 (relé adicional) → botón Retroceder
const int PIN_SENSOR_MARCHA     = 32;  // PC817 → sensa el botón Marcha    (solo lectura)
const int PIN_SENSOR_PAUSA      = 33;  // PC817 → sensa el botón Pausa     (solo lectura)
const int PIN_SENSOR_RETROCEDER = 34;  // PC817 → sensa el botón Retroceder (solo lectura)
const int PIN_LED             = 2;   // LED integrado (indicador de estado)

// La mayoría de los módulos de relé optoacoplados de 5V se ACTIVAN CON
// NIVEL BAJO (LOW = relé cerrado). Si el tuyo es al revés, cambiá esto
// en config.h y listo — el resto del código se adapta solo.
// Cada relé puede tener su propia polaridad (ver config.h): en este equipo
// el módulo de 2 canales es activo-bajo y el individual de Retroceder es
// activo-alto. Estas funciones devuelven el nivel correcto según el pin,
// así el resto del código no tiene que preocuparse por la diferencia.
int nivelActivo(int pin) {
  if (pin == PIN_RELE_MARCHA)     return RELE_MARCHA_ACTIVO_BAJO     ? LOW : HIGH;
  if (pin == PIN_RELE_PAUSA)      return RELE_PAUSA_ACTIVO_BAJO      ? LOW : HIGH;
  if (pin == PIN_RELE_RETROCEDER) return RELE_RETROCEDER_ACTIVO_BAJO ? LOW : HIGH;
  return LOW;
}

int nivelInactivo(int pin) {
  return nivelActivo(pin) == LOW ? HIGH : LOW;
}

// ------------------------------------------------------------
// Tiempos
// ------------------------------------------------------------
const unsigned long INTERVALO_SONDEO_MS   = 2500;  // consulta de estado
const unsigned long DURACION_PULSO_MS     = 300;   // "apretar el botón"
const unsigned long MIN_ENTRE_COMANDOS_MS = 2000;  // anti-doble-pulso
const int           WDT_TIMEOUT_S         = 15;    // watchdog
const unsigned long DEBOUNCE_SENSOR_MS    = 400;   // ignora rebotes/ripple del AC en el sensado
const unsigned long REINTENTO_AVISO_MS    = 3000;  // espera entre reintentos si el backend no responde
// Cuando el ESP32 pulsa un relé, el sensado de ESE botón detecta la misma
// pulsación (el relé cierra el mismo circuito que el botón). Sin esta
// ventana, el sistema leería sus propias órdenes como si fueran del
// operario y se realimentaría. Cubre el pulso (300 ms) con margen.
const unsigned long IGNORAR_ECO_MS        = 800;

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
// Estado deseado según el backend: true = debería estar tejiendo.
// Arranca "desconocido" (-1) para no mandar pulsos apenas prende hasta
// tener una primera lectura confiable.
int estadoDeseado = -1;          // -1 desconocido | 0 detenido | 1 tejiendo
int retrocederSeqConocido = -1;  // -1 desconocido (no se pulsa hasta la 1ra lectura)
unsigned long ultimoSondeo = 0;
unsigned long ultimoComando = 0;

// Sensado de los botones del telar (solo lectura: detecta uso manual)
// Se usan interrupciones (no muestreo dentro del loop) porque el loop
// tiene delay(50) y el sondeo al backend bloquea varios ms: una pulsación
// corta del operario podía pasar desapercibida. La ISR solo levanta una
// bandera; el POST al backend se hace después, en el loop.
volatile bool eventoMarchaPendiente     = false;
volatile bool eventoPausaPendiente      = false;
volatile bool eventoRetrocederPendiente = false;
volatile unsigned long ultimoEventoMarcha     = 0;
volatile unsigned long ultimoEventoPausa      = 0;
volatile unsigned long ultimoEventoRetroceder = 0;
// Momento del último pulso propio de cada relé, para descartar el eco.
volatile unsigned long ultimoPulsoMarcha     = 0;
volatile unsigned long ultimoPulsoPausa      = 0;
volatile unsigned long ultimoPulsoRetroceder = 0;
unsigned long ultimoIntentoAviso = 0;  // espacia los reintentos si el backend falla

void IRAM_ATTR isrMarcha() {
  unsigned long ahora = millis();
  if (ahora - ultimoPulsoMarcha < IGNORAR_ECO_MS) return;   // eco del propio relé
  if (ahora - ultimoEventoMarcha >= DEBOUNCE_SENSOR_MS) {
    ultimoEventoMarcha = ahora;
    eventoMarchaPendiente = true;
  }
}

void IRAM_ATTR isrPausa() {
  unsigned long ahora = millis();
  if (ahora - ultimoPulsoPausa < IGNORAR_ECO_MS) return;
  if (ahora - ultimoEventoPausa >= DEBOUNCE_SENSOR_MS) {
    ultimoEventoPausa = ahora;
    eventoPausaPendiente = true;
  }
}

void IRAM_ATTR isrRetroceder() {
  unsigned long ahora = millis();
  if (ahora - ultimoPulsoRetroceder < IGNORAR_ECO_MS) return;
  if (ahora - ultimoEventoRetroceder >= DEBOUNCE_SENSOR_MS) {
    ultimoEventoRetroceder = ahora;
    eventoRetrocederPendiente = true;
  }
}

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
void setup() {
  // ARRANQUE SEGURO DE RELÉS — el orden importa:
  // primero se escribe el nivel inactivo y RECIÉN DESPUÉS se configura el
  // pin como salida. Si se hace al revés, hay un instante en que el pin
  // queda flotando/bajo y el relé da un pulso fantasma al encender.
  digitalWrite(PIN_RELE_MARCHA,     nivelInactivo(PIN_RELE_MARCHA));
  digitalWrite(PIN_RELE_PAUSA,      nivelInactivo(PIN_RELE_PAUSA));
  digitalWrite(PIN_RELE_RETROCEDER, nivelInactivo(PIN_RELE_RETROCEDER));
  pinMode(PIN_RELE_MARCHA,     OUTPUT);
  pinMode(PIN_RELE_PAUSA,      OUTPUT);
  pinMode(PIN_RELE_RETROCEDER, OUTPUT);
  digitalWrite(PIN_RELE_MARCHA,     nivelInactivo(PIN_RELE_MARCHA));
  digitalWrite(PIN_RELE_PAUSA,      nivelInactivo(PIN_RELE_PAUSA));
  digitalWrite(PIN_RELE_RETROCEDER, nivelInactivo(PIN_RELE_RETROCEDER));

  // Las pull-ups son externas (10 kΩ a 3.3V), no hace falta INPUT_PULLUP.
  // GPIO 34 es de solo-entrada y no tiene pull-up interna: la externa es
  // obligatoria en ese canal.
  pinMode(PIN_SENSOR_MARCHA,     INPUT);
  pinMode(PIN_SENSOR_PAUSA,      INPUT);
  pinMode(PIN_SENSOR_RETROCEDER, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_SENSOR_MARCHA),     isrMarcha,     FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_SENSOR_PAUSA),      isrPausa,      FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_SENSOR_RETROCEDER), isrRetroceder, FALLING);

  pinMode(PIN_LED, OUTPUT);
  Serial.begin(115200);

  // Watchdog por hardware: si loop() no "avisa que está vivo" en
  // WDT_TIMEOUT_S segundos (cuelgue por ruido eléctrico, por ejemplo),
  // el ESP32 se reinicia solo. Al reiniciar, el arranque seguro de arriba
  // garantiza que los relés no se muevan.
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  esp_task_wdt_init(&wdtConfig);
  esp_task_wdt_add(NULL);

  conectarWifi();
}

void conectarWifi() {
  Serial.printf("Conectando a la red %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // evita microcortes de WiFi que atrasan el sondeo
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 60) {
    delay(400);
    Serial.print(".");
    esp_task_wdt_reset();  // que el watchdog no nos reinicie mientras conecta
    intentos++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConectado. IP del ESP32: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(PIN_LED, HIGH);
  } else {
    Serial.println("\nNo se pudo conectar; se reintenta en el loop.");
    digitalWrite(PIN_LED, LOW);
  }
}

// ------------------------------------------------------------
// Loop principal
// ------------------------------------------------------------
void loop() {
  esp_task_wdt_reset();  // "sigo vivo" para el watchdog

  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(PIN_LED, LOW);
    conectarWifi();
    delay(500);
    return;  // sin red no se toma ninguna acción (fail-safe)
  }

  if (millis() - ultimoSondeo >= INTERVALO_SONDEO_MS) {
    ultimoSondeo = millis();
    sincronizarConBackend();
  }

  // Las ISR ya detectaron el flanco; acá solo se despacha el aviso al
  // backend (una operación de red no puede hacerse dentro de una ISR).
  // El reintento se espacia: si el backend está caído, sin esta guarda el
  // loop lo golpearía cada 50ms e inundaría la red sin necesidad.
  if ((eventoMarchaPendiente || eventoPausaPendiente || eventoRetrocederPendiente) &&
      millis() - ultimoIntentoAviso >= REINTENTO_AVISO_MS) {
    ultimoIntentoAviso = millis();

    // La bandera se consume ANTES de enviar, no después: el POST tarda
    // hasta 2s y en ese lapso la ISR puede registrar una pulsación nueva.
    // Si limpiáramos al volver, borraríamos ese segundo evento sin haberlo
    // avisado nunca. Si el envío falla, se vuelve a marcar para reintentar.
    if (eventoMarchaPendiente) {
      eventoMarchaPendiente = false;
      Serial.println("Sensado: alguien apretó MARCHA en el telar");
      if (!reportarEventoFisico("marcha")) eventoMarchaPendiente = true;
      esp_task_wdt_reset();
    }
    if (eventoPausaPendiente) {
      eventoPausaPendiente = false;
      Serial.println("Sensado: alguien apretó PAUSA en el telar");
      if (!reportarEventoFisico("pausa")) eventoPausaPendiente = true;
      esp_task_wdt_reset();
    }
    if (eventoRetrocederPendiente) {
      eventoRetrocederPendiente = false;
      Serial.println("Sensado: alguien apretó RETROCEDER en el telar");
      if (!reportarEventoFisico("retroceder")) eventoRetrocederPendiente = true;
      esp_task_wdt_reset();
    }
  }

  delay(50);
}

// ------------------------------------------------------------
// GET /api/telares/{id} → comparar estado deseado vs. conocido
// ------------------------------------------------------------
// El "?origen=esp32" es lo único nuevo: le avisa al backend que este
// sondeo viene del dispositivo real (no de alguien mirando la web), así
// puede guardar un heartbeat verdadero para mostrar "ESP32 conectado"
// en el editor. No cambia nada de la lógica de Marcha/Pausa.
void sincronizarConBackend() {
  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/telares/" + String(TELAR_ID) + "?origen=esp32";
  http.begin(url);
  http.setTimeout(5000);

  int codigo = http.GET();
  if (codigo != 200) {
    Serial.printf("Error consultando estado: HTTP %d\n", codigo);
    http.end();
    return;  // no se actúa con información dudosa
  }

  // Solo nos interesa "estado" y "retroceder_seq"; el filtro evita gastar
  // RAM en el resto de la respuesta.
  JsonDocument filtro;
  filtro["estado"] = true;
  filtro["retroceder_seq"] = true;
  JsonDocument doc;
  DeserializationError err =
      deserializeJson(doc, http.getString(), DeserializationOption::Filter(filtro));
  http.end();

  if (err) {
    Serial.printf("Respuesta ilegible del backend: %s\n", err.c_str());
    return;
  }

  const char* estado = doc["estado"];
  if (estado == nullptr) return;

  int deseadoAhora = (strcmp(estado, "tejiendo") == 0) ? 1 : 0;

  // Primera lectura tras el arranque: solo se memoriza, NO se pulsa nada.
  // Evita que un reinicio del ESP32 (corte de luz, watchdog) le dé un
  // "arranque" o "pausa" inesperado a la máquina.
  if (estadoDeseado == -1) {
    estadoDeseado = deseadoAhora;
    Serial.printf("Estado inicial sincronizado: %s (sin actuar)\n",
                  deseadoAhora ? "tejiendo" : "detenido");
    return;
  }

  if (deseadoAhora != estadoDeseado) {
    // Anti-doble-pulso: respetar un tiempo mínimo entre comandos
    if (millis() - ultimoComando < MIN_ENTRE_COMANDOS_MS) return;

    if (deseadoAhora == 1) {
      Serial.println("Backend pide TEJER → pulso en relé de MARCHA");
      pulsarRele(PIN_RELE_MARCHA);
    } else {
      Serial.println("Backend pide DETENER → pulso en relé de PAUSA");
      pulsarRele(PIN_RELE_PAUSA);
    }
    estadoDeseado = deseadoAhora;
    ultimoComando = millis();
  }

  // ------------------------------------------------------------
  // Retroceder físico: no es un estado persistente como Marcha/Pausa,
  // es una acción puntual. Por eso se compara un CONTADOR en vez de
  // un estado: cada vez que "retroceder_seq" cambia respecto al último
  // valor conocido, hubo un pedido nuevo → un pulso, ni más ni menos,
  // sin importar cuánto haya cambiado el número.
  // ------------------------------------------------------------
  int retrocederSeqAhora = doc["retroceder_seq"] | -1;
  if (retrocederSeqAhora == -1) return;  // el backend no mandó el campo

  if (retrocederSeqConocido == -1) {
    // Primera lectura tras el arranque: solo se memoriza, no se pulsa.
    retrocederSeqConocido = retrocederSeqAhora;
    return;
  }

  if (retrocederSeqAhora != retrocederSeqConocido) {
    if (millis() - ultimoComando < MIN_ENTRE_COMANDOS_MS) return;

    Serial.println("Backend pide RETROCEDER → pulso en relé de RETROCEDER");
    pulsarRele(PIN_RELE_RETROCEDER);
    retrocederSeqConocido = retrocederSeqAhora;
    ultimoComando = millis();
  }
}

// ------------------------------------------------------------
// POST /api/telares/{id}/evento-fisico — avisa un uso manual de
// un botón, para que la web refleje el estado real del telar
// ------------------------------------------------------------
// Devuelve true solo si el backend confirmó que recibió el aviso.
// Importa: si esto falla y se descarta el evento, la web nunca se entera
// de que la posición quedó desincronizada — que es justo el problema que
// este sensado tiene que evitar. Por eso el loop reintenta.
bool reportarEventoFisico(const char* tipo) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/telares/" + String(TELAR_ID) + "/evento-fisico";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  // 2s (no 5s): este POST puede dispararse justo después del sondeo, y la
  // suma de ambos timeouts no debe acercarse al watchdog de 15s.
  http.setTimeout(2000);

  JsonDocument doc;
  doc["tipo"] = tipo;

  String cuerpo;
  serializeJson(doc, cuerpo);
  int codigo = http.POST(cuerpo);
  http.end();

  if (codigo != 200) {
    Serial.printf("Error avisando evento %s: HTTP %d (se reintenta)\n", tipo, codigo);
    return false;
  }
  return true;
}

// ------------------------------------------------------------
// Pulso de relé — simula apretar y soltar el botón físico
// ------------------------------------------------------------
// El diseño garantiza que el relé NUNCA queda pegado: el apagado no
// depende de ninguna condición externa, es una secuencia fija.
void pulsarRele(int pin) {
  // Se anota el instante del pulso ANTES de darlo: el sensado de ese mismo
  // botón va a detectarlo (el relé cierra el circuito del botón), y sin esta
  // marca lo interpretaría como una pulsación manual del operario.
  unsigned long ahora = millis();
  if (pin == PIN_RELE_MARCHA)          ultimoPulsoMarcha     = ahora;
  else if (pin == PIN_RELE_PAUSA)      ultimoPulsoPausa      = ahora;
  else if (pin == PIN_RELE_RETROCEDER) ultimoPulsoRetroceder = ahora;

  digitalWrite(pin, nivelActivo(pin));
  // El pulso es corto; refrescamos el watchdog antes y después por prolijidad
  esp_task_wdt_reset();
  delay(DURACION_PULSO_MS);
  digitalWrite(pin, nivelInactivo(pin));
  esp_task_wdt_reset();
  parpadearLed(2);
}

// ------------------------------------------------------------
// POST /api/errores — dejar registro de problemas del dispositivo
// ------------------------------------------------------------
void reportarError(const String& titulo, const String& detalle) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/errores";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  JsonDocument doc;
  doc["telar_id"] = TELAR_ID;
  doc["titulo"]   = titulo;
  doc["mensaje"]  = detalle;
  doc["codigo"]   = "ESP32";

  String cuerpo;
  serializeJson(doc, cuerpo);
  http.POST(cuerpo);
  http.end();
}

// ------------------------------------------------------------
// Utilidad: parpadeo del LED (feedback sin monitor serie)
// ------------------------------------------------------------
void parpadearLed(int veces) {
  for (int i = 0; i < veces; i++) {
    digitalWrite(PIN_LED, LOW);
    delay(60);
    digitalWrite(PIN_LED, HIGH);
    delay(60);
  }
}

