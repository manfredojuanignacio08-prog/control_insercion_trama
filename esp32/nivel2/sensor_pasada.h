#ifndef SENSOR_PASADA_H
#define SENSOR_PASADA_H

#include "config_nivel2.h"

// ============================================================================
//  Bloque C, conteo de pasadas
//
//  El sensor inductivo entrega un pulso por cada vuelta del eje sobre el que
//  está montado. Ese eje tiene que ser uno que complete exactamente un giro
//  por pasada: la verificación se hace poniendo cinta en el eje y contando
//  las vueltas mientras la máquina hace cinco pasadas.
//
//  La señal llega al pin a través de un optoacoplador, que aísla el circuito
//  del telar del microcontrolador. En reposo el pin queda en alto por su
//  resistencia de polarización; cuando el sensor detecta, el optoacoplador
//  conduce y el pin cae. Ese flanco descendente es una pasada.
// ============================================================================

volatile unsigned long pasadasContadas   = 0;
volatile unsigned long ultimoPulsoMs     = 0;
volatile bool          hayPulsoNuevo     = false;

// La interrupción tiene que vivir en RAM interna: en el ESP32 es obligatorio,
// porque la memoria flash puede estar ocupada cuando el pulso llega.
void IRAM_ATTR isrPasada() {
  const unsigned long ahora = millis();

  // Anti-rebote. A 5 pasadas por segundo hay 200 ms entre pulsos, así que
  // 60 ms filtra los rebotes sin riesgo de descartar un pulso legítimo.
  if (ahora - ultimoPulsoMs < DEBOUNCE_PASADA_MS) return;

  ultimoPulsoMs = ahora;
  pasadasContadas++;
  hayPulsoNuevo = true;
}

void sensorPasadaIniciar() {
  // El pin 35 es solo de entrada y no tiene resistencia interna: la de 10 kilohm
  // hacia 3,3 V va montada en la placa, igual que en los canales del Bloque A.
  pinMode(PIN_SENSOR_PASADA, INPUT);
  if (!MODO_BANCO) {
    attachInterrupt(digitalPinToInterrupt(PIN_SENSOR_PASADA), isrPasada, FALLING);
  }
}

// En modo banco no hay sensor: se generan pulsos al ritmo del telar para poder
// verificar la lógica de avance sin la máquina.
void sensorPasadaSimular() {
  if (!MODO_BANCO) return;
  static unsigned long ultimo = 0;
  const unsigned long ahora = millis();
  if (ahora - ultimo >= 200) {      // 200 ms = 5 por segundo = 300 por minuto
    ultimo = ahora;
    pasadasContadas++;
    ultimoPulsoMs = ahora;
    hayPulsoNuevo = true;
  }
}

// Devuelve true una sola vez por pulso, y limpia la marca.
bool sensorPasadaHuboPulso() {
  noInterrupts();
  const bool hubo = hayPulsoNuevo;
  hayPulsoNuevo = false;
  interrupts();
  return hubo;
}

unsigned long sensorPasadaTotal() {
  noInterrupts();
  const unsigned long n = pasadasContadas;
  interrupts();
  return n;
}

void sensorPasadaReiniciar() {
  noInterrupts();
  pasadasContadas = 0;
  hayPulsoNuevo   = false;
  interrupts();
}

// Con el telar en marcha debería llegar un pulso cada 200 ms. Si pasa mucho más
// tiempo, o la máquina se detuvo o el sensor dejó de detectar. El programa no
// decide cuál de las dos cosas es: solo avisa.
bool sensorPasadaSinSenal() {
  noInterrupts();
  const unsigned long ultimo = ultimoPulsoMs;
  interrupts();
  return (millis() - ultimo) > TIMEOUT_SIN_PULSOS_MS;
}

#endif
