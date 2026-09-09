#ifndef SELECCION_DIBUJO_H
#define SELECCION_DIBUJO_H

#include "config_nivel2.h"

// ============================================================================
//  Bloque D, selección del dibujo
//
//  El telar tiene seis bobinas de selección, ya instaladas y funcionando. Hoy
//  las comanda un lector óptico que lee la cinta de papel perforada: donde hay
//  agujero, el haz pasa.
//
//  El sistema no toca las bobinas ni las plaquetas del telar. Lo que hace es
//  cortar la señal de cada lector con un relé PhotoMOS, de modo que sea el
//  microcontrolador el que decida qué "agujero" hay en cada pasada.
//
//  Una fila del dibujo es una pasada, y sus columnas son los canales que se
//  activan al mismo tiempo. No se recorren de a uno.
// ============================================================================

// El estado que se aplicó en la última pasada, para poder consultarlo.
bool canalActivo[N_CANALES] = { false };

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
}

// Deja todos los canales en reposo. Se llama al pausar, al perder la red y en
// cualquier situación donde no haya certeza de qué corresponde aplicar.
void seleccionApagarTodo() {
  for (int i = 0; i < N_CANALES; i++) {
    canalActivo[i] = false;
    digitalWrite(PIN_CANAL[i], nivelPara(false));
  }
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
