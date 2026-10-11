# Firmware del ESP32 del telar (un solo programa)

Esta carpeta es **el único firmware** de la placa. Se abre `control_trama_esp32.ino` en el Arduino
IDE (los demás archivos aparecen como pestañas) y se sube tal cual.

## Qué hace, según lo que esté armado

El gabinete tiene **un único ESP32**. En `config.h`, `NIVEL2_INSTALADO` dice qué está conectado:

- **`false` (hoy):** solo el **Bloque A**. Los tres relés en paralelo con Marcha, Pausa y
  Retroceder, y el sensado de esos botones para saber cuándo alguien los usa a mano. La consulta al
  backend lleva `?origen=esp32`, que mantiene el "ESP32 conectado" de la web; las pasadas las estima
  la web por tiempo.
- **`true`:** además el **Bloque C** (conteo real de pasadas con el sensor inductivo) y el
  **Bloque D** (selección del dibujo con los relés LCA110). La consulta pasa a `?origen=nivel2`, que
  además es la señal de vida del sensor: la web deja de estimar y muestra el conteo del sensor. Por
  eso se pone en `true` recién con el sensor conectado; sin él, el conteo quedaría en cero.

Los pines no se pisan:

| Función | Pines |
|---|---|
| Relés de Marcha, Pausa y Retroceder (Bloque A) | 25, 26, 27 |
| Sensado de la botonera (Bloque A) | 32, 33, 34 |
| Sensor de pasada (Bloque C) | 35 |
| Canales de selección, relés LCA110 (Bloque D) | 18, 19, 21, 22 |
| LED de la placa (conectado a la red) | 2 |

Con el Nivel 2 y un dibujo nuevo, la placa pulsa Marcha recién cuando tiene el dibujo cargado, así la
máquina no arranca tejiendo sin la selección.

Antes había dos programas (`control_trama_esp32` para el Bloque A y `nivel2` para todo). Se
unificaron en este: el del Nivel 2 ya hacía todo lo del Bloque A con la misma lógica, y ahora el
interruptor `NIVEL2_INSTALADO` reemplaza a cambiar de programa.

## Sobre el telar de destino

La fábrica tiene once telares Vamatex de tres modelos: C 201, C 301 y C 401. El
relevamiento, la documentación y la implementación son sobre el C 201 (matrícula 1104).

Los tres comparten la arquitectura de selección (lectora óptica sobre cinta de
papel perforada que comanda bobinas), así que el diseño se traslada. En el C 201 ya
están confirmadas las cuatro bobinas (el dueño, 19/09/2026) y la tensión de la botonera
(24 V en alterna, medida el 19/08/2026); falta medir la salida del lector óptico. Si se
instalara en otro modelo, hay que verificar esas tres cosas sobre esa máquina.

## El retroceso y el sentido de giro

El sensor inductivo no distingue si el eje gira hacia adelante o hacia atrás: ve
la paleta pasar y entrega un pulso igual. Cuando el operario usa Retroceder, el
telar deshace la última pasada y el sensor igual reporta movimiento.

Sin corregirlo pasarían dos cosas a la vez: el contador subiría cuando en
realidad bajó, y la fila del dibujo avanzaría cuando tenía que volver atrás. El
error acumulado sería de dos pasadas y dos filas por cada retroceso.

La corrección aprovecha que el Bloque A sensa el botón Retroceder (y que el backend cuenta
cada retroceso, venga de la web o de la botonera). Al enterarse, el nodo marca el pulso
siguiente como retroceso: el contador descuenta y la fila retrocede, de modo que la próxima
pasada hacia adelante repite exactamente la fila que se acaba de deshacer. Que la señal se
repita es lo correcto: esa pasada se va a volver a tejer. En el pulso del retroceso no se
selecciona nada (los canales quedan en reposo): la máquina está deshaciendo una pasada, no
tejiendo una.

El aviso puede llegar DESPUÉS del pulso (la consulta al backend es cada 2,5 s). Si el telar
está en pausa y el último pulso se contó hacia adelante hace menos de 5 s, ese pulso se
reclasifica: el contador baja dos (se quita el +1 y se resta 1) y la fila vuelve dos pasadas.

## Cambio de dibujo en caliente

