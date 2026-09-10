// ============================================================================
//  Control de Inserción de Trama, Nivel 2
//  Conteo de pasadas (Bloque C) y selección del dibujo (Bloque D)
//
//  Equipo N.º 5 · 7mo Informática · Instituto Leonardo Murialdo · 2026
//
//  ESTADO: en desarrollo. No está instalado en la máquina.
//  El firmware que hoy corre en el telar es el del Nivel 1, en
//  esp32/control_trama_esp32/. Los dos son proyectos separados a propósito.
//
//  Cómo funciona, en una línea: el sensor avisa que empezó una pasada nueva y
//  el programa aplica en ese momento la fila del dibujo que corresponda.
// ============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

#include "config_nivel2.h"
#include "sensor_pasada.h"
#include "seleccion_dibujo.h"

// ---------------------------------------------------------------- El dibujo
// La matriz que se está tejiendo. Cada fila es una pasada; sus columnas son
// los canales que se activan al mismo tiempo.
static const int MAX_FILAS = 32;
bool  dibujo[MAX_FILAS][N_CANALES];
int   dibujoFilas   = 0;
int   dibujoColumnas = 0;
int   filaActual    = 0;
bool  tejiendo      = false;
bool  hayDibujo     = false;

unsigned long ultimaConsulta = 0;
const unsigned long INTERVALO_CONSULTA_MS = 2500;

// ============================================================================
//  Registro por el monitor serie
// ============================================================================
void log(const String& s) {
  if (LOG_SERIAL) Serial.println(s);
}

// ============================================================================
//  Red
// ============================================================================
void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  log("Conectando a la red...");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(400);
    esp_task_wdt_reset();
  }
  log(WiFi.status() == WL_CONNECTED ? "Red conectada" : "Sin red: el sistema queda en reposo");
}

// ============================================================================
//  Traer el dibujo asignado al telar
//
//  El backend devuelve la matriz tal como la guardó la aplicación. Una fila es
//  una pasada y cada celda es binaria: el canal se activa o no.
// ============================================================================
bool descargarDibujo() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(String(API_BASE) + "/telares/" + String(TELAR_ID) + "/patron-actual");
  http.setTimeout(8000);
  const int codigo = http.GET();

  if (codigo != 200) {
    log("No se pudo traer el dibujo, código " + String(codigo));
    http.end();
    return false;
  }

  StaticJsonDocument<8192> doc;
  const DeserializationError err = deserializeJson(doc, http.getString());
  http.end();

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

  dibujoFilas    = min((int)matriz.size(), MAX_FILAS);
  dibujoColumnas = 0;

  for (int f = 0; f < dibujoFilas; f++) {
    JsonArray fila = matriz[f].as<JsonArray>();
    const int cols = min((int)fila.size(), N_CANALES);
    if (cols > dibujoColumnas) dibujoColumnas = cols;
    for (int c = 0; c < N_CANALES; c++) {
      // Cualquier valor distinto de cero se toma como activo. El editor solo
      // genera ceros y unos, pero puede haber dibujos viejos con otros valores.
      dibujo[f][c] = (c < cols) ? (fila[c].as<int>() != 0) : false;
    }
  }

  hayDibujo = true;
  log("Dibujo cargado: " + String(dibujoFilas) + " pasadas × " +
      String(dibujoColumnas) + " canales");
  return true;
}

