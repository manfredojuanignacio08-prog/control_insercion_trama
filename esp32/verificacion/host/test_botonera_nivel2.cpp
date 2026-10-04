// Ejecuta la parte del Bloque A del firmware del Nivel 2 (el único ESP32 hace también lo del
// Nivel 1) con un reloj simulado: arranque seguro, orden de los pulsos, anti-doble-pulso, Marcha
// en espera hasta tener el dibujo, y el filtro del eco del propio relé en el sensado.
#include <cassert>
#include "/tmp/n2_botonera.cpp"
static int pulsos(int pin) { return g_cambios[pin] / 2; }
static void limpiar() { for (int i = 0; i < 64; i++) g_cambios[i] = 0; }
int main() {
  botoneraIniciar();
  // Reposo: el módulo de 2 canales es activo-bajo (reposo en alto) y el de Retroceder activo-alto.
  assert(g_pin[25] == HIGH && g_pin[26] == HIGH && g_pin[27] == LOW);
  limpiar();
  g_ms = 10000;
  botoneraAplicarEstado("pausado", 0, true);        // primera lectura: solo se memoriza
  assert(pulsos(25) + pulsos(26) + pulsos(27) == 0);
  g_ms += 2500; botoneraAplicarEstado("tejiendo", 0, false);   // dibujo sin cargar: Marcha en espera
  assert(pulsos(25) == 0);
  g_ms += 2500; botoneraAplicarEstado("tejiendo", 0, true);    // dibujo cargado: un pulso de Marcha
  assert(pulsos(25) == 1 && g_pin[25] == HIGH);
  g_ms += 500;  botoneraAplicarEstado("pausado", 1, true);     // dentro de los 2 s: espera
  assert(pulsos(26) == 0 && pulsos(27) == 0);
  g_ms += 2000; botoneraAplicarEstado("pausado", 1, true);     // Pausa primero...
  assert(pulsos(26) == 1 && pulsos(27) == 0);
  g_ms += 2500; botoneraAplicarEstado("pausado", 1, true);     // ...y Retroceder en la consulta siguiente
  assert(pulsos(27) == 1 && g_pin[27] == LOW);
  g_ms += 2500; botoneraAplicarEstado("pausado", 1, true);     // nada nuevo: ningún pulso más
  assert(pulsos(25) == 1 && pulsos(26) == 1 && pulsos(27) == 1);
  // Eco: el sensado de Pausa ve el pulso del propio relé y no lo toma por una pulsación a mano.
  g_ms = ultimoPulsoPausa + 300; isrBotonPausa();
  assert(!eventoPausaPendiente);
  g_ms = ultimoPulsoPausa + 1500; isrBotonPausa();             // pasada la ventana: es del operario
  assert(eventoPausaPendiente);
  std::printf("  Bloque A en el firmware del Nivel 2: OK\n");
}
