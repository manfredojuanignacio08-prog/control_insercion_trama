#ifndef SALIDA_SEGURA_H
#define SALIDA_SEGURA_H

// ============================================================================
//  Arranque seguro de las salidas (relés del Bloque A y canales del Bloque D)
//
//  Al encender, cada pin es una entrada y las resistencias de la placa lo mantienen en reposo.
//  Cuando se lo pasa a salida tiene que arrancar YA en su nivel de reposo: si sale un instante con
//  el nivel contrario, ese relé recibe un pulso que nadie pidió.
//
//  En el core ESP32 3.x, un digitalWrite() antes de pinMode() no hace nada (el pin todavía no está
//  registrado como GPIO: solo deja un error en el registro), y pinMode(OUTPUT) habilita la salida con
//  el nivel que tenga el registro, que al arrancar es bajo. Los relés activos en bajo (Marcha y
//  Pausa) quedaban activos desde pinMode hasta el digitalWrite siguiente. Por eso el nivel se
//  escribe con gpio_set_level(), del ESP-IDF, que sí carga el registro de salida antes de habilitarla.
// ============================================================================

static inline void salidaSegura(int pin, int nivel) {
  gpio_set_level((gpio_num_t)pin, nivel);   // primero el registro: la salida nace en este nivel
  pinMode(pin, OUTPUT);
  digitalWrite(pin, nivel);                 // y de nuevo por la API de Arduino, ya con el pin registrado
}

#endif