El nodo compara en cada consulta el dibujo asignado al telar (y la producción en curso)
contra lo que tiene cargado. Si cambió el dibujo, o empezó una producción nueva del mismo
dibujo (⏹ y ▶ seguidos), lo vuelve a bajar y adopta la posición del backend, que en una
producción nueva es la primera fila con el conteo en cero.

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

El conteo importa tanto como la fila: el backend descarta un reporte que baja más
de 25 pasadas respecto del valor guardado con una fila que no acompaña esa bajada (esa
es la protección contra reinicios) y le devuelve al nodo el valor guardado, para que
vuelva a bajar posición y conteo. Un nodo que empezara de cero no podría reportar nada
hasta readoptarlos.

Cuando lo que cambia es el dibujo asignado, en cambio, se arranca desde la
primera fila: ahí empezar de cero es lo correcto.

## Repeticiones por fila

Sin repeticiones, una fila del dibujo sería una pasada. Pero en un tejido real es habitual que la misma
bobina se repita cien o mil veces seguidas antes de cambiar, y
dibujar cien filas idénticas era impracticable.

Por eso cada fila lleva un número de repeticiones: cuántas pasadas seguidas se teje
esa misma fila antes de pasar a la siguiente. Una vuelta completa del dibujo son la
suma de todas las repeticiones, no la cantidad de filas.

El retroceso acompaña: deshace una pasada dentro de la fila, y solo cuando se agotan
las repeticiones vuelve a la fila anterior, a su última pasada.

Los dibujos guardados antes de esto no traen el campo; el backend manda un 1 por
fila y se tejen igual que siempre.

## Intercalados

Varias filas seguidas pueden formar un grupo que se teje alternándose: por ejemplo las filas de
las bobinas 1, 3, 4 y 2 durante 120 pasadas (1, 3, 4, 2, 1, 3...). El backend se lo manda al nodo
ya resuelto: en `repeticiones_por_fila`, la primera fila del grupo trae el total del grupo y las
demás 0; en `secuencias_por_fila`, la primera fila trae la bobina de cada pasada de una vuelta del
grupo (0 = una fila sin bobina). Las filas de largo 0 se saltean al avanzar y al retroceder
(`posicion_dibujo.h`), y en cada pulso se activa la bobina que sigue en el ciclo según cuántas
pasadas del grupo ya se tejieron (`seleccionAplicarIntercalada`). Así la posición sigue siendo
fila + pasada dentro de la fila, igual que en el backend, y el retroceso y la recuperación tras un
reinicio funcionan sin nada aparte.

## Depende del Bloque C

El Nivel 2 **no puede funcionar sin el sensor de pasada instalado y validado**.
No es una mejora opcional: el firmware aplica cada fila del dibujo cuando llega
un pulso del sensor, porque es la única forma que tiene de saber que la máquina
avanzó una pasada.

Sin ese pulso, el nodo no tiene reloj: no sabe cuándo cambiar de fila y el dibujo
no avanza. Por eso el orden de instalación es Bloque C primero, Bloque D después,
aunque en la documentación aparezcan como bloques separados.

## Estado del Nivel 2

**El Nivel 2 no está instalado en la máquina.** El 10/10/2026 se probó todo en protoboard (el
sensor de pasada y el relé LCA110 con el ESP32) y funcionó; ahora se está haciendo la plaqueta
para probarlo de manera correcta en el telar. Hasta entonces la placa corre este mismo programa
con `NIVEL2_INSTALADO` en `false`: solo maneja la botonera.

## Qué falta antes de poder usarlo

| Medición | Para qué |
|---|---|
| Tensión continua que entrega el telar al sensor (12 a 14 V), con la máquina en marcha | Confirmar la resistencia del canal del sensor (1,2 kΩ; con 24 V sería de 2,2 kΩ) |
| Relación de giro del eje elegido | Confirmado el 10/09/2026: una vuelta por pasada |
| Tensión y corriente en la salida de un lector óptico | Confirmar el relé y su conexionado |
| Si el agujero del papel abre o cierra el circuito | Definir si el relé va en serie o en paralelo, y el valor de `CANAL_ACTIVO_EN_ALTO` |
| Sincronización entre el pulso del sensor y la lectura del telar | Ajustar `DESPLAZAMIENTO_FILAS`, que solo se conoce tejiendo una prueba |
| Qué parte de cada pasada dura la señal del lector con la cinta | Ajustar `PORCENTAJE_SELECCION` (hoy 50 %): la selección se activa y se suelta en cada pasada, como el papel |

