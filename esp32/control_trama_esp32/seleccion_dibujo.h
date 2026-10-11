#ifndef SELECCION_DIBUJO_H
#define SELECCION_DIBUJO_H

#include "config.h"

// ============================================================================
//  Bloque D, selección del dibujo
//
//  El C 201 tiene cuatro bobinas de selección, ya instaladas y funcionando. Hoy
//  las comanda un lector óptico que lee la cinta de papel perforada: donde hay
//  agujero, el haz pasa.
//
//  El sistema no toca las bobinas ni las plaquetas del telar. Lo que hace es
//  cortar la señal de cada lector con un relé de estado sólido LCA110, de modo que sea el
//  microcontrolador el que decida qué "agujero" hay en cada pasada.
//
//  Una fila del dibujo lleva una bobina (una trama por pasada) y se teje durante
//  tantas pasadas como diga su cantidad de repeticiones. Un grupo de filas intercaladas
//  alterna sus bobinas en orden, una por pasada (1, 3, 4, 2, 1, 3...): el backend manda el
//  ciclo en la primera fila del grupo (ver seleccionAplicarIntercalada). En cada pasada se
//  activa el canal que toca. Con PORCENTAJE_SELECCION en 0 (el valor de hoy) queda activo
//  hasta el pulso siguiente: en una racha de la misma bobina no se suelta nunca. Con un
//  porcentaje, se suelta pasado ese porcentaje de cada pasada, como el papel entre dos agujeros.
// ============================================================================

// La combinación que se aplicó en la última pasada, para el registro. Indica lo que
// se seleccionó, no si el relé sigue cerrado: se suelta pasada la duración de la selección.
bool canalActivo[N_CANALES] = { false };

// Cuándo se aplicó la última selección, cuánto tiene que durar, y si todavía falta soltarla.
unsigned long seleccionAplicadaMs = 0;
unsigned long seleccionDuracionMs = 0;
bool seleccionPorSoltar = false;
bool seleccionHayAnterior = false;   // hay una pasada anterior reciente con qué medir

// Traduce "quiero el canal activo" al nivel eléctrico que corresponda. Queda en
// una función y no escrito a mano en cada lugar, porque el sentido depende de
// cómo termine cableado el lector óptico y puede tener que invertirse.
static inline int nivelPara(bool activo) {
  return CANAL_ACTIVO_EN_ALTO ? (activo ? HIGH : LOW)
                              : (activo ? LOW  : HIGH);
}

void seleccionIniciar() {
  for (int i = 0; i < N_CANALES; i++) {
    // Igual que en el Bloque A: primero se escribe el nivel seguro y recién
    // después se configura el pin como salida. Al revés, el pin queda un
    // instante indefinido y el relé podría conducir solo durante el arranque.
    digitalWrite(PIN_CANAL[i], nivelPara(false));
    pinMode(PIN_CANAL[i], OUTPUT);
    digitalWrite(PIN_CANAL[i], nivelPara(false));
    canalActivo[i] = false;
  }
}

// Intercalado: en la pasada número `hechas` del grupo (0 la primera) va la bobina
// sec[hechas % largo], numerada desde 1 (0 = una fila sin bobina). Devuelve el canal, desde 0,
// o -1 si no hay.
static inline int seleccionCanalIntercalado(const uint8_t sec[], int largo, long hechas) {
  if (largo <= 0) return -1;
  long i = hechas % largo;
  if (i < 0) i += largo;
  return (int)sec[i] - 1;
}

void seleccionAplicarFila(const bool fila[], int nCols);

// Aplica la pasada `hechas` de un intercalado: solo el canal que le toca (o ninguno).
void seleccionAplicarIntercalada(const uint8_t sec[], int largo, long hechas, int nCols) {
  bool fila[N_CANALES] = { false };
  const int c = seleccionCanalIntercalado(sec, largo, hechas);
  if (c >= 0 && c < N_CANALES) fila[c] = true;
  seleccionAplicarFila(fila, nCols);
}

// Aplica una fila del dibujo: todos los canales a la vez, no de a uno.
void seleccionAplicarFila(const bool fila[], int nCols) {
  const int n = (nCols < N_CANALES) ? nCols : N_CANALES;
  for (int i = 0; i < n; i++) {
    canalActivo[i] = fila[i];
    digitalWrite(PIN_CANAL[i], nivelPara(fila[i]));
  }
  // Si el dibujo tiene menos columnas que canales físicos, los que sobran
  // quedan en reposo. Nunca se dejan en un estado indefinido.
  for (int i = n; i < N_CANALES; i++) {
    canalActivo[i] = false;
    digitalWrite(PIN_CANAL[i], nivelPara(false));
  }
  // La duración es un porcentaje de lo que duró la pasada anterior. Si no hay una anterior
  // reciente (primera pasada, o más de un segundo de diferencia, que es una parada y no una
  // pasada), se usa la duración inicial.
  const unsigned long ahora = millis();
  unsigned long duracion = DURACION_SELECCION_INICIAL_MS;
  if (seleccionHayAnterior) {
    const unsigned long periodo = ahora - seleccionAplicadaMs;
    if (periodo >= 50 && periodo <= 1000) duracion = periodo * PORCENTAJE_SELECCION / 100;
  }
  seleccionDuracionMs = duracion;
  seleccionAplicadaMs = ahora;
  seleccionHayAnterior = true;
  seleccionPorSoltar = (PORCENTAJE_SELECCION > 0);
}

// Suelta los canales cuando pasó la duración de la selección de esta pasada. Se llama en cada vuelta del
// ciclo principal (cada 1 ms), así que se suelta con una precisión de un milisegundo.
void seleccionSoltarSiCorresponde() {
  if (!seleccionPorSoltar) return;
  if (millis() - seleccionAplicadaMs < seleccionDuracionMs) return;
  for (int i = 0; i < N_CANALES; i++) digitalWrite(PIN_CANAL[i], nivelPara(false));
  seleccionPorSoltar = false;
}

// Deja todos los canales en reposo. Se llama al pausar, al perder la red y en
// cualquier situación donde no haya certeza de qué corresponde aplicar.
void seleccionApagarTodo() {
  for (int i = 0; i < N_CANALES; i++) {
    canalActivo[i] = false;
    digitalWrite(PIN_CANAL[i], nivelPara(false));
  }
  seleccionPorSoltar = false;
  seleccionHayAnterior = false;   // después de una parada, la próxima pasada no tiene referencia
}

// Arma una línea legible con el estado de los canales, para el monitor serie.
String seleccionEstadoTexto() {
  String s = "[";
  for (int i = 0; i < N_CANALES; i++) {
    s += canalActivo[i] ? "1" : "0";
    if (i < N_CANALES - 1) s += " ";
  }
  s += "]";
  return s;
}

#endif
