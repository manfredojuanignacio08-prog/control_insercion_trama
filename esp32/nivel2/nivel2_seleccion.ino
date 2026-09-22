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
//
//  ARQUITECTURA: DOS NÚCLEOS. Es lo más importante de este archivo.
//   - Núcleo 1, loop(): TIEMPO REAL. Solo cuenta pulsos del sensor y aplica filas.
//     Nunca espera a la red: cada iteración dura ~1 ms.
//   - Núcleo 0, tareaRed(): TODA la red (consultas al backend, descarga del dibujo,
//     reporte de pasadas). Puede tardar segundos sin afectar al núcleo 1.
//
//  Antes todo corría en loop(): una consulta lenta (hasta 6 s) o una descarga (hasta
//  8 s) detenían el conteo y la aplicación de filas. A 5 pasadas por segundo eso eran
//  hasta 30 pasadas tejidas con la fila anterior congelada en los relés, y un conteo
//  corrido. Ahora los dos núcleos comparten unas pocas variables (marcadas volatile o
//  protegidas con una sección crítica) y nada más.
//
//  Librerías (mismas versiones que el Nivel 1): core ESP32 de Espressif 3.x (IDF 5) y
//  ArduinoJson 7.x. Con un solo entorno de Arduino IDE los dos firmwares compilan.
// ============================================================================

#include <WiFi.h>
#include <string.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>

#include "config_nivel2.h"
#include "sensor_pasada.h"
#include "seleccion_dibujo.h"

// ---------------------------------------------------------------- El dibujo
// La matriz que se está tejiendo. Cada fila es una pasada; sus columnas son
// los canales que se activan al mismo tiempo.
//
// dibujo, dibujoFilas, dibujoColumnas y filaActual los tocan los dos núcleos: siempre
// dentro de una sección crítica (mux).
static const int MAX_FILAS = 32;
bool  dibujo[MAX_FILAS][N_CANALES];
int   dibujoFilas    = 0;
int   dibujoColumnas = 0;
int   filaActual     = 0;
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

// Estado compartido entre núcleos (una sola escritura por variable):
volatile bool tejiendo   = false;   // lo pone la red (según el backend); lo limpia el loop al perder señal
volatile bool hayDibujo  = false;   // lo pone la red
volatile bool avisoSinSenalPendiente = false;   // lo pone el loop; lo limpia la red al avisar al backend

// Solo lo usa la tarea de red:
long  retrocesosVisto = -1;   // último valor de retrocesos_contados; -1 = todavía no se leyó ninguno
long  patronCargado   = 0;    // id del dibujo que está en memoria (para detectar que asignaron otro)
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
//  HTTP(S) con clave de dispositivo (igual que en el Nivel 1)
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
    clienteTls.setInsecure();   // cifra pero no verifica el servidor: ver config.h del Nivel 1
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
  bool ok = intentarRed(WIFI_SSID, WIFI_PASSWORD);
  if (!ok) ok = intentarRed(WIFI_SSID_ALT, WIFI_PASSWORD_ALT);
  log(ok ? "Red conectada" : "Sin red: el sistema queda en reposo");
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
  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
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
  const int filas = min((int)matriz.size(), MAX_FILAS);
  int columnas = 0;

  for (int f = 0; f < filas; f++) {
    JsonArray fila = matriz[f].as<JsonArray>();
    const int cols = min((int)fila.size(), N_CANALES);
    if (cols > columnas) columnas = cols;
    for (int c = 0; c < N_CANALES; c++) {
      // Cualquier valor distinto de cero se toma como activo. El editor solo
      // genera ceros y unos, pero puede haber dibujos viejos con otros valores.
      nuevo[f][c] = (c < cols) ? (fila[c].as<int>() != 0) : false;
    }
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
  dibujoFilas    = filas;
  dibujoColumnas = columnas;
  filaActual     = filaInicial;
  portEXIT_CRITICAL(&mux);

  // Un dibujo nuevo es una producción nueva en el backend (pasadas_sensor en 0): el
  // contador local tiene que arrancar de cero, o el primer reporte le cargaría a la pieza
  // nueva todas las pasadas de la anterior.
  sensorPasadaFijarTotal((unsigned long)pasadasIniciales);

  // El id del dibujo se registra ACÁ, al cargarlo. Antes solo se registraba cuando la descarga
  // la había pedido el ciclo de consultas; la descarga del arranque no lo anotaba, y la
  // primera consulta creía que "cambió el dibujo" y lo volvía a bajar desde la fila 0,
  // anulando la posición recién retomada.
  patronCargado = doc["patron_id"] | 0L;
  hayDibujo = true;

  log("Dibujo cargado: " + String(filas) + " pasadas × " + String(columnas) + " canales");
  if (filaInicial > 0) log("Se retoma la producción en la fila " + String(filaInicial + 1));
  if (pasadasIniciales > 0) log("Se retoma el conteo en " + String(pasadasIniciales) + " pasadas");
  return true;
}

