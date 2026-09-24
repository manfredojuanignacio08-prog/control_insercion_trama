# Nivel 2, código en desarrollo

Este directorio contiene el firmware del **Nivel 2**: el conteo real de pasadas
(Bloque C) y la selección del dibujo (Bloque D).

## Sobre el telar de destino

La fábrica tiene once telares Vamatex de tres modelos: C 201, C 301 y C 401. El
relevamiento y la documentación se hicieron sobre el C 201, pero la implementación
se haría sobre un C 401.

Los tres comparten la arquitectura de selección (lectora óptica sobre cinta de
papel perforada que comanda bobinas), así que el diseño se traslada. Antes de
instalar hay que verificar sobre la máquina de destino: cuántas bobinas tiene, con
qué tensión trabaja su botonera y si el lector óptico responde igual.

## El retroceso y el sentido de giro

El sensor inductivo no distingue si el eje gira hacia adelante o hacia atrás: ve
la paleta pasar y entrega un pulso igual. Cuando el operario usa Retroceder, el
telar deshace la última pasada y el sensor igual reporta movimiento.

Sin corregirlo pasarían dos cosas a la vez: el contador subiría cuando en
realidad bajó, y la fila del dibujo avanzaría cuando tenía que volver atrás. El
error acumulado sería de dos pasadas y dos filas por cada retroceso.

La corrección aprovecha que el Bloque A sensa el botón Retroceder. Al detectarlo
se marca el pulso siguiente como retroceso: el contador descuenta y la fila
retrocede, de modo que la próxima pasada hacia adelante repite exactamente la
fila que se acaba de deshacer. Que la señal se repita es lo correcto: esa pasada
se va a volver a tejer.

## Cambio de dibujo en caliente

El nodo compara en cada consulta el dibujo asignado al telar contra el que tiene
cargado. Si difieren, descarga el nuevo y vuelve a su primera fila.

Sin eso el nodo seguiría tejiendo el dibujo anterior después de que alguien
asignara otro desde la aplicación, y nadie lo notaría hasta ver la pieza.

## Reinicio del nodo a mitad de una pieza

La posición del dibujo y el conteo de pasadas viven en la memoria del nodo, que
se borra con cada reinicio: un corte de luz, una caída de tensión al enganchar
una bobina, o el watchdog.

Sin recuperación, el nodo retomaría el dibujo desde la primera fila con la pieza
a medio tejer. La tela quedaría con un salto visible que nadie podría explicar.

Por eso el nodo reporta su posición al backend en cada ciclo, y al arrancar la
lee de vuelta desde el mismo endpoint que le entrega el dibujo. Si hay una
producción en curso, retoma la fila y el conteo donde quedaron.

El conteo importa tanto como la fila: el backend descarta los reportes menores
que el valor guardado (esa es la protección contra reinicios), así que un nodo
que empezara de cero vería sus reportes ignorados hasta alcanzar el número
anterior.

Cuando lo que cambia es el dibujo asignado, en cambio, se arranca desde la
primera fila: ahí empezar de cero es lo correcto.

## Repeticiones por fila

Una fila del dibujo es una pasada. Pero en un tejido real es habitual que la misma
combinación de bobinas se repita cien o mil veces seguidas antes de cambiar, y
dibujar cien filas idénticas era impracticable.

Por eso cada fila lleva un número de repeticiones: cuántas pasadas seguidas se teje
esa misma fila antes de pasar a la siguiente. Una vuelta completa del dibujo son la
suma de todas las repeticiones, no la cantidad de filas.

El retroceso acompaña: deshace una pasada dentro de la fila, y solo cuando se agotan
las repeticiones vuelve a la fila anterior, a su última pasada.

Los dibujos guardados antes de esto no traen el campo; el backend manda un 1 por
fila y se tejen igual que siempre.

## Depende del Bloque C

El Nivel 2 **no puede funcionar sin el sensor de pasada instalado y validado**.
No es una mejora opcional: el firmware aplica cada fila del dibujo cuando llega
un pulso del sensor, porque es la única forma que tiene de saber que la máquina
avanzó una pasada.

