// Prueba la lógica REAL de seleccion_dibujo.h con un reloj simulado:
// en cada pasada los canales activos se cierran y se sueltan pasada la duración de
// la selección, aunque la fila se repita (un agujero por pasada, como el papel).
#include "seleccion_dibujo.h"
#include <cstdio>
static int fallas = 0, total = 0;
static void chequear(bool ok, const char* que) { total++; if (!ok) { fallas++; printf("  FALLA: %s\n", que); } }
static bool activo(int canal) { return g_pin[PIN_CANAL[canal]] == nivelPara(true); }
static int cuantosActivos() { int n = 0; for (int i = 0; i < N_CANALES; i++) n += activo(i); return n; }

int main() {
  const unsigned long PASADA = 200;             // 300 pasadas por minuto
  g_ms = 1000; seleccionIniciar();
  chequear(cuantosActivos() == 0, "al iniciar, todos los canales en reposo");

  const bool fila1[4] = { true, false, true, false };   // bobinas 1 y 3
  const bool fila2[4] = { false, true, true, false };   // bobinas 2 y 3
  int activaciones1 = 0, activaciones3 = 0, sueltasEntrePasadas = 0;
  bool ant1 = false, ant3 = false;

  // 25 pasadas de la fila 1 y después 10 de la fila 2, milisegundo a milisegundo
  for (int p = 0; p < 35; p++) {
    const bool* fila = (p < 25) ? fila1 : fila2;
    seleccionAplicarFila(fila, 4);
    const unsigned long inicio = g_ms;
    for (unsigned long t = 0; t < PASADA; t++) {
      g_ms = inicio + t;
      seleccionSoltarSiCorresponde();
      const bool a1 = activo(0), a3 = activo(2);
      if (a1 && !ant1) activaciones1++;
      if (a3 && !ant3) activaciones3++;
      ant1 = a1; ant3 = a3;
      if (t == 99) chequear(cuantosActivos() == 2, "justo antes de soltar (99 ms), la fila sigue aplicada");
      if (t == 100) {
        chequear(cuantosActivos() == 0, "pasada la duración, se sueltan todos los canales");
        if (cuantosActivos() == 0) sueltasEntrePasadas++;
      }
    }
    g_ms = inicio + PASADA;
  }
  chequear(activaciones1 == 25, "la bobina 1 se activa 25 veces separadas (una por pasada), no una sola larga");
  chequear(activaciones3 == 35, "la bobina 3 se activa en cada una de las 35 pasadas, también al cambiar de fila");
  chequear(sueltasEntrePasadas == 35, "entre cada pasada y la siguiente los canales quedan sueltos");

  // telar más lento: una pasada de 400 ms. La selección se alarga sola al 50 %: 200 ms
  seleccionAplicarFila(fila1, 4); unsigned long t0 = g_ms;
  g_ms = t0 + 400; seleccionSoltarSiCorresponde(); seleccionAplicarFila(fila1, 4); t0 = g_ms;
  g_ms = t0 + 150; seleccionSoltarSiCorresponde();
  chequear(cuantosActivos() == 2, "con pasadas de 400 ms, a los 150 ms la selección sigue aplicada");
  g_ms = t0 + 200; seleccionSoltarSiCorresponde();
  chequear(cuantosActivos() == 0, "con pasadas de 400 ms, se suelta a los 200 ms (la mitad)");

  // después de una parada no hay referencia: vuelve a la duración inicial
  seleccionApagarTodo(); g_ms += 60000; seleccionAplicarFila(fila1, 4); t0 = g_ms;
  g_ms = t0 + 100; seleccionSoltarSiCorresponde();
  chequear(cuantosActivos() == 0, "tras una parada, la primera pasada usa la duración inicial (100 ms)");

  // la fila 2 activa la bobina 2 y ya no la 1
  seleccionAplicarFila(fila2, 4);
  chequear(!activo(0) && activo(1) && activo(2), "la fila 2 activa las bobinas 2 y 3, y no la 1");

  // apagar todo cancela la suelta pendiente y deja todo en reposo
  seleccionApagarTodo();
  chequear(cuantosActivos() == 0 && !seleccionPorSoltar, "apagar todo deja los canales en reposo");

  printf("  selección por pasada: %d/%d verificaciones OK\n", total - fallas, total);
  return fallas ? 1 : 0;
}
