#ifndef CONFIG_NIVEL2_H
#define CONFIG_NIVEL2_H

// ============================================================================
//  Nivel 2, Configuración
//  Control de Inserción de Trama · Equipo N.º 5
//
//  Todo lo que puede cambiar de una instalación a otra está en este archivo.
//  Los valores marcados A_CONFIRMAR dependen de mediciones que todavía no se
//  hicieron sobre la máquina: no deben darse por buenos hasta confirmarlos.
// ============================================================================

// ---------------------------------------------------------------- Red y API
#define WIFI_SSID          "A_CONFIRMAR"
#define WIFI_PASS          "A_CONFIRMAR"
#define API_BASE           "https://control-trama-backend.onrender.com/api"
#define TELAR_ID           8

// ------------------------------------------------------------ Modo de prueba
// En true el programa no usa el sensor real: genera pulsos por su cuenta al
// ritmo del telar, para poder verificar la lógica en el banco de trabajo.
#define MODO_BANCO         true

// ------------------------------------------- Bloque C · sensor de pasada
// El sensor entrega un pulso por vuelta del eje. Su señal llega al pin a
// través de un optoacoplador, de modo que el pin cae a bajo cuando detecta.
static const int  PIN_SENSOR_PASADA   = 35;   // solo entrada; lleva pull-up externa

// El telar trabaja a 300 pasadas por minuto, es decir 5 por segundo, o sea un
// pulso cada 200 ms. El anti-rebote tiene que ser bastante menor que eso para
// no perder pulsos: 60 ms deja margen de sobra y filtra los rebotes.
static const unsigned long DEBOUNCE_PASADA_MS = 60;

// Si pasa este tiempo sin un solo pulso con el telar en marcha, algo anda mal:
// el sensor se desalineó, se cortó un cable o la máquina se detuvo sola.
static const unsigned long TIMEOUT_SIN_PULSOS_MS = 3000;

// ------------------------------------- Bloque D · selección del dibujo
// Un relé PhotoMOS por lector óptico. Son seis, uno por bobina de selección.
// Cada pin va a la pata 1 del relé a través de una resistencia de 330 ohm,
// con una de 10 kilohm del pin a masa para el arranque seguro.
static const int  N_CANALES = 6;
static const int  PIN_CANAL[N_CANALES] = { 18, 19, 21, 22, 23, 4 };

// Sentido de la señal. El relé PhotoMOS conduce cuando su LED recibe corriente,
// o sea con el pin en alto. Queda como constante porque, según cómo esté
// cableado el lector óptico, puede que haya que invertir el criterio:
//   - Si el relé va EN PARALELO con el lector (el agujero cierra el circuito),
//     activar el canal significa cerrar el relé.
//   - Si va EN SERIE (el agujero abre el circuito), activarlo significa abrirlo.
// A_CONFIRMAR: depende de la medición sobre el lector.
#define CANAL_ACTIVO_EN_ALTO   true

// Tiempo que la señal permanece aplicada en cada pasada. Con 300 pasadas por
// minuto hay 200 ms entre una y otra; se deja un margen para que la plaqueta
// del telar alcance a leerla.
// A_CONFIRMAR: depende de cómo responda la plaqueta.
static const unsigned long DURACION_SELECCION_MS = 120;

// -------------------------------------------------------------- Diagnóstico
#define LOG_SERIAL         true
#define BAUD_SERIAL        115200

#endif
