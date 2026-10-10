#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
//  Configuración del ESP32 del telar
//  Control de Inserción de Trama · Equipo N.º 5
//
//  UN SOLO PROGRAMA PARA LA ÚNICA PLACA DEL GABINETE. Antes de subirlo hay que completar:
//    1. WIFI_SSID y WIFI_PASSWORD (la red de la fábrica).
//    2. DEVICE_KEY (la misma clave que ESP32_DEVICE_KEY en Render).
//    3. NIVEL2_INSTALADO: false mientras solo esté armado el Bloque A (hoy).
//
//  Los valores marcados A_CONFIRMAR dependen de mediciones que todavía no se hicieron
//  sobre la máquina: no deben darse por buenos hasta confirmarlos.
// ============================================================================

// ---------------------------------------------------------------- Qué está instalado
// false → solo el Bloque A: relés de Marcha, Pausa y Retroceder y sensado de la botonera.
//         Es lo que hay que usar HOY. La web estima las pasadas por tiempo.
// true  → además el sensor de pasada (Bloque C) y los relés LCA110 de la selección (Bloque D).
//         Se pone en true recién cuando los dos estén armados y conectados.
//
// Por qué importa: con true la placa le avisa al servidor que el sensor está funcionando, y
// la web deja de estimar las pasadas por tiempo para esperar las del sensor. Con true y sin
// sensor conectado, el conteo quedaría en cero.
#ifndef NIVEL2_INSTALADO   // (el #ifndef es para las pruebas en la PC; acá se cambia el valor)
#define NIVEL2_INSTALADO   false
#endif

// ---------------------------------------------------------------- Red Wi-Fi
// El nodo intenta primero la red de la fábrica. Si no la encuentra o no logra conectarse,
// prueba la segunda, pensada para el teléfono del dueño compartiendo datos: así una caída del
// router no deja al sistema sin comunicación.
//
// ATENCIÓN: este archivo va al repositorio, que es público. La red y la clave se completan en
// la copia local antes de subir el programa y NO se suben con valores reales (igual que
// DEVICE_KEY). La clave real de la fábrica estuvo escrita acá y quedó en el historial del
// repositorio: conviene cambiarla en el router.
#define WIFI_SSID          "Claro4347"
#define WIFI_PASSWORD      "11335577"
// Red de respaldo (punto de acceso del celular). Vacía = se reintenta la principal.
#define WIFI_SSID_ALT      ""
#define WIFI_PASSWORD_ALT  ""
// Segundos que espera en cada red antes de pasar a la otra.
#define WIFI_ESPERA_SEG    15

// ---------------------------------------------------------------- Servidor
// URL del BACKEND (Node/Express), no de la base de datos. SIN barra final ni "/api".
//   - En la nube (Render):        "https://control-trama-backend.onrender.com"
//   - En una PC de la red local:  "http://192.168.1.50:3000"
#define API_BASE_URL       "https://control-trama-backend.onrender.com"

// Id del telar en la base de datos. El telar registrado es el 8. Si algún día se borra y se
// vuelve a crear (el id no se reutiliza), hay que actualizarlo.
#define TELAR_ID           8

// Clave del dispositivo: va en el header X-Device-Key de cada pedido. Tiene que ser IGUAL a
// ESP32_DEVICE_KEY del backend. Si no coincide, el monitor serie muestra "401".
#define DEVICE_KEY         "cc1ce04d-f582-4150-be55-dc06a0d1faf33e97df76-6c70-407d-963b-518b3a931f7cY"

// Verificación del certificado HTTPS (opcional). Sin esto el nodo cifra el tráfico pero no
// comprueba con quién habla. Para verificarlo, pegar el certificado raíz (PEM) y descomentar:
// #define API_CA_CERT "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"

// --------------------------------------------------- Bloque A · botonera
// Tres relés en paralelo con los botones de Marcha, Pausa y Retroceder, y el sensado de esos
// mismos tres botones (optoacoplador PC817) para saber cuándo alguien los usa a mano.
static const int PIN_RELE_MARCHA       = 25;   // IN1 del módulo de 2 canales
static const int PIN_RELE_PAUSA        = 26;   // IN2 del módulo de 2 canales
static const int PIN_RELE_RETROCEDER   = 27;   // IN3, módulo individual
static const int PIN_BOTON_MARCHA      = 32;   // PC817: sensa el botón Marcha (solo lectura)
static const int PIN_BOTON_PAUSA       = 33;   // PC817: sensa el botón Pausa
static const int PIN_BOTON_RETROCEDER  = 34;   // PC817: sensa el botón Retroceder (solo entrada)
static const int PIN_LED               = 2;    // LED de la placa: encendido = conectado a la red

// Polaridad de CADA módulo de relé. Los módulos optoacoplados de 2 canales se activan con
// nivel BAJO (true); los individuales rotulados "S / + / -" suelen activarse con nivel ALTO
// (false). Cómo saberlo, con el módulo alimentado y la entrada al aire: si el relé queda
// suelto es activo-bajo; si queda pegado (LED encendido), activo-alto.
// La resistencia de 10 kΩ de cada entrada depende de esto:
//   activo-bajo (true)  → a 3,3 V   ·   activo-alto (false) → a GND
// Al revés, el relé arranca pegado. En este equipo: Marcha y Pausa activo-bajo, Retroceder
// activo-alto.
#define RELE_MARCHA_ACTIVO_BAJO      true
#define RELE_PAUSA_ACTIVO_BAJO       true
#define RELE_RETROCEDER_ACTIVO_BAJO  false

