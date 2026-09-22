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


// EXCLUSIÓN MUTUA ENTRE NÚCLEOS. La interrupción del sensor y loop() corren en el núcleo 1, pero
// desde que la red vive en el núcleo 0 (tareaRed) esa tarea también toca estas variables (avisar un
// retroceso, fijar el conteo). En el ESP32 noInterrupts() solo desactiva las interrupciones del
// núcleo que la llama, así que NO protege contra el otro núcleo: un "contador++" de la interrupción
// podía cruzarse con un "contador = valor" de la red y perder una actualización. Un spinlock sí
// funciona entre núcleos (y en el mismo núcleo también enmascara la interrupción).
static portMUX_TYPE muxSensor = portMUX_INITIALIZER_UNLOCKED;

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
//
// Es un CONTADOR y no una bandera: si el operario mantiene apretado Retroceder o se
// acumulan varios avisos entre dos consultas al backend, cada uno tiene que descontar
// una pasada. Con una bandera booleana, tres retrocesos descontaban una sola.
volatile int  pasadasARetroceder = 0;
volatile bool ultimoPulsoFueRetroceso = false;

// Orden de llegada. El aviso de "hubo un retroceso" (por el backend, hasta 2,5 s de demora)
// y el pulso del sensor pueden llegar en cualquier orden. Si el pulso llega PRIMERO se cuenta
// como una pasada hacia adelante; cuando después llega el aviso, con la máquina detenida (un
// retroceso normal se hace con el telar en pausa) ese pulso se reclasifica: se le quita el +1
// y se le resta 1. Si no, el descuento quedaría pendiente y se aplicaría al pulso equivocado.
volatile bool          ultimoAdelanteReclasificable = false;
volatile unsigned long ultimoAdelanteMs = 0;
volatile int           reclasificadosPendientes = 0;
static const unsigned long VENTANA_RECLASIFICAR_MS = 5000;

// Un aviso de retroceso que NO llega a consumirse con un pulso (el relé del Nivel 1 no actuó, la
// máquina no se movió) no puede quedar esperando para siempre: descontaría una pasada del pulso
// que llegue horas después. Con la máquina en marcha un pulso llega cada 200 ms, así que un aviso
// vigente se consume enseguida; pasado este tiempo sin consumirse, se descarta. También se
// descarta al arrancar el tejido (ver sensorPasadaMarcarArranque).
volatile unsigned long avisoRetrocesoMs = 0;
static const unsigned long CADUCIDAD_AVISO_RETROCESO_MS = 30000;

// Marca del momento en que el sistema pasó a "tejiendo". Sirve para el período de gracia
// de sensorPasadaSinSenal(): la máquina tarda en dar su primer pulso.
volatile unsigned long arranqueMs = 0;

void IRAM_ATTR isrPasada() {
  const unsigned long ahora = millis();

  // Anti-rebote. A 5 pasadas por segundo hay 200 ms entre pulsos, así que
  // 60 ms filtra los rebotes sin riesgo de descartar un pulso legítimo.
  if (ahora - ultimoPulsoMs < DEBOUNCE_PASADA_MS) return;

  // Si el sensor todavía no volvió a reposo desde el pulso anterior, esto no es
  // una pasada nueva sino la misma paleta oscilando frente al sensor.
  if (esperandoReposo) return;

  portENTER_CRITICAL_ISR(&muxSensor);
  ultimoPulsoMs = ahora;
  esperandoReposo = true;

  if (pasadasARetroceder > 0) {
    if (pasadasContadas > 0) pasadasContadas--;
    pasadasARetroceder--;
    ultimoPulsoFueRetroceso = true;
    ultimoAdelanteReclasificable = false;
  } else {
    pasadasContadas++;
    ultimoPulsoFueRetroceso = false;
    ultimoAdelanteReclasificable = true;
    ultimoAdelanteMs = ahora;
  }
  hayPulsoNuevo = true;
  portEXIT_CRITICAL_ISR(&muxSensor);
}

// Se llama desde el bucle principal: libera la traba cuando el sensor dejó de
// detectar metal, o sea cuando la paleta ya pasó de largo.
void sensorPasadaActualizar() {
  if (esperandoReposo && digitalRead(PIN_SENSOR_PASADA) == HIGH) {
    esperandoReposo = false;
  }
  // Aviso de retroceso vencido sin haberse consumido: se descarta.
  if (pasadasARetroceder > 0 && (millis() - avisoRetrocesoMs) > CADUCIDAD_AVISO_RETROCESO_MS) {
    portENTER_CRITICAL(&muxSensor);
    pasadasARetroceder = 0;
    portEXIT_CRITICAL(&muxSensor);
  }
}

