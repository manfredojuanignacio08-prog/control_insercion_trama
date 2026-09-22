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
// El nodo intenta primero la red de la fábrica y, si falla, el punto de acceso del
// celular. Ver la nota sobre el repositorio público en config.h del Nivel 1.
// Los nombres de las constantes son los mismos que en el Nivel 1.
#define WIFI_SSID          "Claro3747"
#define WIFI_PASSWORD      "11335577"
#define WIFI_SSID_ALT      ""
#define WIFI_PASSWORD_ALT  ""
#define WIFI_ESPERA_SEG    15

// Mismos valores que en config.h del Nivel 1: los dos nodos hablan con el mismo backend
// y con el mismo telar. (Antes el Nivel 1 apuntaba a una PC local con TELAR_ID 1 y este
// a Render con TELAR_ID 8, y uno de los dos accionaba/consultaba un telar equivocado.)
// SIN barra final ni "/api": las rutas se arman en el programa.
#define API_BASE_URL       "https://control-trama-backend.onrender.com"
#define TELAR_ID           8

// Clave del dispositivo: se manda en el header X-Device-Key. Tiene que ser IGUAL a
// ESP32_DEVICE_KEY del .env del backend y a DEVICE_KEY del Nivel 1.
#define DEVICE_KEY         "CAMBIAR_POR_LA_CLAVE_DE_ESP32_DEVICE_KEY"

// Certificado raíz para verificar el HTTPS del backend (opcional). Ver config.h del Nivel 1.
// #define API_CA_CERT "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"

// ------------------------------------------------------------ Modo de prueba
// En true el programa NO usa el sensor real: genera pulsos por su cuenta cada 200 ms,
// sin ninguna relación con lo que hace la máquina. Es solo para verificar la lógica en
// el banco de trabajo.
//
// DEBE QUEDAR EN false. Si este sketch se sube tal cual a la máquina con el modo banco
// activado, las filas del dibujo se aplican al ritmo de un reloj interno, desfasadas del
// telar, y la tela sale mal. Solo se pone en true a mano, para una prueba en el banco,
// y se vuelve a false antes de instalar.
#define MODO_BANCO         false

// ------------------------------------------- Bloque C · sensor de pasada
// El sensor entrega un pulso por vuelta del eje. Su señal llega al pin a
// través de un optoacoplador, de modo que el pin cae a bajo cuando detecta.
static const int  PIN_SENSOR_PASADA   = 35;   // solo entrada; lleva pull-up externa

// El sensor se alimenta con los 12 a 14 V de continua que entrega el telar. No
// hace falta rectificar (ya es continua) ni regular: el rango está lejos de los
// 36 V que tolera el sensor. La resistencia del canal es de 1,2 kΩ.
//
// El telar trabaja a 300 pasadas por minuto, es decir 5 por segundo, o sea un
// pulso cada 200 ms. El anti-rebote tiene que ser bastante menor que eso para
// no perder pulsos: 60 ms deja margen de sobra y filtra los rebotes.
static const unsigned long DEBOUNCE_PASADA_MS = 60;

// SENSOR COMO DETECTOR DE PARADA. Con el telar en marcha llega un pulso cada 200 ms. Si
// pasa este tiempo sin un solo pulso, la máquina se frenó (paro de emergencia, hilo cortado,
// falla) o el sensor dejó de detectar (se desalineó, se cortó un cable). El programa no
// distingue cuál de las dos, pero en cualquiera de los dos casos hace lo mismo: apaga los
// canales y avisa al backend (evento "sin_senal"), que pasa el telar a "pausado" en la web.
// Antes la web mostraba "tejiendo" indefinidamente con la máquina parada.
static const unsigned long TIMEOUT_SIN_PULSOS_MS = 3000;

// Período de gracia al arrancar: desde que el sistema pone "tejiendo" hasta que la máquina
// da su PRIMER pulso pasa un rato (el operario aprieta Marcha, el motor acelera). Sin esta
// gracia, si el primer pulso tardaba más de 3 s, el firmware declaraba "sin señal" y
// apagaba todo antes de que la máquina alcanzara a arrancar. Recién después del primer pulso
// rige el timeout de arriba.
static const unsigned long GRACIA_ARRANQUE_MS = 15000;

// ------------------------------------- Bloque D · selección del dibujo
// Un relé PhotoMOS por lector óptico, uno por bobina de selección.
//
// El C 401 donde se implementa tiene cuatro bobinas. El relevamiento original se
// hizo sobre un C 201 y se estimaban seis; la máquina de destino tiene cuatro.
// Si en otro telar hubiera más, alcanza con ampliar este número y la lista de
// pines, y poner elementos_seleccion en la base al valor que corresponda.
// Es la misma cifra que telares.elementos_seleccion en la base (por defecto 4): la
// única fuente de verdad del backend. Confirmado por el equipo: son cuatro.
// Cada pin va a la pata 1 del relé a través de una resistencia de 330 ohm,
// con una de 10 kilohm del pin a masa para el arranque seguro.
static const int  N_CANALES = 4;
static const int  PIN_CANAL[N_CANALES] = { 18, 19, 21, 22 };

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

// El desplazamiento de arriba corrige de a FILAS ENTERAS. Pero también puede haber un
// desfase DENTRO de la pasada: el telar lee la selección en un instante de su ciclo
// (cuando abre la calada), y el pulso del sensor llega en otro. Este retardo hace esperar
// esos microsegundos entre el pulso y la aplicación de la fila. Se mide con osciloscopio:
// pulso del sensor → ventana de lectura del lector óptico. Debe ser mucho menor que los
// 200 ms de una pasada (máximo permitido: 50 ms). Cero = se aplica apenas llega el pulso.
//
// Ojo con la otra dirección: si la ventana de lectura llega ANTES de que el pulso más la
// latencia del relé PhotoMOS (~1 ms) y del ESP32 alcancen a aplicar la fila, no se corrige
// con un retardo: hay que adelantar la aplicación con DESPLAZAMIENTO_FILAS = 1 (aplicar en el
// pulso N la fila N+1) o mover el blanco metálico sobre el eje.
// A_CONFIRMAR: se define con la medición sobre la máquina.
static const unsigned long RETARDO_APLICACION_US = 0;
static_assert(RETARDO_APLICACION_US <= 50000UL, "RETARDO_APLICACION_US no puede pasar de 50 ms");

// -------------------------------------------------------------- Diagnóstico
#define LOG_SERIAL         true
#define BAUD_SERIAL        115200

#endif