// ------------------------------------------------------------ Modo de prueba
// Solo tiene efecto con NIVEL2_INSTALADO en true. En true el programa NO usa el sensor real: con el telar en "tejiendo" genera pulsos por su
// cuenta cada 200 ms, sin ninguna relación con lo que hace la máquina. Es solo para verificar
// la lógica en el banco de trabajo. Los relés del Bloque A siguen funcionando: en el banco no
// tienen que estar conectados a la botonera (▶ en la web pulsa Marcha).
//
// DEBE QUEDAR EN false. Si este sketch se sube tal cual a la máquina con el modo banco
// activado, las filas del dibujo se aplican al ritmo de un reloj interno, desfasadas del
// telar, y la tela sale mal. Solo se pone en true a mano, para una prueba en el banco,
// y se vuelve a false antes de instalar.
#define MODO_BANCO         false
static_assert(!MODO_BANCO || NIVEL2_INSTALADO, "MODO_BANCO necesita NIVEL2_INSTALADO en true");

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
// Un relé LCA110 (OptoMOS, salida MOSFET) por lector óptico, uno por bobina de selección.
//
// El C 201 donde se implementa tiene cuatro bobinas en funcionamiento. El primer
// relevamiento había estimado seis; el dueño confirmó que son cuatro en la visita
// del 19/09/2026.
// Si en otro telar hubiera más, alcanza con ampliar este número y la lista de
// pines, y poner elementos_seleccion en la base al valor que corresponda.
// Es la misma cifra que telares.elementos_seleccion en la base (por defecto 4): la
// única fuente de verdad del backend. Confirmado por el equipo: son cuatro.
// Cada pin va a la pata 1 del relé a través de una resistencia de 330 ohm,
// con una de 10 kilohm del pin a masa para el arranque seguro.
static const int  N_CANALES = 4;
static const int  PIN_CANAL[N_CANALES] = { 18, 19, 21, 22 };

// Sentido de la señal. El relé LCA110 conduce cuando su LED recibe corriente,
// o sea con el pin en alto. Queda como constante porque, según cómo esté
// cableado el lector óptico, puede que haya que invertir el criterio:
//   - Si el relé va EN PARALELO con el lector (el agujero cierra el circuito),
//     activar el canal significa cerrar el relé.
//   - Si va EN SERIE (el agujero abre el circuito), activarlo significa abrirlo.
// A_CONFIRMAR: depende de la medición sobre el lector.
#define CANAL_ACTIVO_EN_ALTO   true

// Cómo se aplica la selección: en CADA pasada, los canales de la fila se activan y se
// sueltan antes de la pasada siguiente, como el papel, que entre dos agujeros seguidos de la
// misma columna tiene papel. Cuánto dura lo define PORCENTAJE_SELECCION (más abajo). El lector
// tiene que ver siempre cinta sin agujero (una cinta sin perforar, o el lector tapado): el relé
// ocupa el lugar de los agujeros. Sin cinta, el lector vería luz todo el tiempo.

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
// esos microsegundos entre el pulso y la aplicación de la fila. Solo se puede medir con un
// osciloscopio (pulso del sensor → ventana de lectura del lector óptico); sin él, queda en 0 y
// el desfase de filas enteras se corrige con DESPLAZAMIENTO_FILAS tejiendo una prueba. Debe ser mucho menor que los
// 200 ms de una pasada (máximo permitido: 50 ms). Cero = se aplica apenas llega el pulso.
//
// Ojo con la otra dirección: si la ventana de lectura llega ANTES de que el pulso más la
// latencia del relé LCA110 (unos pocos ms) y del ESP32 alcancen a aplicar la fila, no se corrige
// con un retardo: hay que adelantar la aplicación con DESPLAZAMIENTO_FILAS = 1 (aplicar en el
// pulso N la fila N+1) o mover el blanco metálico sobre el eje.
// A_CONFIRMAR: se define con la medición sobre la máquina.
static const unsigned long RETARDO_APLICACION_US = 0;
static_assert(RETARDO_APLICACION_US <= 50000UL, "RETARDO_APLICACION_US no puede pasar de 50 ms");

// Qué parte de cada pasada queda activa la selección. Con la cinta de papel, entre dos
// agujeros seguidos de la misma columna hay papel: la bobina se activa y se suelta en cada
// pasada, aunque la combinación se repita. Una fila con 25 repeticiones son 25 activaciones
// separadas, no una sola larga.
//
// Se expresa como porcentaje de lo que duró la pasada anterior, que el sensor mide: así se
// adapta sola a la velocidad, como el agujero del papel, que queda más tiempo frente al lector
// cuando la máquina va lenta. A 300 pasadas por minuto, el 50 % son 100 ms. En la primera
// pasada, y después de una parada, todavía no hay una anterior con qué medir: se usa
// DURACION_SELECCION_INICIAL_MS.
//
// Con 0, la selección se mantiene hasta el pulso siguiente (no se suelta nunca entre pasadas):
// solo si la medición mostrara que la máquina lo necesita así.
// A_CONFIRMAR: se estima con una regla sobre la cinta de papel (diámetro del agujero dividido
// por la distancia entre los centros de dos agujeros seguidos) y se confirma tejiendo una
// prueba, o con un osciloscopio si hay uno.
static const unsigned long PORCENTAJE_SELECCION = 50;
static const unsigned long DURACION_SELECCION_INICIAL_MS = 100;
static_assert(PORCENTAJE_SELECCION <= 90UL, "PORCENTAJE_SELECCION tiene que dejar un hueco entre pasadas");
static_assert(DURACION_SELECCION_INICIAL_MS <= 180UL, "DURACION_SELECCION_INICIAL_MS tiene que ser menor que una pasada (200 ms)");

// -------------------------------------------------------------- Diagnóstico
#define LOG_SERIAL         true
#define BAUD_SERIAL        115200

#endif