// ============================================================================
//  Consultar si el telar tiene que estar tejiendo  (SOLO la tarea de red)
//  Se lee de /telares/{id}, el mismo endpoint que usa el firmware del Nivel 1.
// ============================================================================
void consultarEstado() {
  esp_task_wdt_reset();

  HTTPClient http;
  if (!iniciarHttp(http, urlTelar("?origen=nivel2"))) return;
  http.setTimeout(5000);
  const int codigo = http.GET();

  if (codigo == 200) {
    // Solo interesan unos pocos campos: el filtro evita gastar RAM en el resto.
    JsonDocument filtro;
    filtro["estado"] = true;
    filtro["patron_actual_id"] = true;
    filtro["retrocesos_contados"] = true;
    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, http.getString(), DeserializationOption::Filter(filtro));
    http.end();
    esp_task_wdt_reset();
    if (err) return;

    const char* estado = doc["estado"] | "apagado";
    bool debeTejer = (strcmp(estado, "tejiendo") == 0);

    // ---- Retrocesos --------------------------------------------------------------
    // El Nivel 2 corre en su propia placa y no sensa la botonera: eso es del Bloque A. Pero el
    // backend cuenta CADA retroceso (desde la aplicación o desde el botón físico) en
    // retrocesos_contados. Comparándolo con el último valor visto, esta placa sabe cuántos
    // hubo y le avisa al sensor, que descuenta esas pasadas.
    //
    // (No se usa retroceder_seq: es la ORDEN que la web le da al Nivel 1 y solo sube por
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
    if (patronAhora == 0) {
      hayDibujo = false;     // sin dibujo asignado: el loop deja los canales en reposo
      debeTejer = false;
    } else if (patronAhora != patronCargado) {
      log("Cambió el dibujo asignado: se descarga el nuevo");
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
  } else {
    log("Error consultando estado: HTTP " + String(codigo));
    cerrarTlsSiFalla(codigo);
    http.end();
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
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int filaAhora;
  portENTER_CRITICAL(&mux);
  filaAhora = filaActual;
  portEXIT_CRITICAL(&mux);

  JsonDocument doc;
  doc["pasadas_sensor"] = sensorPasadaTotal();   // va a pasadas_sensor: el conteo MEDIDO, no la estimación por reloj
  doc["fila_actual"]    = filaAhora;
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
        sensorPasadaFijarTotal((unsigned long)guardado);
        log("El conteo local se reacomodó al del backend: " + String(guardado));
      }
    }
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
  bool tejiendoAntes = false;
  bool primeraVez = true;

  for (;;) {
    esp_task_wdt_reset();

    if (WiFi.status() != WL_CONNECTED) {
      // Sin red no se acciona nada. El criterio es el mismo del Nivel 1: ante la duda, el
      // sistema no toca la máquina. El loop ve el cambio y apaga todos los canales.
      if (tejiendo) {
        log("Se perdió la red: se apagan todos los canales");
        tejiendo = false;
      }
      conectarWifi();
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (primeraVez) {
      // Al arrancar se retoma lo que haya quedado guardado en el backend.
      primeraVez = false;
      descargarDibujo();
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

    // Se reporta mientras teje y una vez más justo al detenerse, para que la web quede con la
    // posición final exacta y no con la del reporte anterior.
    const bool acabaDeDetenerse = tejiendoAntes && !tejiendo;
    if ((tejiendo || tejiendoAntes) && (acabaDeDetenerse || millis() - ultimoReporte >= INTERVALO_REPORTE_MS)) {
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
  if (LOG_SERIAL) {
    Serial.begin(BAUD_SERIAL);
    delay(300);
  }
  log("");
  log("=== Nivel 2, Control de Inserción de Trama ===");
  log(MODO_BANCO ? "MODO BANCO: los pulsos se generan por software (NO instalar así)"
                 : "Modo normal: los pulsos vienen del sensor");

  // Primero las salidas en reposo, antes que cualquier otra cosa.
  seleccionIniciar();
  sensorPasadaIniciar();

  // Watchdog (core 3.x). Puede venir ya inicializado por el sistema: en ese caso se
  // reconfigura. Es el mismo bloque que usa el Nivel 1.
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
static inline int envolver(int fila, int filas) {
  int r = fila % filas;
  return (r < 0) ? r + filas : r;   // el módulo de C conserva el signo
}

void loop() {
  esp_task_wdt_reset();

  sensorPasadaSimular();          // no hace nada si MODO_BANCO es false
  sensorPasadaActualizar();       // libera la traba cuando la paleta pasó de largo

  // ---- cambios de estado que decidió la tarea de red ----
  static bool tejiendoAntes = false;
  static bool hayDibujoAntes = false;
  const bool tej = tejiendo;
  const bool dib = hayDibujo;

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

  // Pulsos que se contaron como "adelante" pero resultaron ser el retroceso avisado tarde:
  // la fila del dibujo vuelve una hacia atrás por cada uno.
  int reclasificados = sensorPasadaTomarReclasificados();
  while (reclasificados-- > 0) {
    portENTER_CRITICAL(&mux);
    if (dibujoFilas > 0) filaActual = envolver(filaActual - 1, dibujoFilas);
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

        int filaAplicada, filasTotales, cambioA;
        portENTER_CRITICAL(&mux);
        filasTotales = dibujoFilas;
        filaAplicada = envolver(filaActual + DESPLAZAMIENTO_FILAS, filasTotales);
        seleccionAplicarFila(dibujo[filaAplicada], dibujoColumnas);

        // Avanzar o retroceder según el sentido del movimiento. En un retroceso el telar deshace
        // la última pasada, así que la fila tiene que volver atrás: la próxima pasada hacia
        // adelante debe repetir la misma fila que se acaba de deshacer.
        filaActual = envolver(filaActual + (pulsoFueRetroceso ? -1 : 1), filasTotales);
        cambioA = filaActual;
        portEXIT_CRITICAL(&mux);

        log("Pasada " + String(sensorPasadaTotal()) +
            " · fila " + String(filaAplicada + 1) + "/" + String(filasTotales) +
            " · " + seleccionEstadoTexto() +
            (pulsoFueRetroceso ? String(" · retroceso, la fila vuelve a ") + String(cambioA + 1) : String("")));
      } else if (pulsoFueRetroceso) {
        // Retroceso con el telar en pausa (lo normal: el operario pausa y retrocede). No se
        // comanda nada, pero la fila del dibujo tiene que acompañar a la máquina.
        portENTER_CRITICAL(&mux);
        filaActual = envolver(filaActual - 1, dibujoFilas);
        portEXIT_CRITICAL(&mux);
      }
    }
  }

  // La señal NO se libera por tiempo: se mantiene hasta el pulso siguiente, que es cuando
  // seleccionAplicarFila() escribe la fila nueva. Así reproduce lo que hacía el agujero del
  // papel, que permanecía frente al lector toda la pasada.

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
