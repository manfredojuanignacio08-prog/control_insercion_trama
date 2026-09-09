# Diagramas del proyecto

Cada diagrama está en SVG, que es el original y se puede editar, y en PNG para
insertarlo en documentos.

## `hardware/`, cómo se conecta

### `diagrama_conexion_electrica.svg`
El nodo de control del Bloque A: los tres relés hacia la botonera, la etapa de
sensado con sus optoacopladores, la fuente y el fusible de línea. Es el que hay
que tener a mano al armar la placa.

### `canal_sensor.svg`
Un canal del sensor de pasada del Bloque C, de punta a punta: el sensor
inductivo, la rectificación de los 24 V de alterna del telar, el optoacoplador
y el pin del microcontrolador. Incluye la tabla para calcular la resistencia
según la tensión que se mida.

### `canal_rele.svg`
Un canal de la selección del dibujo del Bloque D: el relé PhotoMOS AQY212GH con
sus cuatro patas, las dos resistencias y las dos formas posibles de conectarlo
al lector óptico, en serie o en paralelo.

### `diagrama_nivel2_marcos.svg`
Vista de conjunto del Nivel 2: cómo el microcontrolador comanda los seis
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
