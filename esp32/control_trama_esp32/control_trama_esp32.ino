// ============================================================================
//  Control de Inserción de Trama · firmware del ESP32 del telar
//  Equipo N.º 5 · 7mo Informática · Instituto Leonardo Murialdo · 2026
//
//  UN SOLO PROGRAMA PARA LA ÚNICA PLACA DEL GABINETE. Hace todo lo que el telar necesita, según
//  lo que esté armado (se elige en config.h con NIVEL2_INSTALADO):
//
//   - Bloque A, siempre: relés en paralelo con Marcha, Pausa y Retroceder, y sensado de esos
//     tres botones para saber cuándo alguien los usa a mano.
//   - Bloques C y D, con NIVEL2_INSTALADO en true: conteo real de pasadas con el sensor
//     inductivo y selección del dibujo con los relés LCA110 sobre los lectores ópticos.
//
//  HOY va con NIVEL2_INSTALADO en false: solo el Bloque A está conectado a la máquina.
//
//  Pines (no se pisan): relés 25, 26 y 27; sensado de la botonera 32, 33 y 34; sensor de pasada
//  35; canales de selección 18, 19, 21 y 22; LED de la placa 2.
//
//  Cómo funciona el Nivel 2, en una línea: el sensor avisa que empezó una pasada nueva y el
//  programa aplica en ese momento la fila del dibujo que corresponda.
//
//  ARQUITECTURA: DOS NÚCLEOS.
//   - Núcleo 1, loop(): TIEMPO REAL. Solo cuenta pulsos del sensor y aplica filas.
//     Nunca espera a la red: cada iteración dura ~1 ms.
//   - Núcleo 0, tareaRed(): TODA la red (consultas al backend, descarga del dibujo,
//     reporte de pasadas, avisos de la botonera) y los pulsos de los relés del Bloque A.
//     Puede tardar segundos sin afectar al núcleo 1.
//  Los dos núcleos comparten unas pocas variables (marcadas volatile o protegidas con una
//  sección crítica) y nada más. Con NIVEL2_INSTALADO en false el núcleo 1 queda sin trabajo.
//
//  Librerías: core ESP32 de Espressif 3.x (IDF 5) y ArduinoJson 7.x.
// ============================================================================

#include <WiFi.h>
#include <string.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>

#include "config.h"
#include "sensor_pasada.h"
#include "seleccion_dibujo.h"
#include "posicion_dibujo.h"

// ---------------------------------------------------------------- El dibujo
// La matriz que se está tejiendo. Cada fila es una combinación que se teje tantas pasadas como indique repeticiones[]; sus columnas son
// los canales que se activan al mismo tiempo.
//
// dibujo, dibujoFilas, dibujoColumnas y filaActual los tocan los dos núcleos: siempre
// dentro de una sección crítica (mux).
static const int MAX_FILAS = 300;   // igual que el máximo de la web y la base
bool  dibujo[MAX_FILAS][N_CANALES];
// Cuántas pasadas seguidas se teje cada fila. En un tejido real es habitual que la
// misma combinación de bobinas se repita cien o mil veces antes de cambiar, y
// dibujar cien filas idénticas era impracticable.
int   repeticiones[MAX_FILAS];
// Cuántas pasadas faltan de la fila que se está tejiendo.
int   repeticionesRestantes = 0;
int   dibujoFilas    = 0;
int   dibujoColumnas = 0;
int   filaActual     = 0;
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

// Estado compartido entre núcleos (una sola escritura por variable):
volatile bool tejiendo   = false;   // lo pone la red (según el backend); lo limpia el loop al perder señal
volatile bool hayDibujo  = false;   // lo pone la red
volatile bool avisoSinSenalPendiente = false;   // lo pone el loop; lo limpia la red al avisar al backend

// Solo lo usa la tarea de red:
long  totalReportado  = -1;   // último conteo que el backend aceptó (para reportar cambios en pausa)
long  retrocesosVisto = -1;   // último valor de retrocesos_contados; -1 = todavía no se leyó ninguno
long  patronCargado   = 0;    // id del dibujo que está en memoria (para detectar que asignaron otro)
long  produccionCargada = 0;  // id de la producción cuya posición y conteo adoptó (0 = ninguna)
bool  volverABajarDibujo = false;   // el backend descartó un reporte: hay que readoptar posición y conteo
static const unsigned long INTERVALO_CONSULTA_MS = 2500;

// Con el telar en marcha se reporta la posición cada segundo (no cada 2,5 s): si se corta la luz,
// lo guardado en el backend es lo que se retoma al volver, y así como mucho quedan ~5 pasadas
// atrás en vez de ~12. Además se reporta una vez más al detenerse, para que la pausa guarde la
// posición EXACTA.
static const unsigned long INTERVALO_REPORTE_MS = 1000;

// ============================================================================
//  Registro por el monitor serie
// ============================================================================
void log(const String& s) {
  if (LOG_SERIAL) Serial.println(s);
}

// ============================================================================
//  HTTP(S) con clave de dispositivo
// ============================================================================
static WiFiClientSecure clienteTls;

// Si un pedido falla por la conexión (código negativo), se cierra el socket TLS compartido: el
// próximo pedido abre uno nuevo en vez de reintentar sobre una conexión que el servidor ya cerró.
static void cerrarTlsSiFalla(int codigo) {
  if (codigo < 0) clienteTls.stop();
}

static bool iniciarHttp(HTTPClient& http, const String& url) {
  if (url.startsWith("https://")) {
#ifdef API_CA_CERT
    clienteTls.setCACert(API_CA_CERT);
#else
    clienteTls.setInsecure();   // cifra pero no verifica el servidor: ver config.h
#endif
    if (!http.begin(clienteTls, url)) return false;
  } else {
    if (!http.begin(url)) return false;
  }
  http.addHeader("X-Device-Key", DEVICE_KEY);
  return true;
}

static String urlTelar(const char* sufijo) {
  return String(API_BASE_URL) + "/api/telares/" + String(TELAR_ID) + sufijo;
}

// ============================================================================
//  Red
// ============================================================================
static bool intentarRed(const char* ssid, const char* pass) {
  if (ssid == nullptr || strlen(ssid) == 0) return false;
  log(String("Conectando a ") + ssid + "...");
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(ssid, pass);
  const unsigned long inicio = millis();   // resta, no suma: sigue bien cuando millis() da la vuelta (49 días)
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < (unsigned long)WIFI_ESPERA_SEG * 1000UL) {
    delay(400);
    esp_task_wdt_reset();
  }
  return WiFi.status() == WL_CONNECTED;
}

