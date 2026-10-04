// Corre el sketch de prueba de mesa con un reloj simulado y verifica el patrón que la guía
// dice que se tiene que ver: 25 destellos en los primeros 5 s (uno por pasada, del 50 % de la
// pasada) y el LED apagado los 5 s siguientes.
#include <cassert>
#include "../../pruebas/prueba_rele_lca110/prueba_rele_lca110.ino"
int main() {
  setup();
  int destellos[4] = {0, 0, 0, 0};
  int encendidoMs = 0, anterior = 0;
  for (unsigned long t = 0; t < 20000; t++) {
    g_ms = t; loop();
    const int v = g_pin[18];
    if (v && !anterior) destellos[t / 5000]++;
    if (v && t < 5000) encendidoMs++;
    anterior = v;
  }
  std::printf("  destellos por tramo de 5 s: %d %d %d %d · encendido %d ms de 5000\n",
              destellos[0], destellos[1], destellos[2], destellos[3], encendidoMs); std::fflush(stdout);
  assert(destellos[0] == 25 && destellos[1] == 0 && destellos[2] == 25 && destellos[3] == 0);
  assert(encendidoMs >= 2400 && encendidoMs <= 2600);   // 50 % de cada pasada
  std::printf("  prueba de mesa del relé OK\n");
}