// Se avisa que hubo `cuantos` retrocesos, sea por la aplicación o por el botón físico. Los
// pulsos siguientes del sensor se descuentan en lugar de sumarse.
//
// `maquinaEnMarcha` (el sistema está "tejiendo") impide reclasificar: con la máquina
// andando llegan pulsos cada 200 ms y no hay forma de saber cuál fue el del retroceso.
void sensorPasadaAvisarRetroceso(int cuantos, bool maquinaEnMarcha) {
  for (int k = 0; k < cuantos; k++) {
    portENTER_CRITICAL(&muxSensor);
    if (!maquinaEnMarcha && ultimoAdelanteReclasificable &&
        (millis() - ultimoAdelanteMs) < VENTANA_RECLASIFICAR_MS) {
      // El pulso del retroceso ya había llegado y se contó como +1: se corrige a -1.
      pasadasContadas = (pasadasContadas >= 2) ? pasadasContadas - 2 : 0;
      ultimoAdelanteReclasificable = false;
      reclasificadosPendientes++;
    } else {
      pasadasARetroceder++;
      avisoRetrocesoMs = millis();
    }
    portEXIT_CRITICAL(&muxSensor);
  }
}

// Cuántos pulsos se reclasificaron a retroceso desde la última vez. El programa principal
// mueve la fila del dibujo una hacia atrás por cada uno.
int sensorPasadaTomarReclasificados() {
  portENTER_CRITICAL(&muxSensor);
  const int n = reclasificadosPendientes;
  reclasificadosPendientes = 0;
  portEXIT_CRITICAL(&muxSensor);
  return n;
}

// El programa principal avisa que el sistema pasó a "tejiendo": arranca el período de gracia.
void sensorPasadaMarcarArranque() {
  portENTER_CRITICAL(&muxSensor);
  arranqueMs = millis();
  // Un retroceso avisado que ningún pulso llegó a consumir antes de arrancar es viejo: si se
  // conservara, descontaría la primera pasada del tejido.
  pasadasARetroceder = 0;
  portEXIT_CRITICAL(&muxSensor);
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
    portENTER_CRITICAL(&muxSensor);
    pasadasContadas++;
    ultimoPulsoMs = ahora;
    ultimoPulsoFueRetroceso = false;
    hayPulsoNuevo = true;
    portEXIT_CRITICAL(&muxSensor);
  }
}

// Fija el contador en un valor conocido.
//
// Se usa al arrancar, para retomar una producción tras un reinicio del nodo con
// el número que guardó el backend. Llamarla con cero equivale a un reinicio
// manual del conteo, así que no hace falta una función aparte para eso.
void sensorPasadaFijarTotal(unsigned long total) {
  portENTER_CRITICAL(&muxSensor);
  pasadasContadas = total;
  hayPulsoNuevo   = false;
  portEXIT_CRITICAL(&muxSensor);
}

// Devuelve true una sola vez por pulso, y limpia la marca.
//
// El sentido del pulso (adelante o retroceso) se entrega en la misma operación,
// dentro del mismo bloque sin interrupciones. Si se leyeran por separado, un
// pulso que llegara entre las dos lecturas podría cambiar el sentido y el bucle
// aplicaría la dirección equivocada: avanzaría la fila cuando debía retroceder.
bool sensorPasadaHuboPulso(bool* fueRetroceso = nullptr) {
  portENTER_CRITICAL(&muxSensor);
  const bool hubo = hayPulsoNuevo;
  const bool retro = ultimoPulsoFueRetroceso;
  hayPulsoNuevo = false;
  portEXIT_CRITICAL(&muxSensor);
  if (fueRetroceso != nullptr) *fueRetroceso = retro;
  return hubo;
}

unsigned long sensorPasadaTotal() {
  portENTER_CRITICAL(&muxSensor);
  const unsigned long n = pasadasContadas;
  portEXIT_CRITICAL(&muxSensor);
  return n;
}

// Con el telar en marcha debería llegar un pulso cada 200 ms. Si pasa mucho más tiempo, o la
// máquina se detuvo o el sensor dejó de detectar. El programa no decide cuál de las dos cosas
// es: solo avisa (y el llamador apaga los canales y le avisa al backend).
//
// Período de gracia: antes del primer pulso posterior al arranque rige GRACIA_ARRANQUE_MS
// (la máquina tarda en arrancar y acelerar); desde que empezaron a llegar pulsos, rige
// TIMEOUT_SIN_PULSOS_MS. Antes, ultimoPulsoMs arrancaba en 0 y en cuanto el sistema pasaba a
// "tejiendo" el tiempo sin pulsos ya era enorme: se declaraba "sin señal" al instante.
bool sensorPasadaSinSenal() {
  portENTER_CRITICAL(&muxSensor);
  const unsigned long ultimo  = ultimoPulsoMs;
  const unsigned long arranque = arranqueMs;
  portEXIT_CRITICAL(&muxSensor);
  const unsigned long ahora = millis();

  // ¿Hubo algún pulso desde que arrancó? (resta con signo: seguro ante el desborde de millis)
  const bool huboPulsoDesdeArranque = (long)(ultimo - arranque) >= 0 && ultimo != 0;
  if (huboPulsoDesdeArranque) {
    return (ahora - ultimo) > TIMEOUT_SIN_PULSOS_MS;
  }
  return (ahora - arranque) > GRACIA_ARRANQUE_MS;
}

#endif