// Primero la red de la fábrica; si falla, el punto de acceso del celular.
void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // sin ahorro de energía: evita microcortes
  bool ok = intentarRed(WIFI_SSID, WIFI_PASSWORD);
  if (!ok) ok = intentarRed(WIFI_SSID_ALT, WIFI_PASSWORD_ALT);
  log(ok ? "Red conectada" : "Sin red: el sistema queda en reposo");
}

// ============================================================================
//  Bloque A: relés de Marcha, Pausa y Retroceder, y sensado de la botonera
//
//  Los pulsos y los avisos van en la tarea de red (núcleo 0), así un pulso de 300 ms no frena el
//  conteo de pasadas ni la aplicación de filas (núcleo 1).
//
//  Protecciones: arranque seguro (los relés no se mueven al encender), la primera lectura del
//  backend solo se memoriza (un reinicio no da un Marcha ni un Pausa que nadie pidió), anti-
//  doble-pulso, el sensado ignora el eco del propio relé, y sin red no se acciona nada.
// ============================================================================
static const unsigned long DURACION_PULSO_MS     = 300;   // "apretar el botón"
static const unsigned long MIN_ENTRE_COMANDOS_MS = 2000;  // anti-doble-pulso
static const unsigned long DEBOUNCE_BOTON_MS     = 400;   // rebotes del pulsador sensado
static const unsigned long IGNORAR_ECO_MS        = 800;   // el sensado ve el pulso del propio relé
static const unsigned long REINTENTO_AVISO_MS    = 3000;  // entre reintentos si el backend no responde
static const int           FALLOS_PARA_AVISAR    = 5;     // consultas fallidas seguidas = caída

int estadoDeseado = -1;           // -1 desconocido | 0 detenido | 1 tejiendo (lo último que ordenó el backend)
int retrocederSeqConocido = -1;   // -1 desconocido: no se pulsa hasta la primera lectura
unsigned long ultimoComando = 0;

volatile bool eventoMarchaPendiente     = false;
volatile bool eventoPausaPendiente      = false;
volatile bool eventoRetrocederPendiente = false;
volatile unsigned long ultimoEventoMarcha     = 0;
volatile unsigned long ultimoEventoPausa      = 0;
volatile unsigned long ultimoEventoRetroceder = 0;
volatile unsigned long ultimoPulsoMarcha      = 0;
volatile unsigned long ultimoPulsoPausa       = 0;
volatile unsigned long ultimoPulsoRetroceder  = 0;
unsigned long ultimoIntentoAviso = 0;

// Avisos de error del propio equipo (POST /api/errores), que se mandan al volver la red.
int           fallosConsecutivos = 0;
bool          caidaBackendMarcada = false;
unsigned long caidaBackendDesde = 0;
unsigned long wifiPerdidoDesde = 0;
String        errTitulo = "", errDetalle = "", errCodigo = "";
bool          errPendiente = false;
// Arranque en frío (corte de luz o traslado): se avisa para que "tejiendo" pase a "pausado".
bool          avisoReinicioPendiente = false;

int nivelActivo(int pin) {
  if (pin == PIN_RELE_MARCHA)     return RELE_MARCHA_ACTIVO_BAJO     ? LOW : HIGH;
  if (pin == PIN_RELE_PAUSA)      return RELE_PAUSA_ACTIVO_BAJO      ? LOW : HIGH;
  if (pin == PIN_RELE_RETROCEDER) return RELE_RETROCEDER_ACTIVO_BAJO ? LOW : HIGH;
  return LOW;
}
int nivelInactivo(int pin) { return nivelActivo(pin) == LOW ? HIGH : LOW; }

void encolarError(const String& codigo, const String& titulo, const String& detalle) {
  if (errPendiente) return;   // se conserva el más viejo
  errCodigo = codigo; errTitulo = titulo; errDetalle = detalle; errPendiente = true;
}

void IRAM_ATTR isrBotonMarcha() {
  const unsigned long ahora = millis();
  if (ahora - ultimoPulsoMarcha < IGNORAR_ECO_MS) return;   // eco del propio relé
  if (ahora - ultimoEventoMarcha >= DEBOUNCE_BOTON_MS) { ultimoEventoMarcha = ahora; eventoMarchaPendiente = true; }
}
void IRAM_ATTR isrBotonPausa() {
  const unsigned long ahora = millis();
  if (ahora - ultimoPulsoPausa < IGNORAR_ECO_MS) return;
  if (ahora - ultimoEventoPausa >= DEBOUNCE_BOTON_MS) { ultimoEventoPausa = ahora; eventoPausaPendiente = true; }
}
void IRAM_ATTR isrBotonRetroceder() {
  const unsigned long ahora = millis();
  if (ahora - ultimoPulsoRetroceder < IGNORAR_ECO_MS) return;
  if (ahora - ultimoEventoRetroceder >= DEBOUNCE_BOTON_MS) { ultimoEventoRetroceder = ahora; eventoRetrocederPendiente = true; }
}

// Arranque seguro: primero el nivel inactivo y recién después el pin como salida (al revés, el
// relé da un pulso fantasma al encender). Es lo primero que hace setup().
void botoneraIniciar() {
  digitalWrite(PIN_RELE_MARCHA,     nivelInactivo(PIN_RELE_MARCHA));
  digitalWrite(PIN_RELE_PAUSA,      nivelInactivo(PIN_RELE_PAUSA));
  digitalWrite(PIN_RELE_RETROCEDER, nivelInactivo(PIN_RELE_RETROCEDER));
  pinMode(PIN_RELE_MARCHA,     OUTPUT);
  pinMode(PIN_RELE_PAUSA,      OUTPUT);
  pinMode(PIN_RELE_RETROCEDER, OUTPUT);
  digitalWrite(PIN_RELE_MARCHA,     nivelInactivo(PIN_RELE_MARCHA));
  digitalWrite(PIN_RELE_PAUSA,      nivelInactivo(PIN_RELE_PAUSA));
  digitalWrite(PIN_RELE_RETROCEDER, nivelInactivo(PIN_RELE_RETROCEDER));
  // Pull-ups externas de 10 kΩ (el GPIO 34 no tiene interna).
  pinMode(PIN_BOTON_MARCHA,     INPUT);
  pinMode(PIN_BOTON_PAUSA,      INPUT);
  pinMode(PIN_BOTON_RETROCEDER, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_BOTON_MARCHA),     isrBotonMarcha,     FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BOTON_PAUSA),      isrBotonPausa,      FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BOTON_RETROCEDER), isrBotonRetroceder, FALLING);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
}

