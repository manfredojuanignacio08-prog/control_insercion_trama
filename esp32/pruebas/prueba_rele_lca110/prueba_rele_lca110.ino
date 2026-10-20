// ============================================================================
//  Prueba de mesa de UN relé LCA110 (Bloque D), sin red, sin backend y sin telar
//
//  Sirve para comprobar el relé y su cableado antes de usar el firmware con NIVEL2_INSTALADO en true.
//  No necesita WiFi, la clave del dispositivo ni la aplicación web: solo el ESP32 por USB.
//
//  Conexión (la misma de un canal definitivo, ver Guia_Conexion_Reles_LCA110.docx):
//    Lado del ESP32:  GPIO 18 → resistencia de 330 Ω → pata 1 del relé
//                     pata 2 → GND del ESP32
//                     resistencia de 10 kΩ entre GPIO 18 y GND (arranque seguro)
//                     patas 3 y 5 sin conectar
//    Lado de salida:  pila (+) → resistencia → LED (pata larga) → LED (pata corta) → pata 4
//                     pata 6 → pila (−)
//                     (pila de 9 V con 680 Ω, o dos pilas AA con 100 Ω)
//    Nunca unir el GND del ESP32 con la pila de la salida: los dos lados van separados.
//
//  Qué hace: imita al telar a 300 pasadas por minuto (una cada 200 ms) con un dibujo de
//  dos filas de 25 repeticiones: la fila 1 activa el canal y la fila 2 no. En cada pasada
//  de la fila 1 el relé se cierra durante el 50 % de la pasada y se suelta, para que se vea cada
//  pasada (el firmware viene con PORCENTAJE_SELECCION en 0: lo deja cerrado mientras la bobina se
//  repite). Lo que se tiene que ver:
//    el LED parpadea unas 5 veces por segundo durante 5 s, queda apagado 5 s, y se repite.
//
//  Por el monitor serie (115200 baudios) se puede cambiar de modo, para medir con el
//  multímetro entre las patas 4 y 6 (sin el LED conectado):
//    1  relé cerrado fijo   → tiene que marcar entre 23 y 35 Ω
//    0  relé abierto fijo   → tiene que marcar abierto
//    p  vuelve al ciclo de pasadas
//
//  Esta prueba solo dice si el relé conduce cuando se le pide. En la máquina va en lugar del
//  lector (la conexión final, diagramas/hardware/conexion_final_rele.png); la medición del lector
//  (sección 5 de la guía) lo confirma, y CANAL_ACTIVO_EN_ALTO de control_trama_esp32/config.h
//  queda en true. Acá no influye.
// ============================================================================

static const int PIN_CANAL = 18;                      // canal 1 (columna 1 del dibujo)
static const unsigned long PASADA_MS = 200;           // 300 pasadas por minuto
static const unsigned long PORCENTAJE_SELECCION = 50; // en la prueba parpadea; el firmware viene en 0
static const int REPETICIONES = 25;                   // pasadas de cada fila

enum Modo { PATRON, FIJO_CERRADO, FIJO_ABIERTO };
static Modo modo = PATRON;
static unsigned long inicioPasada = 0;
static long pasada = 1;   // número de pasada, desde 1

// Fila del dibujo de prueba a la que corresponde una pasada: las 25 primeras son la fila 1
// (canal activo), las 25 siguientes la fila 2 (sin activar), y así.
static bool filaActiva(long n) { return ((n - 1) / REPETICIONES) % 2 == 0; }

static void anunciarFila() {
  if (pasada % REPETICIONES != 1) return;
  Serial.println(filaActiva(pasada) ? "Fila 1: canal activo en cada pasada (el LED parpadea)"
                                    : "Fila 2: canal sin activar (el LED queda apagado)");
}

static void rele(bool cerrado) {
  digitalWrite(PIN_CANAL, cerrado ? HIGH : LOW);   // el LCA110 conduce con su LED encendido (pin en alto)
}

void setup() {
  // Primero el nivel seguro y después la salida: al revés, el pin queda un instante indefinido.
  digitalWrite(PIN_CANAL, LOW);
  pinMode(PIN_CANAL, OUTPUT);
  rele(false);

  Serial.begin(115200);
  delay(300);
  Serial.println("");
  Serial.println("=== Prueba de mesa de un relé LCA110 (GPIO 18) ===");
  Serial.println("Patrón: 25 pasadas con el canal activo (el LED parpadea) y 25 sin activar (apagado).");
  Serial.println("Comandos: 1 = cerrado fijo, 0 = abierto fijo, p = ciclo de pasadas");
  inicioPasada = millis();
  anunciarFila();
}

void loop() {
  while (Serial.available() > 0) {
    const int c = Serial.read();
    if (c == '1') { modo = FIJO_CERRADO; rele(true);  Serial.println("Relé CERRADO fijo: medir entre las patas 4 y 6 (23 a 35 Ω)"); }
    if (c == '0') { modo = FIJO_ABIERTO; rele(false); Serial.println("Relé ABIERTO fijo: medir entre las patas 4 y 6 (abierto)"); }
    if (c == 'p' || c == 'P') { modo = PATRON; pasada = 1; inicioPasada = millis(); Serial.println("Patrón de pasadas"); anunciarFila(); }
  }
  if (modo != PATRON) { delay(5); return; }

  const unsigned long ahora = millis();
  if (ahora - inicioPasada >= PASADA_MS) {
    // Pasada nueva (en la máquina la marca el pulso del sensor).
    inicioPasada = ahora;
    pasada++;
    anunciarFila();
  }
  // En las pasadas de la fila 1 el relé se cierra al empezar la pasada y se suelta al llegar al
  // porcentaje, como un agujero del papel seguido de papel.
  const bool dentroDelAgujero = (ahora - inicioPasada) < PASADA_MS * PORCENTAJE_SELECCION / 100;
  rele(filaActiva(pasada) && dentroDelAgujero);
  delay(1);
}
