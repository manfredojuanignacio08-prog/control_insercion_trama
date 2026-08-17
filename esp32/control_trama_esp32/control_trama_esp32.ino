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
 *   - Alimentación: 24V del telar → fusible → diodo Schottky → LM2596
 *     (5V) → ESP32 (VIN) + bobinas del relé (JD-VCC, jumper quitado).
 *     La lógica del relé (VCC chico) va a los 3.3V del ESP32.
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
const int PIN_LED             = 2;   // LED integrado (indicador de estado)

// La mayoría de los módulos de relé optoacoplados de 5V se ACTIVAN CON
// NIVEL BAJO (LOW = relé cerrado). Si el tuyo es al revés, cambiá esto
// en config.h y listo — el resto del código se adapta solo.
const int NIVEL_ACTIVO   = RELE_ACTIVO_BAJO ? LOW  : HIGH;
const int NIVEL_INACTIVO = RELE_ACTIVO_BAJO ? HIGH : LOW;

// ------------------------------------------------------------
// Tiempos
// ------------------------------------------------------------
const unsigned long INTERVALO_SONDEO_MS   = 2500;  // consulta de estado
const unsigned long DURACION_PULSO_MS     = 300;   // "apretar el botón"
const unsigned long MIN_ENTRE_COMANDOS_MS = 2000;  // anti-doble-pulso
const int           WDT_TIMEOUT_S         = 15;    // watchdog

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

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
void setup() {
  // ARRANQUE SEGURO DE RELÉS — el orden importa:
  // primero se escribe el nivel inactivo y RECIÉN DESPUÉS se configura el
  // pin como salida. Si se hace al revés, hay un instante en que el pin
  // queda flotando/bajo y el relé da un pulso fantasma al encender.
  digitalWrite(PIN_RELE_MARCHA,     NIVEL_INACTIVO);
  digitalWrite(PIN_RELE_PAUSA,      NIVEL_INACTIVO);
  digitalWrite(PIN_RELE_RETROCEDER, NIVEL_INACTIVO);
  pinMode(PIN_RELE_MARCHA,     OUTPUT);
  pinMode(PIN_RELE_PAUSA,      OUTPUT);
  pinMode(PIN_RELE_RETROCEDER, OUTPUT);
  digitalWrite(PIN_RELE_MARCHA,     NIVEL_INACTIVO);
  digitalWrite(PIN_RELE_PAUSA,      NIVEL_INACTIVO);
  digitalWrite(PIN_RELE_RETROCEDER, NIVEL_INACTIVO);

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
// Pulso de relé — simula apretar y soltar el botón físico
// ------------------------------------------------------------
// El diseño garantiza que el relé NUNCA queda pegado: el apagado no
// depende de ninguna condición externa, es una secuencia fija.
void pulsarRele(int pin) {
  digitalWrite(pin, NIVEL_ACTIVO);
  // El pulso es corto; refrescamos el watchdog antes y después por prolijidad
  esp_task_wdt_reset();
  delay(DURACION_PULSO_MS);
  digitalWrite(pin, NIVEL_INACTIVO);
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

