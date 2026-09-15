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
// El nodo intenta primero la red de la fábrica y, si falla, el punto de acceso
// del celular. Ver la nota sobre el repositorio público en config.h del Nivel 1.
#define WIFI_SSID          "Claro3747"
#define WIFI_PASS          "11335577"
#define WIFI_SSID_ALT      ""
#define WIFI_PASS_ALT      ""
#define WIFI_ESPERA_SEG    15
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

// La selección NO se aplica por un tiempo fijo: se mantiene desde el pulso del
// sensor hasta el pulso siguiente, que es exactamente lo que hacía el papel.
// El agujero de la cinta permanecía frente al lector durante toda la pasada, no
// un instante, así que la plaqueta veía una señal sostenida. Como la cinta se
// retira, el relé ocupa su lugar y debe comportarse igual.
//
// Esto además se adapta solo si el telar cambia de velocidad: un tiempo fijo
// dejaría la señal caída antes de terminar la pasada cuando la máquina va lenta.

// ---------------------------------------------- Sincronización con la máquina
// El telar lee la selección en un instante concreto de su ciclo, cuando abre la
// calada. Con la cinta de papel esa coincidencia era mecánica y venía de fábrica.
// Sin cinta, el momento lo define dónde quede montado el blanco metálico sobre
// el eje que dispara el sensor inductivo.
//
// Si al tejer una prueba la tela sale corrida una pasada respecto del dibujo,
// hay dos formas de corregirlo: rotar el blanco sobre el eje (ajuste mecánico,
// el preferible), o compensar desde acá adelantando o atrasando filas.
//
//   0  → la fila que se aplica es la que corresponde a la pasada en curso
//   1  → se adelanta una fila (usar si la tela sale una pasada atrasada)
//  -1  → se atrasa una fila
//
// A_CONFIRMAR: se define con la primera prueba de tejido, no antes.
static const int DESPLAZAMIENTO_FILAS = 0;

// -------------------------------------------------------------- Diagnóstico
#define LOG_SERIAL         true
#define BAUD_SERIAL        115200

#endif