// Pulso de relé = apretar y soltar el botón. Duración fija: nunca queda pegado. Solo la tarea
// de red lo llama.
void pulsarRele(int pin) {
  const unsigned long ahora = millis();   // se anota ANTES: el sensado de ese botón va a ver el pulso
  if (pin == PIN_RELE_MARCHA)          ultimoPulsoMarcha     = ahora;
  else if (pin == PIN_RELE_PAUSA)      ultimoPulsoPausa      = ahora;
  else if (pin == PIN_RELE_RETROCEDER) ultimoPulsoRetroceder = ahora;
  digitalWrite(pin, nivelActivo(pin));
  esp_task_wdt_reset();
  vTaskDelay(pdMS_TO_TICKS(DURACION_PULSO_MS));
  digitalWrite(pin, nivelInactivo(pin));
  esp_task_wdt_reset();
}

// POST /evento-fisico: alguien usó un botón a mano (o el equipo arrancó en frío). Devuelve true
// si el backend lo recibió. Toma de la respuesta el estado en que quedó el telar, así la
// consulta siguiente no lo toma por una orden nueva y no da un pulso que nadie pidió.
bool reportarEventoFisico(const char* tipo) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  if (!iniciarHttp(http, urlTelar("/evento-fisico"))) return false;
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2000);
  JsonDocument doc;
  doc["tipo"] = tipo;
  String cuerpo;
  serializeJson(doc, cuerpo);
  const int codigo = http.POST(cuerpo);
  const String respuesta = (codigo == 200) ? http.getString() : String("");
  http.end();
  esp_task_wdt_reset();
  if (codigo != 200) {
    log(String("Error avisando el evento ") + tipo + ": HTTP " + String(codigo) + " (se reintenta)");
    cerrarTlsSiFalla(codigo);
    return false;
  }
  JsonDocument filtroResp;
  filtroResp["estado"] = true;
  JsonDocument resp;
  const char* estadoResp = nullptr;
  if (!deserializeJson(resp, respuesta, DeserializationOption::Filter(filtroResp))) estadoResp = resp["estado"];
  if (estadoResp != nullptr)            estadoDeseado = (strcmp(estadoResp, "tejiendo") == 0) ? 1 : 0;
  else if (strcmp(tipo, "marcha") == 0) estadoDeseado = 1;
  else if (strcmp(tipo, "pausa") == 0 || strcmp(tipo, "reinicio") == 0) estadoDeseado = 0;
  return true;
}

// POST /api/errores. Devuelve true si el backend lo recibió.
bool reportarError(const String& codigoError, const String& titulo, const String& detalle) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  if (!iniciarHttp(http, String(API_BASE_URL) + "/api/errores")) return false;
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  JsonDocument doc;
  doc["telar_id"] = TELAR_ID;
  doc["titulo"]   = titulo;
  doc["mensaje"]  = detalle;
  doc["codigo"]   = codigoError;
  String cuerpo;
  serializeJson(doc, cuerpo);
  const int codigo = http.POST(cuerpo);
  cerrarTlsSiFalla(codigo);
  http.end();
  esp_task_wdt_reset();
  return codigo == 200 || codigo == 201;
}

// Lo que ordena el backend en cada consulta: Marcha al pasar a "tejiendo", Pausa al dejar de
// estarlo, y un pulso de Retroceder por cada cambio de retroceder_seq. `listoParaArrancar` es
// false mientras el dibujo asignado no esté cargado: así la máquina no arranca tejiendo sin la
// selección. La orden queda para la consulta siguiente. Sin Nivel 2 siempre es true.
void botoneraAplicarEstado(const char* estado, long retrocederSeqAhora, bool listoParaArrancar) {
  const int deseadoAhora = (strcmp(estado, "tejiendo") == 0) ? 1 : 0;

  // Primera lectura tras el arranque: solo se memoriza, no se pulsa nada.
  if (estadoDeseado == -1) {
    estadoDeseado = deseadoAhora;
    if (retrocederSeqAhora >= 0) retrocederSeqConocido = retrocederSeqAhora;
    log(String("Estado inicial: ") + (deseadoAhora ? "tejiendo" : "detenido") + " (sin actuar)");
    return;
  }

  if (deseadoAhora != estadoDeseado) {
    if (millis() - ultimoComando < MIN_ENTRE_COMANDOS_MS) return;   // queda para la próxima consulta
    if (deseadoAhora == 1) {
      if (!listoParaArrancar) { log("Marcha en espera: falta cargar el dibujo"); return; }
      log("El backend pide TEJER: pulso en el relé de MARCHA");
      pulsarRele(PIN_RELE_MARCHA);
    } else {
      log("El backend pide DETENER: pulso en el relé de PAUSA");
      pulsarRele(PIN_RELE_PAUSA);
    }
    estadoDeseado = deseadoAhora;
    ultimoComando = millis();
  }

  if (retrocederSeqAhora < 0) return;
  if (retrocederSeqConocido < 0) { retrocederSeqConocido = retrocederSeqAhora; return; }
  if (retrocederSeqAhora != retrocederSeqConocido) {
    if (millis() - ultimoComando < MIN_ENTRE_COMANDOS_MS) return;   // primero Pausa, después Retroceder
    log("El backend pide RETROCEDER: pulso en el relé de RETROCEDER");
    pulsarRele(PIN_RELE_RETROCEDER);
    retrocederSeqConocido = retrocederSeqAhora;
    ultimoComando = millis();
  }
}

// Avisos pendientes: botones usados a mano, arranque en frío y errores del equipo. Espaciados:
// con el backend caído no se lo golpea cada 50 ms.
void botoneraDespacharAvisos() {
  if ((eventoMarchaPendiente || eventoPausaPendiente || eventoRetrocederPendiente) &&
      millis() - ultimoIntentoAviso >= REINTENTO_AVISO_MS) {
    ultimoIntentoAviso = millis();
    // La bandera se baja ANTES de enviar: una pulsación nueva durante el envío no se pierde.
    if (eventoMarchaPendiente) {
      eventoMarchaPendiente = false;
      log("Botonera: alguien apretó MARCHA");
      if (!reportarEventoFisico("marcha")) eventoMarchaPendiente = true;
    }
    if (eventoPausaPendiente) {
      eventoPausaPendiente = false;
      log("Botonera: alguien apretó PAUSA");
      if (!reportarEventoFisico("pausa")) eventoPausaPendiente = true;
    }
    if (eventoRetrocederPendiente) {
      eventoRetrocederPendiente = false;
      log("Botonera: alguien apretó RETROCEDER");
      if (!reportarEventoFisico("retroceder")) eventoRetrocederPendiente = true;
    }
  }
  if (avisoReinicioPendiente && estadoDeseado != -1 && millis() - ultimoIntentoAviso >= REINTENTO_AVISO_MS) {
    ultimoIntentoAviso = millis();
    log("Arranque en frío: se avisa al backend (el tejido queda en pausa, sin perder la posición)");
    if (reportarEventoFisico("reinicio")) avisoReinicioPendiente = false;
  }
  if (errPendiente && fallosConsecutivos == 0 && millis() - ultimoIntentoAviso >= REINTENTO_AVISO_MS) {
    ultimoIntentoAviso = millis();
    if (reportarError(errCodigo, errTitulo, errDetalle)) errPendiente = false;
  }
}

