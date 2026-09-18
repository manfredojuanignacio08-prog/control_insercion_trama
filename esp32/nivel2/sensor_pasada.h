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
// Cuando la máquina se detiene, puede quedar con la paleta justo enfrente del
// sensor. La vibración residual hace que la detección oscile y, sin protección,
// cada oscilación contaría como una pasada nueva. Por eso no alcanza con el
// anti-rebote por tiempo: se exige además que el sensor haya vuelto a reposo
// antes de aceptar el pulso siguiente.
volatile bool esperandoReposo = false;

// El sensor no distingue el sentido de giro: ve una paleta pasar y no sabe si la
// máquina avanzó o retrocedió. Cuando el operario usa Retroceder, el telar hace
// una pasada completa hacia atrás y el sensor igual entrega un pulso. Sin
// corregirlo, el conteo subiría uno cuando en realidad bajó uno: un error de dos
// pasadas por cada retroceso.
//
// La corrección aprovecha algo que el sistema ya tiene: el Bloque A sensa el
// botón Retroceder. Al detectarlo se marca esta bandera y el pulso siguiente se
// descuenta en lugar de sumarse.
volatile bool proximaEsRetroceso = false;
volatile bool ultimoPulsoFueRetroceso = false;

void IRAM_ATTR isrPasada() {
  const unsigned long ahora = millis();

  // Anti-rebote. A 5 pasadas por segundo hay 200 ms entre pulsos, así que
  // 60 ms filtra los rebotes sin riesgo de descartar un pulso legítimo.
  if (ahora - ultimoPulsoMs < DEBOUNCE_PASADA_MS) return;

  // Si el sensor todavía no volvió a reposo desde el pulso anterior, esto no es
  // una pasada nueva sino la misma paleta oscilando frente al sensor.
  if (esperandoReposo) return;

  ultimoPulsoMs = ahora;
  esperandoReposo = true;

  if (proximaEsRetroceso) {
    if (pasadasContadas > 0) pasadasContadas--;
    proximaEsRetroceso = false;
    ultimoPulsoFueRetroceso = true;
  } else {
    pasadasContadas++;
    ultimoPulsoFueRetroceso = false;
  }
  hayPulsoNuevo = true;
}

// Se llama desde el bucle principal: libera la traba cuando el sensor dejó de
// detectar metal, o sea cuando la paleta ya pasó de largo.
void sensorPasadaActualizar() {
  if (esperandoReposo && digitalRead(PIN_SENSOR_PASADA) == HIGH) {
    esperandoReposo = false;
  }
}

// El Bloque A avisa que se accionó Retroceder, sea por la aplicación o por el
// botón físico. El pulso siguiente del sensor se descuenta en lugar de sumarse.
void sensorPasadaAvisarRetroceso() {
  proximaEsRetroceso = true;
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

// Fija el contador en un valor conocido.
//
// Se usa al arrancar, para retomar una producción tras un reinicio del nodo con
// el número que guardó el backend. Llamarla con cero equivale a un reinicio
// manual del conteo, así que no hace falta una función aparte para eso.
void sensorPasadaFijarTotal(unsigned long total) {
  noInterrupts();
  pasadasContadas = total;
  hayPulsoNuevo   = false;
  interrupts();
}

// Devuelve true una sola vez por pulso, y limpia la marca.
//
// El sentido del pulso (adelante o retroceso) se entrega en la misma operación,
// dentro del mismo bloque sin interrupciones. Si se leyeran por separado, un
// pulso que llegara entre las dos lecturas podría cambiar el sentido y el bucle
// aplicaría la dirección equivocada: avanzaría la fila cuando debía retroceder.
bool sensorPasadaHuboPulso(bool* fueRetroceso = nullptr) {
  noInterrupts();
  const bool hubo = hayPulsoNuevo;
  const bool retro = ultimoPulsoFueRetroceso;
  hayPulsoNuevo = false;
  interrupts();
  if (fueRetroceso != nullptr) *fueRetroceso = retro;
  return hubo;
}

unsigned long sensorPasadaTotal() {
  noInterrupts();
  const unsigned long n = pasadasContadas;
  interrupts();
  return n;
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
