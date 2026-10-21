// Prueba de seleccion_dibujo.h con PORCENTAJE_SELECCION tal como viene en config.h (0): la
// selección se mantiene hasta el pulso siguiente. En 120 pasadas seguidas de la misma bobina el
// relé no se suelta nunca; cuando cambia la bobina, se suelta la anterior y se activa la nueva.
#include "seleccion_dibujo.h"
#include <cstdio>
static int fallas = 0, total = 0;
static void chequear(bool ok, const char* que) { total++; if (!ok) { fallas++; printf("  FALLA: %s\n", que); } }
static bool activo(int canal) { return g_pin[PIN_CANAL[canal]] == nivelPara(true); }
static int cuantosActivos() { int n = 0; for (int i = 0; i < N_CANALES; i++) n += activo(i); return n; }

int main() {
  static_assert(PORCENTAJE_SELECCION == 0, "esta prueba es para el valor de config.h: 0");
  const unsigned long PASADA = 200;
  g_ms = 1000; seleccionIniciar();
  const bool b4[4] = { false, false, false, true };
  const bool b2[4] = { false, true, false, false };
  // 120 pasadas de la bobina 4, milisegundo a milisegundo: nunca se suelta
  bool siempre = true; int activaciones = 0; bool ant = false;
  for (int p = 0; p < 120; p++) {
    seleccionAplicarFila(b4, 4);
    const unsigned long inicio = g_ms;
    for (unsigned long t = 0; t < PASADA; t++) {
      g_ms = inicio + t; seleccionSoltarSiCorresponde();
      const bool a = activo(3);
      if (!a || cuantosActivos() != 1) siempre = false;
      if (a && !ant) activaciones++;
      ant = a;
    }
    g_ms = inicio + PASADA;
  }
  chequear(siempre, "120 pasadas de la bobina 4: el relé queda activo todo el tiempo");
  chequear(activaciones == 1, "120 pasadas de la bobina 4: una sola activación (no se suelta entre pasadas)");
  // cambia la bobina: se suelta la 4 y se activa la 2 en el mismo pulso
  seleccionAplicarFila(b2, 4);
  chequear(!activo(3) && activo(1) && cuantosActivos() == 1, "al cambiar de bobina, se suelta la anterior y se activa la nueva");
  g_ms += 5000; seleccionSoltarSiCorresponde();
  chequear(activo(1), "sin pulso nuevo, la selección sigue (hasta la próxima pasada o una parada)");
  // intercalado 1, 3, 4, 2: cambia en cada pasada, siempre una sola
  const uint8_t sec[4] = { 1, 3, 4, 2 };
  bool ok = true;
  for (long h = 0; h < 8; h++) {
    seleccionAplicarIntercalada(sec, 4, h, 4);
    g_ms += 199; seleccionSoltarSiCorresponde();
    if (cuantosActivos() != 1 || !activo(sec[h % 4] - 1)) ok = false;
    g_ms += 1;
  }
  chequear(ok, "intercalado 1, 3, 4, 2: una bobina por pasada, que se mantiene hasta la siguiente");
  // una parada (pausa, sin señal) suelta todo
  seleccionApagarTodo();
  chequear(cuantosActivos() == 0, "al parar, todos los canales en reposo");
  printf("  selección mantenida: %d/%d verificaciones OK\n", total - fallas, total);
  return fallas ? 1 : 0;
}
