# Diagramas del proyecto

Cada diagrama está en SVG, que es el original y se puede editar, y en PNG para
insertarlo en documentos.

## `hardware/`, cómo se conecta

### `diagrama_conexion_electrica.svg`
El nodo de control del Bloque A: los tres relés hacia la botonera, la etapa de
sensado con sus optoacopladores, la fuente y el fusible de línea. Es el que hay
que tener a mano al armar la placa.

### `diagrama_bloque_A.svg`
El Bloque A completo: desde la entrada de red hasta la botonera, con la fuente, el
capacitor de 5 V, los dos módulos de relé y la etapa de sensado de los tres canales.

### `diagrama_bloque_C.svg`
El Bloque C completo: el sensor inductivo alimentado con los 12 a 14 V de continua que
entrega el telar (ya vienen rectificados: sin puente ni regulador) y el canal de
aislamiento hasta el pin del microcontrolador.

### `diagrama_bloques_A_y_C.svg`
Los dos bloques juntos, para ver cómo comparten el gabinete y el microcontrolador
manteniendo sus alimentaciones separadas.

### `canal_sensor.svg`
Un canal del sensor de pasada del Bloque C, de punta a punta: el sensor
inductivo con los 12 a 14 V continuos del telar, la resistencia de 1,2 kΩ, el
optoacoplador PC817 y el pin del microcontrolador. Incluye la fórmula para
recalcular la resistencia según la tensión que se mida.

### `canal_rele.svg`
Un canal de la selección del dibujo del Bloque D: el relé LCA110 (OptoMOS, salida MOSFET) con
las cuatro patas que se usan (1 y 2 del lado del ESP32, 4 y 6 de la salida), las dos resistencias y las dos formas posibles de conectarlo
al lector óptico, en serie o en paralelo.

### `diagrama_bloque_D.svg`
El Bloque D completo: los cuatro relés LCA110 con sus pines (18, 19, 21 y 22), las resistencias de
330 Ω y 10 kΩ y el GND común del lado del ESP32; del lado del telar, cada relé conectado solo al par de
señal (A y B) de su lector, y los dos cables de alimentación de los lectores, que no van a ningún relé.
Abajo compara las dos conexiones posibles: en paralelo (puente entre A y B, sin cortar nada,
`CANAL_ACTIVO_EN_ALTO` en `true`) y en serie (se corta el cable A y el relé se intercala,
`CANAL_ACTIVO_EN_ALTO` en `false`), con la medición que decide cuál corresponde.

### `canal_rele_sin_sensor.svg`
El relé LCA110 en lugar del lector óptico, que se saca: un canal conectado directo a los bornes de
la plaqueta. Arriba, las mediciones que deciden cuál de los tres casos corresponde. Caso 1, la
plaqueta pone la tensión: el relé va directo en los 2 bornes de señal y los cables de alimentación
del lector quedan aislados. Caso 2A, la tensión la ponía el lector y con agujero la salida va a +V:
el relé va entre + y la señal, con 10 kΩ ½ W de la señal a −. Caso 2B, con agujero la salida va a
0 V: 10 kΩ ½ W de + a la señal y el relé entre la señal y −. Cada caso indica cómo queda
`CANAL_ACTIVO_EN_ALTO`.

### `diagrama_nivel2_marcos.svg`
Vista de conjunto del Nivel 2: cómo el microcontrolador comanda los cuatro
lectores ópticos que hoy lee la cinta de papel.

## `sistema/`, cómo funciona

### `diagrama_logico_arquitectura.svg`
El recorrido completo de una orden, desde que el operario toca un botón en la
aplicación hasta que el relé cierra el contacto en la máquina.

### `arbol_problemas_soluciones.svg`
El árbol de causas y efectos del problema que resuelve el proyecto, con las
soluciones propuestas para cada causa.

## Cómo regenerar los PNG

Los PNG se obtienen de los SVG. Si se edita un SVG hay que volver a exportarlo,
porque los documentos usan el PNG.