// ============================================================================
//  Traer el dibujo asignado al telar  (SOLO la tarea de red)
//
//  El backend devuelve la matriz tal como la guardó la aplicación. Una fila es
//  una pasada y cada celda es binaria: el canal se activa o no.
//
//  Junto con la matriz trae la posición de la producción abierta (fila y conteo). El nodo
//  SIEMPRE la adopta: el backend es la fuente de verdad. Si el dibujo es nuevo, la producción
//  nueva nace en la fila 0 con conteo 0, así que adoptarla equivale a "empezar de cero"; si es
//  el mismo trabajo que se retoma (reinicio, corte de luz), continúa donde quedó. Antes, un
//  cambio de dibujo detectado en la consulta descargaba con "retomar = falso": si la descarga del
//  arranque había fallado por la red, un trabajo a medias volvía a empezar desde la fila 0.
//
//  El dibujo se arma primero en un buffer aparte y recién al final se copia al
//  definitivo dentro de una sección crítica: el núcleo 1 nunca ve un dibujo a medias.
// ============================================================================
bool descargarDibujo() {
  esp_task_wdt_reset();
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  if (!iniciarHttp(http, urlTelar("/patron-actual"))) return false;
  http.setTimeout(5000);
  const int codigo = http.GET();

  if (codigo != 200) {
    log("No se pudo traer el dibujo, código " + String(codigo));
    cerrarTlsSiFalla(codigo);
    http.end();
    esp_task_wdt_reset();
    return false;
  }

  // ArduinoJson 7: el documento vive en el heap (no en la pila, que en esta tarea es finita:
  // 8 KB en la pila de loopTask desbordaban y reiniciaban la placa).
  // Límite explícito: un dibujo de 300 filas × 4 canales, con sus repeticiones, ocupa ~5 KB en JSON; 32 KB deja
  // margen de sobra y evita que un payload anómalo agote el heap (OOM) al parsear.
  static const size_t MAX_DIBUJO_BYTES = 32768;
  // Si el servidor anuncia más de lo permitido, se rechaza sin ni siquiera traer el cuerpo.
  const int tamAnunciado = http.getSize();
  if (tamAnunciado > (int)MAX_DIBUJO_BYTES) {
    log("Dibujo demasiado grande (" + String(tamAnunciado) + " bytes): se rechaza sin parsear");
    http.end();
    esp_task_wdt_reset();
    return false;
  }
  const String cuerpoDibujo = http.getString();
  http.end();
  esp_task_wdt_reset();
  // Segunda barrera (respuestas fragmentadas anuncian -1): si igual llegó de más, no se parsea.
  if (cuerpoDibujo.length() > MAX_DIBUJO_BYTES) {
    log("Dibujo demasiado grande (" + String(cuerpoDibujo.length()) + " bytes): se rechaza sin parsear");
    return false;
  }

  // El filtro deja pasar solo los campos que usa este nodo: el resto no ocupa RAM.
  JsonDocument filtroDibujo;
  filtroDibujo["matriz_pasadas"] = true;
  filtroDibujo["repeticiones_por_fila"] = true;
  filtroDibujo["fila_actual"] = true;
  filtroDibujo["pasadas_sensor"] = true;
  filtroDibujo["repeticion_en_fila"] = true;
  filtroDibujo["patron_id"] = true;
  filtroDibujo["historial_id"] = true;
  JsonDocument doc;
  const DeserializationError err =
      deserializeJson(doc, cuerpoDibujo, DeserializationOption::Filter(filtroDibujo));
  esp_task_wdt_reset();

  if (err) {
    log("El dibujo llegó con un formato que no se pudo leer");
    return false;
  }

  JsonArray matriz = doc["matriz_pasadas"].as<JsonArray>();
  if (matriz.isNull() || matriz.size() == 0) {
    log("El telar no tiene un dibujo asignado");
    hayDibujo = false;
    return false;
  }

  static bool nuevo[MAX_FILAS][N_CANALES];
  static int  nuevoRep[MAX_FILAS];
  const int filas = min((int)matriz.size(), MAX_FILAS);
  int columnas = 0;

  for (int f = 0; f < filas; f++) {
    JsonArray fila = matriz[f].as<JsonArray>();
    const int cols = min((int)fila.size(), N_CANALES);
    if (cols > columnas) columnas = cols;
    for (int c = 0; c < N_CANALES; c++) {
      // Cualquier valor mayor que cero se toma como activo, el mismo criterio que el backend
      // (matriz_ligamento) y la web. El editor solo genera ceros y unos, pero puede haber dibujos
      // viejos con otros valores. Se lee como número con decimales: con as<int>() un 0,5 se
      // truncaba a 0 y un número que no entra en un int daba 0, y esa bobina no se accionaba
      // aunque la web la mostrara marcada.
      nuevo[f][c] = (c < cols) ? (fila[c].as<float>() > 0.0f) : false;
    }
  }

  // Repeticiones. El backend siempre manda un número por fila, pero si faltara se
  // asume 1: una pasada por fila, que es el comportamiento anterior.
  JsonArray reps = doc["repeticiones_por_fila"].as<JsonArray>();
  for (int f = 0; f < filas; f++) {
    int r = (f < (int)reps.size()) ? reps[f].as<int>() : 1;
    nuevoRep[f] = (r >= 1) ? r : 1;
  }

  // Se adopta la posición guardada en el backend. Sin esto, un reinicio del nodo (corte de
  // luz, watchdog) haría empezar el dibujo desde la primera fila con la pieza a medio tejer,
  // dejando un salto visible. Si el dibujo es nuevo, el backend ya tiene la producción en la
  // fila 0 y en 0 pasadas, así que el resultado es el mismo que arrancar de cero.
  int filaInicial = 0;
  long pasadasIniciales = 0;
  const long filaGuardada = doc["fila_actual"] | -1L;
  if (filaGuardada >= 0 && filaGuardada < filas) filaInicial = (int)filaGuardada;
  // El contador también se retoma: si el nodo empezara de cero, sus reportes quedarían
  // por debajo del valor guardado hasta alcanzarlo.
  pasadasIniciales = doc["pasadas_sensor"] | 0L;

  portENTER_CRITICAL(&mux);
  memcpy(dibujo, nuevo, sizeof(dibujo));
  memcpy(repeticiones, nuevoRep, sizeof(repeticiones));
  dibujoFilas    = filas;
  dibujoColumnas = columnas;
  filaActual     = filaInicial;
  {
    // Se retoma la pasada exacta dentro de la fila (repeticion_en_fila), no el principio de la
    // fila. Solo si ese dato falta o no cuadra con las repeticiones de la fila se empieza por su
    // primera pasada: perder unas pocas repeticiones es preferible a saltearlas.
    const long hechas = doc["repeticion_en_fila"] | 0L;
    const int  restan = nuevoRep[filaInicial] - (int)hechas;
    repeticionesRestantes = (hechas >= 0 && restan >= 1 && restan <= nuevoRep[filaInicial])
                            ? restan : nuevoRep[filaInicial];
  }
  portEXIT_CRITICAL(&mux);

  // Un dibujo nuevo es una producción nueva en el backend (pasadas_sensor en 0): el
  // contador local tiene que arrancar de cero, o el primer reporte le cargaría a la pieza
  // nueva todas las pasadas de la anterior.
  sensorPasadaFijarTotal((unsigned long)pasadasIniciales);
  totalReportado = pasadasIniciales;   // es lo que el backend ya tiene

  // El id del dibujo se registra ACÁ, al cargarlo. Antes solo se registraba cuando la descarga
  // la había pedido el ciclo de consultas; la descarga del arranque no lo anotaba, y la
  // primera consulta creía que "cambió el dibujo" y lo volvía a bajar desde la fila 0,
  // anulando la posición recién retomada.
  patronCargado = doc["patron_id"] | 0L;
  produccionCargada = doc["historial_id"] | 0L;
  hayDibujo = true;

  long totalPasadas = 0;
  for (int f = 0; f < filas; f++) totalPasadas += nuevoRep[f];
  log("Dibujo cargado: " + String(filas) + " filas × " + String(columnas) +
      " canales, " + String(totalPasadas) + " pasadas por vuelta");
  if (filaInicial > 0) log("Se retoma la producción en la fila " + String(filaInicial + 1));
  if (pasadasIniciales > 0) log("Se retoma el conteo en " + String(pasadasIniciales) + " pasadas");
  return true;
}

