// Ejecuta la parte del Bloque A del firmware (relés y sensado de la botonera) con un reloj
// simulado: arranque seguro, orden de los pulsos, anti-doble-pulso, varios retrocesos pedidos juntos, Marcha en espera hasta tener
// el dibujo, el filtro del eco del propio relé en el sensado y el de los canales que bajan juntos al prenderse el telar.
#include <cassert>
#include "/tmp/fw_botonera.cpp"
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
  // Dos retrocesos pedidos antes de una consulta: dos pulsos, de a uno por consulta.
  g_ms += 2500; botoneraAplicarEstado("pausado", 3, true);
  assert(pulsos(27) == 2);
  g_ms += 2500; botoneraAplicarEstado("pausado", 3, true);
  assert(pulsos(27) == 3);
  g_ms += 2500; botoneraAplicarEstado("pausado", 3, true);     // al día: nada más
  assert(pulsos(27) == 3);
  // Un salto grande (o hacia atrás) del contador no es un pedido: no se pulsa.
  g_ms += 2500; botoneraAplicarEstado("pausado", 50, true);
  g_ms += 2500; botoneraAplicarEstado("pausado", 50, true);
  g_ms += 2500; botoneraAplicarEstado("pausado", 2, true);
  assert(pulsos(27) == 3);
  // Eco: el sensado de Pausa ve el pulso del propio relé y no lo toma por una pulsación a mano.
  g_ms = ultimoPulsoPausa + 300; isrBotonPausa();
  assert(!eventoPausaPendiente);
  g_ms = ultimoPulsoPausa + 1500; isrBotonPausa();             // pasada la ventana: es del operario
  assert(eventoPausaPendiente);
  // Encendido del telar con el gabinete prendido: los tres canales bajan juntos (no es nadie
  // soltando un botón) y no se avisa nada.
  eventoMarchaPendiente = eventoPausaPendiente = eventoRetrocederPendiente = false;
  g_ms += 10000; const unsigned long t0 = g_ms;
  isrBotonMarcha(); g_ms += 4; isrBotonPausa(); g_ms += 9; isrBotonRetroceder();
  assert(eventoMarchaPendiente && eventoPausaPendiente && eventoRetrocederPendiente);
  g_ms = t0 + 100; assert(!botoneraFiltrarSimultaneos());       // dentro de la ventana: espera
  assert(eventoMarchaPendiente && eventoPausaPendiente && eventoRetrocederPendiente);
  g_ms = t0 + 200; assert(botoneraFiltrarSimultaneos());
  assert(!eventoMarchaPendiente && !eventoPausaPendiente && !eventoRetrocederPendiente);
  // Un botón solo: el aviso sale pasada la ventana.
  g_ms += 2000; const unsigned long t1 = g_ms;
  isrBotonPausa(); assert(eventoPausaPendiente);
  g_ms = t1 + 50;  assert(!botoneraFiltrarSimultaneos() && eventoPausaPendiente);
  g_ms = t1 + 160; assert(botoneraFiltrarSimultaneos() && eventoPausaPendiente);
  eventoPausaPendiente = false;                                   // lo mandó botoneraDespacharAvisos
  // Dos botones, uno después del otro: se avisan los dos.
  g_ms += 2000; const unsigned long t2 = g_ms;
  isrBotonMarcha(); g_ms = t2 + 600; isrBotonRetroceder();
  g_ms = t2 + 800; assert(botoneraFiltrarSimultaneos() && eventoMarchaPendiente && eventoRetrocederPendiente);
  eventoMarchaPendiente = eventoRetrocederPendiente = false;
  // Dos canales juntos y el tercero quieto (por ejemplo, el del eco): se descartan los dos.
  g_ms += 2000; const unsigned long t3 = g_ms;
  isrBotonPausa(); g_ms = t3 + 40; isrBotonRetroceder();
  g_ms = t3 + 300; assert(botoneraFiltrarSimultaneos() && !eventoPausaPendiente && !eventoRetrocederPendiente);
  // El eco del propio relé no cuenta como un canal: un botón soltado en ese momento se avisa.
  g_ms += 3000; const unsigned long t4 = g_ms;
  pulsarRele(PIN_RELE_PAUSA);
  g_ms = t4 + 300; isrBotonPausa();                               // eco: ignorado
  g_ms = t4 + 310; isrBotonMarcha();                              // el operario suelta Marcha
  g_ms = t4 + 500; assert(botoneraFiltrarSimultaneos() && eventoMarchaPendiente && !eventoPausaPendiente);
  std::printf("  Bloque A del firmware: OK\n");
}
