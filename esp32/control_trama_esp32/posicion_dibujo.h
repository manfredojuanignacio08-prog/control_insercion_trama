#ifndef POSICION_DIBUJO_H
#define POSICION_DIBUJO_H

// ============================================================================
//  Posición dentro del dibujo: en qué fila está el telar y cuántas pasadas le
//  faltan a esa fila (cada fila se teje tantas pasadas como diga repeticiones[]).
//
//  Es el mismo modelo que backend/src/utils/posicion.js: una pasada adelante
//  descuenta una de la fila y, al agotarlas, pasa a la siguiente; una pasada
//  atrás es el espejo exacto. El dibujo es un lazo (después de la última fila
//  viene la primera). Está en un archivo aparte para poder probarlo en la PC
//  (verificacion/host/test_posicion_dibujo.cpp) con el mismo código que corre en
//  la placa.
//
//  Quien llama tiene que estar dentro de la sección crítica que protege fila y
//  restantes (las comparten los dos núcleos).
// ============================================================================

static inline int envolverFila(int fila, int filas) {
  int r = fila % filas;
  return (r < 0) ? r + filas : r;   // el módulo de C conserva el signo
}

// Intercalados: el backend manda el grupo entero como largo de su primera fila y 0 en las
// demás (ver largosDeFilas en posicion.js). Una fila de largo 0 no se teje sola: se saltea.
// Si todas midieran 0 (no ocurre: la primera de un grupo mide sus pasadas), no se mueve.
static inline int siguienteConLargo(int fila, int paso, const int reps[], int filas) {
  for (int i = 0; i < filas; i++) {
    fila = envolverFila(fila + paso, filas);
    if (reps[fila] > 0) return fila;
  }
  return fila;
}

// Una pasada hacia adelante.
static inline void posicionAdelante(int& fila, int& restantes, const int reps[], int filas) {
  if (filas <= 0) return;
  restantes--;
  if (restantes <= 0) {
    fila = siguienteConLargo(fila, 1, reps, filas);
    restantes = reps[fila] > 0 ? reps[fila] : 1;
  }
}

// Una pasada hacia atrás (Retroceder deshace la última pasada): la próxima hacia
// adelante vuelve a tejer la que se deshizo.
static inline void posicionAtras(int& fila, int& restantes, const int reps[], int filas) {
  if (filas <= 0) return;
  restantes++;
  if (restantes > reps[fila]) {
    fila = siguienteConLargo(fila, -1, reps, filas);
    restantes = 1;   // queda una pasada por deshacer de la fila anterior
  }
}

#endif