// ============================================================================
//  Consultar si el telar tiene que estar tejiendo  (SOLO la tarea de red)
//  Se lee de /telares/{id}. El "?origen=" le dice al backend que la consulta viene de la placa
//  (no de alguien mirando la web): con "esp32" renueva el "ESP32 conectado"; con "nivel2" además
//  la señal de vida del sensor, que hace que la web deje de estimar las pasadas por tiempo.
// ============================================================================
void consultarEstado() {
  esp_task_wdt_reset();

  HTTPClient http;
  if (!iniciarHttp(http, urlTelar(NIVEL2_INSTALADO ? "?origen=nivel2" : "?origen=esp32"))) return;
  http.setTimeout(5000);
  const int codigo = http.GET();

  if (codigo == 200) {
    // Solo interesan unos pocos campos: el filtro evita gastar RAM en el resto.
    JsonDocument filtro;
    filtro["estado"] = true;
    filtro["patron_actual_id"] = true;
    filtro["retrocesos_contados"] = true;
    filtro["historial_actual_id"] = true;
    filtro["retroceder_seq"] = true;
    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, http.getString(), DeserializationOption::Filter(filtro));
    http.end();
    esp_task_wdt_reset();
    fallosConsecutivos = 0;
    if (caidaBackendMarcada) {
      caidaBackendMarcada = false;
      encolarError("BACKEND_SIN_RESPUESTA", "El backend no respondió al ESP32",
                   "Sin respuesta del backend durante unos " + String((millis() - caidaBackendDesde) / 1000) +
                   " s (o la clave del dispositivo era inválida). Durante ese tiempo no se accionó ningún relé.");
    }
    if (err) return;

    const char* estado = doc["estado"] | "apagado";
    bool debeTejer = (strcmp(estado, "tejiendo") == 0);

    if (!NIVEL2_INSTALADO) {
      // Solo el Bloque A: Marcha, Pausa y Retroceder según lo que pida el backend.
      botoneraAplicarEstado(estado, doc["retroceder_seq"] | -1L, true);
      esp_task_wdt_reset();
      return;
    }

    // ---- Retrocesos --------------------------------------------------------------
    // El backend cuenta CADA retroceso (desde la aplicación o desde la botonera, que sensa el
    // Bloque A de esta misma placa y avisa con evento-fisico) en retrocesos_contados.
    // Comparándolo con el último valor visto, se sabe cuántos hubo y se le avisa al sensor, que
    // descuenta esas pasadas. Se procesa ANTES de dar el pulso de Retroceder (más abajo): así el
    // aviso llega primero y el pulso del sensor se descuenta en vez de sumarse.
    //
    // (No se usa retroceder_seq: es la ORDEN de pulsar el relé de Retroceder y solo sube por
    // pedidos de la web, así que los retrocesos hechos en la botonera pasaban inadvertidos.)
    const long rc = doc["retrocesos_contados"] | -1L;
    if (rc >= 0) {
      if (retrocesosVisto < 0 || rc < retrocesosVisto) {
        retrocesosVisto = rc;   // primera lectura (o la base se reinició): referencia, sin disparar nada
      } else if (rc > retrocesosVisto) {
        const long cuantos = rc - retrocesosVisto;
        sensorPasadaAvisarRetroceso((int)cuantos, tejiendo);
        log("Retroceso detectado (" + String(cuantos) + "): se descuentan del conteo");
        retrocesosVisto = rc;
      }
    }

    // ---- Dibujo asignado ----------------------------------------------------------
    // Si desde la aplicación asignaron otro dibujo, hay que volver a bajarlo. Sin esto el nodo
    // seguiría tejiendo el anterior: la tela saldría con un patrón que nadie pidió y el
    // operario no tendría forma de notarlo hasta ver la pieza terminada.
    const long patronAhora = doc["patron_actual_id"] | 0L;
    // Una producción NUEVA del mismo dibujo (alguien tocó ⏹ y enseguida ▶, antes de que esta
    // placa viera el telar sin dibujo) también obliga a bajarlo: la producción nueva empieza en
    // la fila 0 con el conteo en 0. Antes solo se miraba el dibujo, y el nodo seguía con la
    // posición y el conteo del trabajo anterior, que la producción nueva heredaba.
    const long produccionAhora = doc["historial_actual_id"] | 0L;
    const bool otraProduccion = produccionAhora > 0 && produccionCargada > 0 && produccionAhora != produccionCargada;
    if (patronAhora == 0) {
      hayDibujo = false;     // sin dibujo asignado: el loop deja los canales en reposo
      debeTejer = false;
    } else if (patronAhora != patronCargado || otraProduccion) {
      log(otraProduccion ? "Empezó una producción nueva: se vuelve a bajar el dibujo desde el principio"
                         : "Cambió el dibujo asignado: se descarga el nuevo");
      hayDibujo = false;     // mientras tanto el loop deja los canales en reposo, no congelados
      if (!descargarDibujo()) {
        log("No se pudo descargar el dibujo nuevo: se reintenta en la próxima consulta");
      }
    } else if (!hayDibujo && debeTejer) {
      descargarDibujo();
    }

    // Si el sensor ya declaró la parada y el backend todavía no se enteró, no se vuelve a
    // poner "tejiendo" con lo que diga el backend hasta avisarle (ver tareaRed).
    const bool nuevoTejiendo = debeTejer && !avisoSinSenalPendiente;
    if (nuevoTejiendo != tejiendo) log(nuevoTejiendo ? "Arranca el tejido" : "Se detiene el tejido");
    tejiendo = nuevoTejiendo;   // el loop reacciona al cambio (apaga canales / inicia la gracia)

    // ---- Bloque A: Marcha, Pausa y Retroceder ----------------------------------------
    // Después del dibujo: con un dibujo nuevo, la máquina arranca recién con la selección cargada.
    botoneraAplicarEstado(estado, doc["retroceder_seq"] | -1L, patronAhora == 0 || hayDibujo);
  } else {
    log("Error consultando estado: HTTP " + String(codigo));
    if (codigo == 401) log("401: DEVICE_KEY no coincide con ESP32_DEVICE_KEY del backend");
    cerrarTlsSiFalla(codigo);
    http.end();
    if (++fallosConsecutivos >= FALLOS_PARA_AVISAR && !caidaBackendMarcada) {
      caidaBackendMarcada = true;
      caidaBackendDesde = millis();
    }
  }
  esp_task_wdt_reset();
}