Sin ese pulso, el nodo no tiene reloj: no sabe cuándo cambiar de fila y el dibujo
no avanza. Por eso el orden de instalación es Bloque C primero, Bloque D después,
aunque en la documentación aparezcan como bloques separados.

## Estado

**No está instalado en la máquina.** Es código de desarrollo, escrito para poder
revisarlo y probarlo en banco antes de que existan las mediciones que faltan.

El firmware que hoy corre en el telar es el del Nivel 1, que está en
`esp32/control_trama_esp32/`. Los dos son proyectos separados a propósito: el
Nivel 1 ya funciona y no conviene tocarlo mientras se desarrolla el Nivel 2.

## Qué falta antes de poder usarlo

| Medición | Para qué |
|---|---|
| Tensión rectificada de los 24 V AC del telar | Elegir la resistencia del canal del sensor |
| Relación de giro del eje elegido | Confirmar que da una vuelta por pasada |
| Tensión y corriente en la salida de un lector óptico | Confirmar el relé y su conexionado |
| Si el agujero del papel abre o cierra el circuito | Definir si el relé va en serie o en paralelo, y el valor de `CANAL_ACTIVO_EN_ALTO` |
| Sincronización entre el pulso del sensor y la lectura del telar | Ajustar `DESPLAZAMIENTO_FILAS`, que solo se conoce tejiendo una prueba |

Hasta tener esos datos, los valores marcados como `A_CONFIRMAR` en `config_nivel2.h`
son estimaciones y no deben darse por buenos.

## Archivos

- `nivel2_seleccion.ino`, el programa principal
- `config_nivel2.h`, parámetros y credenciales, en un solo lugar
- `sensor_pasada.h`, el conteo de pasadas (Bloque C)
- `seleccion_dibujo.h`, el comando de los cuatro canales (Bloque D)

## Cómo está organizado (dos núcleos)

`loop()` (núcleo 1) es solo tiempo real: cuenta pulsos y aplica filas, sin esperar nunca
a la red. Toda la red (consultas, descarga del dibujo, reporte de pasadas, aviso de
parada) corre en `tareaRed()` (núcleo 0). Antes todo estaba en `loop()` y una consulta
lenta dejaba pasar hasta 30 pasadas con la fila anterior congelada.

Mismas librerías que el Nivel 1: core ESP32 3.x y ArduinoJson 7.x. La URL del backend,
el `TELAR_ID` (8) y la clave `DEVICE_KEY` son los mismos que en el Nivel 1.

## Retomar tras un corte de luz o un traslado

Al arrancar, el nodo baja del backend el dibujo asignado, la **fila donde quedó** y el **conteo de
pasadas**, y sigue desde ahí (no desde la fila 1). Mientras teje reporta la posición cada segundo y
una vez más al pausar, así que en una pausa normal se retoma exacto, y ante un corte de luz se pierden
como mucho ~5 pasadas (la posición queda marcada como incierta para que el operario la verifique).

## El sensor como detector de parada

Si con el telar en "tejiendo" no llega ningún pulso durante `TIMEOUT_SIN_PULSOS_MS` (3 s;
en el arranque rige `GRACIA_ARRANQUE_MS`, 15 s, hasta el primer pulso), el firmware apaga
los canales y avisa al backend (`evento-fisico` con `sin_senal`), que pasa el telar a
"pausado" y deja un registro en el log de errores. El Nivel 1 ve el cambio de estado y
pulsa Pausa: ante una parada inesperada, el sistema termina con la máquina detenida.

## Cómo probarlo sin el telar

`config_nivel2.h` tiene una constante `MODO_BANCO`. Con ella en `true`, el
programa no espera pulsos reales del sensor: los genera él mismo a 5 por segundo,
que es el ritmo del telar a 300 pasadas por minuto. Sirve para verificar la
lógica de avance y el comando de las salidas con un LED en cada canal.

**Por defecto está en `false`, y tiene que volver a `false` antes de instalar**: con el
modo banco activo el firmware ignora el sensor real y aplica las filas al ritmo de un
reloj interno, desfasado del telar.
