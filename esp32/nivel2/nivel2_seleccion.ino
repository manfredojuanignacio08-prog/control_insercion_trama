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
#include <string.h>
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

// Último valor visto de retroceder_seq. En -1 mientras no se leyó ninguno, para
// no interpretar la primera lectura como un retroceso.
long  retrocederSeqVisto = -1;

// Id del dibujo que está cargado en memoria. Sirve para detectar que desde la
// aplicación asignaron otro y hay que volver a descargarlo.
long  patronCargado = 0;
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
static bool intentarRed(const char* ssid, const char* pass) {
  if (ssid == nullptr || strlen(ssid) == 0) return false;
  log(String("Conectando a ") + ssid + "...");
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(ssid, pass);
  const unsigned long limite = millis() + (unsigned long)WIFI_ESPERA_SEG * 1000UL;
  while (WiFi.status() != WL_CONNECTED && millis() < limite) {
    delay(400);
    esp_task_wdt_reset();
  }
  return WiFi.status() == WL_CONNECTED;
}

// Primero la red de la fábrica; si falla, el punto de acceso del celular.
void conectarWifi() {
  WiFi.mode(WIFI_STA);
  bool ok = intentarRed(WIFI_SSID, WIFI_PASS);
  if (!ok) ok = intentarRed(WIFI_SSID_ALT, WIFI_PASS_ALT);
  log(ok ? "Red conectada" : "Sin red: el sistema queda en reposo");
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

      // El Nivel 2 corre en su propia placa y no sensa la botonera: esa parte es
      // del Bloque A. Pero el backend sí registra cada Retroceder, venga de la
      // aplicación o del botón físico, y lleva un contador que se incrementa con
      // cada uno (retroceder_seq, migración 007).
      //
      // Comparando ese contador contra el último valor visto, esta placa se
      // entera de que hubo un retroceso y le avisa al sensor, que descuenta la
      // pasada y hace volver atrás la fila del dibujo en lugar de avanzarla.
      const long seqActual = doc["retroceder_seq"] | 0L;
      if (retrocederSeqVisto < 0) {
        // Primera lectura: se toma como referencia, sin disparar nada.
        retrocederSeqVisto = seqActual;
      } else if (seqActual > retrocederSeqVisto) {
        const long cuantos = seqActual - retrocederSeqVisto;
        for (long k = 0; k < cuantos; k++) sensorPasadaAvisarRetroceso();
        log("Retroceso detectado (" + String(cuantos) + "): el próximo pulso descuenta");
        retrocederSeqVisto = seqActual;
      }

      // Si desde la aplicación asignaron otro dibujo, hay que volver a bajarlo.
      // Sin esto el nodo seguiría tejiendo el anterior: la tela saldría con un
      // patrón que nadie pidió y el operario no tendría forma de notarlo hasta
      // ver la pieza terminada.
      const long patronAhora = doc["patron_actual_id"] | 0L;
      if (patronAhora != 0 && patronAhora != patronCargado) {
        log("Cambió el dibujo asignado: se descarga el nuevo");
        hayDibujo = false;
        filaActual = 0;      // el dibujo nuevo arranca desde su primera fila

        // Mientras no haya un dibujo válido cargado, las salidas van a reposo.
        // Si se dejaran como estaban, los canales quedarían congelados en la
        // última fila aplicada y el telar seguiría tejiendo esa misma
        // combinación en cada pasada, hasta que la descarga tuviera éxito.
        seleccionApagarTodo();

        if (descargarDibujo()) {
          patronCargado = patronAhora;
        } else {
          log("No se pudo descargar el dibujo nuevo: se reintenta en la próxima consulta");
        }
      }

      if (debeTejer && !tejiendo) {
        log("Arranca el tejido");
        if (!hayDibujo && descargarDibujo()) patronCargado = patronAhora;
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
  sensorPasadaActualizar();       // libera la traba cuando la paleta pasó de largo

  // ---- consulta periódica al backend ----
  if (millis() - ultimaConsulta >= INTERVALO_CONSULTA_MS) {
    ultimaConsulta = millis();
    consultarEstado();
    if (tejiendo) reportarPasadas(sensorPasadaTotal());
  }

  // ---- una pasada nueva ----
  bool pulsoFueRetroceso = false;
  if (sensorPasadaHuboPulso(&pulsoFueRetroceso)) {

    // Llegó un pulso pero el sistema no está tejiendo, o no hay dibujo cargado:
    // la pasada se cuenta igual (el contador vive en la interrupción), pero no
    // se comanda nada. Se usa una condición en lugar de un return para no
    // saltear lo que viene después en el bucle.
    if (tejiendo && hayDibujo) {

    // Se aplica la fila que corresponde a esta pasada. Todos los canales a la
    // vez: las columnas de una fila son simultáneas, no se recorren.
    //
    // DESPLAZAMIENTO_FILAS compensa el desfase entre el pulso del sensor y el
    // instante en que el telar lee la selección. Queda en cero hasta que la
    // primera prueba de tejido diga si hace falta corregir.
    int filaAplicar = (filaActual + DESPLAZAMIENTO_FILAS) % dibujoFilas;
    if (filaAplicar < 0) filaAplicar += dibujoFilas;   // el módulo de C conserva el signo

    seleccionAplicarFila(dibujo[filaAplicar], dibujoColumnas);
    log("Pasada " + String(sensorPasadaTotal()) +
        " · fila " + String(filaAplicar + 1) + "/" + String(dibujoFilas) +
        " · " + seleccionEstadoTexto());

    // Avanzar o retroceder según el sentido del movimiento.
    //
    // En un retroceso el telar deshace la última pasada, así que la fila tiene
    // que volver atrás: la próxima pasada hacia adelante debe repetir la misma
    // fila que se acaba de deshacer. Si en cambio avanzara, el dibujo quedaría
    // dos filas adelantado respecto de la tela por cada retroceso.
    if (pulsoFueRetroceso) {
      filaActual--;
      if (filaActual < 0) filaActual = dibujoFilas - 1;
      log("Retroceso: la fila vuelve a " + String(filaActual + 1));
    } else {
      filaActual++;
      if (filaActual >= dibujoFilas) {
        filaActual = 0;
        log("Vuelta completa del dibujo");
      }
    }
    }
  }

  // La señal NO se libera por tiempo: se mantiene hasta el pulso siguiente, que
  // es cuando seleccionAplicarFila() escribe la fila nueva. Así reproduce lo que
  // hacía el agujero del papel, que permanecía frente al lector toda la pasada.
  // Los canales solo se apagan al pausar, al perder la red o al quedarse sin
  // pulsos del sensor.

  // ---- el telar dejó de dar pulsos ----
  if (tejiendo && sensorPasadaSinSenal()) {
    log("No llegan pulsos del sensor: se apagan los canales por precaución");
    seleccionApagarTodo();
    tejiendo = false;
  }

  delay(5);
}