// ============================================================================
//  Reportar el avance  (SOLO la tarea de red)
// ============================================================================
void reportarPasadas() {
  esp_task_wdt_reset();
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  if (!iniciarHttp(http, urlTelar("/pasadas"))) return;
  const unsigned long totalEnviado = sensorPasadaTotal();
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int filaAhora, hechasAhora;
  portENTER_CRITICAL(&mux);
  filaAhora = filaActual;
  // Cuántas pasadas de esta fila ya se tejieron. Se lee junto con la fila, en la
  // misma sección crítica: leídas por separado podrían corresponder a filas
  // distintas si el pulso llega entre las dos lecturas.
  hechasAhora = repeticiones[filaActual] - repeticionesRestantes;
  if (hechasAhora < 0) hechasAhora = 0;
  portEXIT_CRITICAL(&mux);

  JsonDocument doc;
  doc["pasadas_sensor"] = totalEnviado;   // va a pasadas_sensor: el conteo MEDIDO, no la estimación por reloj
  doc["fila_actual"]    = filaAhora;
  doc["repeticion_en_fila"] = hechasAhora;   // para reanudar en la pasada exacta
  String cuerpo;
  serializeJson(doc, cuerpo);

  const int codigo = http.POST(cuerpo);
  cerrarTlsSiFalla(codigo);
  if (codigo == 200) {
    // Si el backend descartó el reporte por ser mucho menor que lo guardado (el nodo se
    // reinició y volvió a contar de cero), devuelve el valor que tiene: el contador local se
    // reacomoda a él para que los próximos reportes sean válidos.
    JsonDocument resp;
    if (!deserializeJson(resp, http.getString())) {
      const bool aplicado = resp["aplicado"] | true;
      const long guardado = resp["pasadas_sensor"] | -1L;
      if (!aplicado && guardado >= 0) {
        // Se readoptan posición Y conteo (en tareaRed, con este pedido ya cerrado: comparten el
        // socket). Antes solo se corregía el conteo y la fila quedaba donde estaba: desde ahí
        // ningún reporte coincidía y el backend los rechazaba todos.
        sensorPasadaFijarTotal((unsigned long)guardado);
        totalReportado = guardado;
        volverABajarDibujo = true;
        log("El backend descartó el conteo (" + String(guardado) + " guardadas): se vuelven a bajar la posición y el conteo");
      } else {
        totalReportado = (long)totalEnviado;
      }
    }
  } else if (codigo > 0) {
    // Antes un rechazo se descartaba en silencio: si el backend dejaba de aceptar los
    // reportes (por ejemplo, una fila que no cuadra con el conteo), nadie se enteraba.
    // Queda en el monitor serie, que es lo que se mira al instalar.
    log("El backend rechazó el reporte de pasadas (código " + String(codigo) + "): " + http.getString());
  }
  http.end();
  esp_task_wdt_reset();
}

// Avisa al backend un evento del telar (hoy solo "sin_senal"): el sensor dejó de recibir pulsos
// con el telar en marcha, y la web deja de mostrar "tejiendo". Devuelve true si el backend lo recibió.
bool reportarSinSenal() {
  esp_task_wdt_reset();
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  if (!iniciarHttp(http, urlTelar("/evento-fisico"))) return false;
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  const int codigo = http.POST("{\"tipo\":\"sin_senal\"}");
  cerrarTlsSiFalla(codigo);
  http.end();
  esp_task_wdt_reset();
  return codigo == 200;
}