// ============================================================================
//  Consultar si el telar tiene que estar tejiendo
//  Se lee de /telares/{id}, el mismo endpoint que usa el firmware del Nivel 1.
// ============================================================================
void consultarEstado() {
  if (WiFi.status() != WL_CONNECTED) {
    // Sin red no se acciona nada. El criterio es el mismo del Nivel 1: ante la
    // duda, el sistema no toca la máquina.
    if (tejiendo) {
      log("Se perdió la red: se apagan todos los canales");
      tejiendo = false;
      seleccionApagarTodo();
    }
    return;
  }

  HTTPClient http;
  http.begin(String(API_BASE) + "/telares/" + String(TELAR_ID));
  http.setTimeout(6000);
  const int codigo = http.GET();

  if (codigo == 200) {
    StaticJsonDocument<512> doc;
    if (!deserializeJson(doc, http.getString())) {
      const String estado = doc["estado"] | "detenido";
      const bool debeTejer = (estado == "tejiendo");

      if (debeTejer && !tejiendo) {
        log("Arranca el tejido");
        if (!hayDibujo) descargarDibujo();
      } else if (!debeTejer && tejiendo) {
        log("Se detiene el tejido");
        seleccionApagarTodo();
      }
      tejiendo = debeTejer;
    }
  }
  http.end();
}

// ============================================================================
//  Reportar el avance
// ============================================================================
void reportarPasadas(unsigned long total) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(String(API_BASE) + "/telares/" + String(TELAR_ID) + "/pasadas");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(6000);

  StaticJsonDocument<192> doc;
  doc["pasadas_totales"] = total;
  doc["fila_actual"]     = filaActual;
  String cuerpo;
  serializeJson(doc, cuerpo);

  http.POST(cuerpo);
  http.end();
}

// ============================================================================
//  Setup
// ============================================================================
void setup() {
  if (LOG_SERIAL) {
    Serial.begin(BAUD_SERIAL);
    delay(300);
  }
  log("");
  log("=== Nivel 2, Control de Inserción de Trama ===");
  log(MODO_BANCO ? "MODO BANCO: los pulsos se generan por software"
                 : "Modo normal: los pulsos vienen del sensor");

  // Primero las salidas en reposo, antes que cualquier otra cosa.
  seleccionIniciar();
  sensorPasadaIniciar();

  esp_task_wdt_init(15, true);
  esp_task_wdt_add(NULL);

  conectarWifi();
  descargarDibujo();
}

// ============================================================================
//  Bucle principal
// ============================================================================
void loop() {
  esp_task_wdt_reset();

  sensorPasadaSimular();          // no hace nada si MODO_BANCO es false

  // ---- consulta periódica al backend ----
  if (millis() - ultimaConsulta >= INTERVALO_CONSULTA_MS) {
    ultimaConsulta = millis();
    consultarEstado();
    if (tejiendo) reportarPasadas(sensorPasadaTotal());
  }

  // ---- una pasada nueva ----
  if (sensorPasadaHuboPulso()) {

    if (!tejiendo || !hayDibujo) {
      // Llegó un pulso pero el sistema no está tejiendo: la máquina se está
      // moviendo por la botonera. Se cuenta la pasada, pero no se toca nada.
      return;
    }

    // Se aplica la fila que corresponde a esta pasada. Todos los canales a la
    // vez: las columnas de una fila son simultáneas, no se recorren.
    seleccionAplicarFila(dibujo[filaActual], dibujoColumnas);
    log("Pasada " + String(sensorPasadaTotal()) +
        " · fila " + String(filaActual + 1) + "/" + String(dibujoFilas) +
        " · " + seleccionEstadoTexto());

    // Avanzar a la siguiente. Al llegar al final se vuelve al principio: el
    // dibujo se repite en bucle, como la cinta de papel.
    filaActual++;
    if (filaActual >= dibujoFilas) {
      filaActual = 0;
      log("Vuelta completa del dibujo");
    }
  }

  // ---- la señal se mantiene un rato y después se libera ----
  static unsigned long aplicadaEn = 0;
  if (tejiendo && aplicadaEn == 0 && sensorPasadaTotal() > 0) {
    aplicadaEn = millis();
  }
  if (aplicadaEn > 0 && millis() - aplicadaEn >= DURACION_SELECCION_MS) {
    aplicadaEn = 0;
  }

  // ---- el telar dejó de dar pulsos ----
  if (tejiendo && sensorPasadaSinSenal()) {
    log("No llegan pulsos del sensor: se apagan los canales por precaución");
    seleccionApagarTodo();
    tejiendo = false;
  }

  delay(5);
}