Hasta tener esos datos, los valores marcados como `A_CONFIRMAR` en `config.h`
son estimaciones y no deben darse por buenos.

## Archivos

- `control_trama_esp32.ino`, el programa principal. Se llama igual que la carpeta porque el Arduino
  IDE lo exige: si no, al abrirlo ofrece moverlo solo a otra carpeta, sin los `.h`, y no compila.
- `config.h`, parámetros y credenciales, en un solo lugar (incluido `NIVEL2_INSTALADO`)
- `sensor_pasada.h`, el conteo de pasadas (Bloque C)
- `seleccion_dibujo.h`, el comando de los cuatro canales (Bloque D)
- `posicion_dibujo.h`, la posición dentro del dibujo (fila y pasadas que le faltan), el mismo
  modelo que `backend/src/utils/posicion.js`; se prueba en la PC con `verificacion/host/correr.sh`

## Cómo está organizado (dos núcleos)

`loop()` (núcleo 1) es solo tiempo real: cuenta pulsos y aplica filas, sin esperar nunca
a la red. Toda la red (consultas, descarga del dibujo, reporte de pasadas, aviso de
parada) corre en `tareaRed()` (núcleo 0). Antes todo estaba en `loop()` y una consulta
lenta dejaba pasar hasta 30 pasadas con la fila anterior congelada.

Librerías: core ESP32 3.x y ArduinoJson 7.x. Los pulsos de los relés del Bloque A también corren
en el núcleo 0, así un pulso de 300 ms no frena el conteo.

## Retomar tras un corte de luz o un traslado

Al arrancar, el nodo baja del backend el dibujo asignado, la **fila donde quedó** y el **conteo de
pasadas**, y sigue desde ahí (no desde la fila 1). Mientras teje reporta la posición cada segundo y
una vez más al pausar, así que en una pausa normal se retoma exacto, y ante un corte de luz se pierden
como mucho ~5 pasadas (la posición queda marcada como incierta para que el operario la verifique).

## El sensor como detector de parada

Si con el telar en "tejiendo" no llega ningún pulso durante `TIMEOUT_SIN_PULSOS_MS` (3 s;
en el arranque rige `GRACIA_ARRANQUE_MS`, 15 s, hasta el primer pulso), el firmware apaga
los canales y avisa al backend (`evento-fisico` con `sin_senal`), que pasa el telar a
"pausado" y deja un registro en el log de errores. En la consulta siguiente el Bloque A ve el
cambio de estado y pulsa Pausa: ante una parada inesperada, el sistema termina con la máquina
detenida.

## Cómo probarlo sin el telar

**Primero, un relé solo y sin red:** `esp32/pruebas/prueba_rele_lca110/prueba_rele_lca110.ino`
maneja un LCA110 en el GPIO 18 sin WiFi ni backend. Imita 25 pasadas con el canal activo y 25 sin
activar, a 300 por minuto: el LED de la salida parpadea 5 veces por segundo durante 5 s y queda
apagado 5 s. Por el monitor serie, `1` / `0` dejan el relé cerrado o abierto fijo para medir con el
multímetro entre las patas 4 y 6, y `p` vuelve al patrón.

**Después, el firmware completo:**

`config.h` tiene una constante `MODO_BANCO` (necesita `NIVEL2_INSTALADO` en `true`). Con ella en `true`, el
programa no espera pulsos reales del sensor: los genera él mismo a 5 por segundo
mientras el telar está "tejiendo" (como la máquina, que en pausa no da pulsos), que es el
ritmo del telar a 300 pasadas por minuto. Necesita la red y el backend como en la máquina:
el dibujo se asigna desde la web y se arranca con ▶. Como el mismo firmware maneja los relés
del Bloque A, ▶ también pulsa el relé de Marcha: en el banco, los relés no tienen que estar
conectados a la botonera del telar. Sirve para verificar la
lógica de avance y el comando de las salidas con un LED en cada canal.

**Por defecto está en `false`, y tiene que volver a `false` antes de instalar** (y
`NIVEL2_INSTALADO` también, si el sensor todavía no está conectado): con el
modo banco activo el firmware ignora el sensor real y aplica las filas al ritmo de un
reloj interno, desfasado del telar.