// ============================================================================
//  Tarea de red (núcleo 0)
// ============================================================================
void tareaRed(void* /*parametro*/) {
  esp_task_wdt_add(NULL);   // esta tarea también la vigila el watchdog
  unsigned long ultimaConsulta = 0;
  unsigned long ultimoReporte = 0;
  unsigned long ultimoIntentoBajar = 0;
  bool tejiendoAntes = false;
  bool primeraVez = true;

  for (;;) {
    esp_task_wdt_reset();

    if (WiFi.status() != WL_CONNECTED) {
      // Sin red no se acciona nada. Ante la duda, el
      // sistema no toca la máquina. El loop ve el cambio y apaga todos los canales; los relés
      // del Bloque A quedan sueltos y la botonera sigue funcionando a mano.
      digitalWrite(PIN_LED, LOW);
      if (wifiPerdidoDesde == 0) wifiPerdidoDesde = millis();
      if (tejiendo) {
        log("Se perdió la red: se apagan todos los canales");
        tejiendo = false;
      }
      conectarWifi();
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    digitalWrite(PIN_LED, HIGH);
    if (wifiPerdidoDesde != 0) {
      encolarError("WIFI_PERDIDO", "El ESP32 perdió la conexión Wi-Fi",
                   "Sin Wi-Fi durante unos " + String((millis() - wifiPerdidoDesde) / 1000) +
                   " s. Durante ese tiempo no se accionó ningún relé.");
      wifiPerdidoDesde = 0;
    }

    if (primeraVez) {
      // Al arrancar se retoma lo que haya quedado guardado en el backend.
      primeraVez = false;
      if (NIVEL2_INSTALADO) descargarDibujo();
    }

    // El backend descartó un reporte: se readoptan posición y conteo. Si la descarga falla se
    // reintenta al ritmo de las consultas (no en cada vuelta de 50 ms); sin dibujo asignado no
    // hace falta: la próxima carga ya adopta todo.
    if (volverABajarDibujo) {
      if (!hayDibujo) {
        volverABajarDibujo = false;
      } else if (millis() - ultimoIntentoBajar >= INTERVALO_CONSULTA_MS) {
        ultimoIntentoBajar = millis();
        if (descargarDibujo()) volverABajarDibujo = false;
      }
    }

    // El sensor declaró la parada: se avisa al backend hasta que lo confirme.
    if (avisoSinSenalPendiente && reportarSinSenal()) {
      avisoSinSenalPendiente = false;
      log("Parada avisada al backend");
    }

    if (millis() - ultimaConsulta >= INTERVALO_CONSULTA_MS) {
      ultimaConsulta = millis();
      consultarEstado();
    }

    // Botones usados a mano, arranque en frío y errores del equipo (Bloque A).
    botoneraDespacharAvisos();

    if (!NIVEL2_INSTALADO) {   // sin sensor no hay pasadas que reportar
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }

    // Se reporta mientras teje y una vez más justo al detenerse, para que la web quede con la
    // posición final exacta y no con la del reporte anterior. También con el telar en pausa si
    // el conteo cambió (por ejemplo, el operario retrocedió): antes eso recién llegaba al
    // backend al volver a tejer, y mientras tanto la web mostraba una posición vieja.
    const bool acabaDeDetenerse = tejiendoAntes && !tejiendo;
    const bool cambioEnPausa = hayDibujo && (long)sensorPasadaTotal() != totalReportado;
    // Sin dibujo cargado (por ejemplo, falló la descarga) no hay posición que informar: el
    // reporte llevaría una fila vieja y el backend lo rechazaría. Al cargarse, el conteo se
    // alinea con el del backend.
    if (hayDibujo && (tejiendo || tejiendoAntes || cambioEnPausa) &&
        (acabaDeDetenerse || millis() - ultimoReporte >= INTERVALO_REPORTE_MS)) {
      ultimoReporte = millis();
      reportarPasadas();
    }
    tejiendoAntes = tejiendo;

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ============================================================================
//  Setup
// ============================================================================
void setup() {
  // Primero las salidas en reposo, antes que cualquier otra cosa (incluida la espera del puerto
  // serie): los relés del Bloque A y los canales de selección no pueden moverse al encender.
  botoneraIniciar();
  seleccionIniciar();   // con o sin Nivel 2: deja los pines de los canales en reposo
  if (NIVEL2_INSTALADO) sensorPasadaIniciar();   // sin sensor, el pin 35 queda al aire

  if (LOG_SERIAL) {
    Serial.begin(BAUD_SERIAL);
    delay(300);
  }
  log("");
  log("=== Control de Inserción de Trama ===");
  if (!NIVEL2_INSTALADO) {
    log("Solo Bloque A: relés de Marcha, Pausa y Retroceder y sensado de la botonera");
  } else {
    log("Bloques A, C y D: botonera, sensor de pasada y selección del dibujo");
    log(MODO_BANCO ? "MODO BANCO: los pulsos se generan por software (NO instalar así)"
                   : "Modo normal: los pulsos vienen del sensor");
  }

  // Si el reinicio no fue un encendido normal, queda registrado en el backend. Un encendido
  // normal (corte de luz, traslado) se avisa como "reinicio": "tejiendo" pasa a "pausado".
  switch (esp_reset_reason()) {
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT:
    case ESP_RST_WDT:
      encolarError("REINICIO_WDT", "El ESP32 se reinició por watchdog",
                   "El programa se colgó y el watchdog lo reinició. Revisar red y alimentación.");
      break;
    case ESP_RST_BROWNOUT:
      encolarError("REINICIO_BROWNOUT", "El ESP32 se reinició por caída de tensión",
                   "Brownout: la alimentación cayó por debajo del mínimo. Revisar la fuente de 5 V.");
      break;
    case ESP_RST_PANIC:
      encolarError("REINICIO_PANIC", "El ESP32 se reinició por un error del programa",
                   "Panic (excepción no controlada). Revisar el monitor serie.");
      break;
    case ESP_RST_POWERON:
      avisoReinicioPendiente = true;
      break;
    default:
      break;
  }

  // Watchdog (core 3.x). Puede venir ya inicializado por el sistema: en ese caso se
  // reconfigura.
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = 15 * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  if (esp_task_wdt_init(&wdtConfig) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_reconfigure(&wdtConfig);
  }
  esp_task_wdt_add(NULL);

  conectarWifi();

  // Toda la red va al núcleo 0. loop() corre en el núcleo 1 y queda libre para el tiempo real.
  xTaskCreatePinnedToCore(tareaRed, "red", 20480, NULL, 1, NULL, 0);
}

// ============================================================================
//  Bucle principal (núcleo 1): tiempo real, sin esperar nunca a la red
// ============================================================================
void loop() {
  esp_task_wdt_reset();

  if (!NIVEL2_INSTALADO) {   // sin sensor ni selección: todo el trabajo lo hace la tarea de red
    delay(10);
    return;
  }

  const bool tej = tejiendo;
  const bool dib = hayDibujo;

  // En modo banco (sin sensor) se generan pulsos solo con el telar "tejiendo", como la máquina:
  // antes también en pausa, y en una prueba de mesa la posición seguía avanzando con el telar
  // pausado desde la web. Con MODO_BANCO en false no hace nada.
  if (tej) sensorPasadaSimular();
  sensorPasadaActualizar();       // libera la traba cuando la paleta pasó de largo
  seleccionSoltarSiCorresponde(); // suelta los canales pasada la duración de la selección

  // ---- cambios de estado que decidió la tarea de red ----
  static bool tejiendoAntes = false;
  static bool hayDibujoAntes = false;

  if (tej && !tejiendoAntes) {
    sensorPasadaMarcarArranque();   // empieza el período de gracia del sensor
  }
  if ((!tej && tejiendoAntes) || (!dib && hayDibujoAntes)) {
    // Se detuvo el tejido, se perdió la red o el dibujo dejó de ser válido: todos los canales
    // a reposo. Si se dejaran como estaban, quedarían congelados en la última fila aplicada y
    // el telar seguiría tejiendo esa misma combinación en cada pasada.
    seleccionApagarTodo();
  }
  tejiendoAntes = tej;
  hayDibujoAntes = dib;

  // Pulsos que se contaron como "adelante" pero resultaron ser el retroceso avisado tarde. El
  // contador ya se corrigió en dos (se quita el +1 y se resta 1): la posición hace lo mismo,
  // DOS pasadas atrás. Antes volvía una FILA entera, que con repeticiones no es lo mismo, y el
  // conteo y la fila dejaban de coincidir.
  int reclasificados = sensorPasadaTomarReclasificados();
  while (reclasificados-- > 0) {
    portENTER_CRITICAL(&mux);
    posicionAtras(filaActual, repeticionesRestantes, repeticiones, dibujoFilas);
    posicionAtras(filaActual, repeticionesRestantes, repeticiones, dibujoFilas);
    portEXIT_CRITICAL(&mux);
  }

  // ---- una pasada nueva ----
  bool pulsoFueRetroceso = false;
  if (sensorPasadaHuboPulso(&pulsoFueRetroceso)) {

    // Llegó un pulso pero el sistema no está tejiendo, o no hay dibujo cargado: la pasada se
    // cuenta igual (el contador vive en la interrupción), pero no se comanda nada.
    if (dib && dibujoFilas > 0) {
      if (tej) {
        // Se aplica la fila que corresponde a esta pasada. Todos los canales a la vez: las
        // columnas de una fila son simultáneas, no se recorren.
        //
        // DESPLAZAMIENTO_FILAS compensa filas enteras; RETARDO_APLICACION_US compensa un desfase
        // dentro de la pasada. Los dos quedan en cero hasta medir sobre la máquina.
        if (RETARDO_APLICACION_US > 0) delayMicroseconds(RETARDO_APLICACION_US);

        int filaAplicada, filasTotales, cambioA, restantes;
        portENTER_CRITICAL(&mux);
        filasTotales = dibujoFilas;
        filaAplicada = envolverFila(filaActual + DESPLAZAMIENTO_FILAS, filasTotales);
        // En un retroceso la máquina deshace una pasada: no se selecciona nada (los canales quedan
        // en reposo). Antes se aplicaba la fila de la PRÓXIMA pasada mientras la máquina deshacía la
        // anterior, que es otra combinación. Así lo modela también sim_nivel2_firmware.py.
        if (!pulsoFueRetroceso) seleccionAplicarFila(dibujo[filaAplicada], dibujoColumnas);

        // Avanzar o retroceder según el sentido del movimiento. En un retroceso el telar deshace
        // la última pasada, así que la fila tiene que volver atrás: la próxima pasada hacia
        // adelante debe repetir la misma fila que se acaba de deshacer.
        // Cada fila se teje tantas pasadas como diga repeticiones[]. Solo cuando se
        // agotan se pasa a la fila siguiente: una fila con 100 repeticiones son 100
        // pasadas de la misma combinación de bobinas.
        if (pulsoFueRetroceso) posicionAtras(filaActual, repeticionesRestantes, repeticiones, filasTotales);
        else                   posicionAdelante(filaActual, repeticionesRestantes, repeticiones, filasTotales);
        cambioA = filaActual;
        restantes = repeticionesRestantes;
        portEXIT_CRITICAL(&mux);

        if (pulsoFueRetroceso) {
          log("Pasada " + String(sensorPasadaTotal()) + " · retroceso: sin selección, la fila vuelve a " +
              String(cambioA + 1) + "/" + String(filasTotales));
        } else {
          log("Pasada " + String(sensorPasadaTotal()) +
              " · fila " + String(filaAplicada + 1) + "/" + String(filasTotales) +
              " (quedan " + String(restantes) + " de " + String(repeticiones[filaAplicada]) + ")" +
              " · " + seleccionEstadoTexto());
        }
      } else {
        // La máquina se movió sin que el sistema esté "tejiendo": un retroceso con el telar en
        // pausa (lo normal: el operario pausa y retrocede), o pasadas en los segundos que tarda
        // esta placa en enterarse de que alguien apretó Marcha a mano. No se comanda nada (los
        // canales quedan en reposo), pero la posición acompaña a la máquina. Antes solo seguía
        // a los retrocesos: las pasadas hacia adelante subían el conteo sin mover la fila, y
        // desde ahí el backend rechazaba todos los reportes (la fila no cuadraba con el conteo).
        portENTER_CRITICAL(&mux);
        if (pulsoFueRetroceso) posicionAtras(filaActual, repeticionesRestantes, repeticiones, dibujoFilas);
        else                   posicionAdelante(filaActual, repeticionesRestantes, repeticiones, dibujoFilas);
        portEXIT_CRITICAL(&mux);
      }
    }
  }

  // La selección se suelta sola pasado un porcentaje de la pasada (seleccionSoltarSiCorresponde, al
  // principio del ciclo), y el pulso siguiente la vuelve a aplicar. Así reproduce el papel, que
  // entre dos agujeros seguidos de la misma columna tiene papel: un agujero por pasada. Antes se
  // mantenía hasta el pulso siguiente, y una fila con 25 repeticiones era, para la máquina, un
  // solo agujero largo en lugar de 25.

  // ---- el telar dejó de dar pulsos ----
  // La máquina se frenó o el sensor dejó de detectar. Se apagan los canales y se avisa al
  // backend (tareaRed), que pasa el telar a "pausado" con el motivo sin_senal. Mientras el
  // aviso no llegue, la tarea de red no vuelve a poner "tejiendo" con lo que diga el backend.
  if (tej && sensorPasadaSinSenal()) {
    log("No llegan pulsos del sensor: se apagan los canales y se avisa al backend");
    seleccionApagarTodo();
    avisoSinSenalPendiente = true;
    tejiendo = false;
  }

  delay(1);   // antes 5 ms: la latencia entre el pulso y la aplicación de la fila es de esta magnitud
}
