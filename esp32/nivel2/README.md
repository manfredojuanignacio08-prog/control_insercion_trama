# Nivel 2, código en desarrollo

Este directorio contiene el firmware del **Nivel 2**: el conteo real de pasadas
(Bloque C) y la selección del dibujo (Bloque D).

## Una sola placa

El gabinete tiene **un único ESP32**. Por eso este firmware hace también todo lo del Nivel 1:
los tres relés en paralelo con Marcha, Pausa y Retroceder y el sensado de esos botones (Bloque A),
con la misma lógica que `esp32/control_trama_esp32/`. Los pines no se pisan:

| Función | Pines |
|---|---|
| Relés de Marcha, Pausa y Retroceder (Bloque A) | 25, 26, 27 |
| Sensado de la botonera (Bloque A) | 32, 33, 34 |
| Sensor de pasada (Bloque C) | 35 |
| Canales de selección, relés LCA110 (Bloque D) | 18, 19, 21, 22 |
| LED de la placa (conectado a la red) | 2 |

Qué se carga en la placa según lo que esté armado:

- **Solo el Bloque A** (hoy): `esp32/control_trama_esp32/control_trama_esp32.ino`, con su `config.h`.
- **Bloques A, C y D**: `esp32/nivel2/nivel2.ino`, con `config_nivel2.h`. Reemplaza al anterior.

Con dibujo nuevo, la placa pulsa Marcha recién cuando tiene el dibujo cargado, así la máquina no
arranca tejiendo sin la selección. Su consulta al backend (`?origen=nivel2`) mantiene a la vez el
"ESP32 conectado" de la web y la señal de vida del sensor.

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

Sin repeticiones, una fila del dibujo sería una pasada. Pero en un tejido real es habitual que la misma
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
`esp32/control_trama_esp32/`. No se modifica mientras se desarrolla este: cuando se
instalen los Bloques C y D, este firmware lo reemplaza en la misma placa (ver «Una sola placa»).

## Qué falta antes de poder usarlo

| Medición | Para qué |
|---|---|
| Tensión rectificada de los 24 V AC del telar | Elegir la resistencia del canal del sensor |
| Relación de giro del eje elegido | Confirmado el 10/09/2026: una vuelta por pasada |
| Tensión y corriente en la salida de un lector óptico | Confirmar el relé y su conexionado |
| Si el agujero del papel abre o cierra el circuito | Definir si el relé va en serie o en paralelo, y el valor de `CANAL_ACTIVO_EN_ALTO` |
| Sincronización entre el pulso del sensor y la lectura del telar | Ajustar `DESPLAZAMIENTO_FILAS`, que solo se conoce tejiendo una prueba |
| Qué parte de cada pasada dura la señal del lector con la cinta | Ajustar `PORCENTAJE_SELECCION` (hoy 50 %): la selección se activa y se suelta en cada pasada, como el papel |

Hasta tener esos datos, los valores marcados como `A_CONFIRMAR` en `config_nivel2.h`
son estimaciones y no deben darse por buenos.

## Archivos

- `nivel2.ino`, el programa principal. Se llama igual que la carpeta porque el Arduino IDE lo exige:
  antes se llamaba `nivel2_seleccion.ino`, y al abrirlo el IDE ofrecía moverlo solo a otra carpeta,
  sin los `.h`, y no compilaba. Se abre `esp32/nivel2/nivel2.ino` y los demás archivos aparecen
  como pestañas.
- `config_nivel2.h`, parámetros y credenciales, en un solo lugar
- `sensor_pasada.h`, el conteo de pasadas (Bloque C)
- `seleccion_dibujo.h`, el comando de los cuatro canales (Bloque D)
- `posicion_dibujo.h`, la posición dentro del dibujo (fila y pasadas que le faltan), el mismo
  modelo que `backend/src/utils/posicion.js`; se prueba en la PC con `verificacion/host/correr.sh`

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

**Primero, un relé solo y sin red:** `esp32/pruebas/prueba_rele_lca110/prueba_rele_lca110.ino`
maneja un LCA110 en el GPIO 18 sin WiFi ni backend. Imita 25 pasadas con el canal activo y 25 sin
activar, a 300 por minuto: el LED de la salida parpadea 5 veces por segundo durante 5 s y queda
apagado 5 s. Por el monitor serie, `1` / `0` dejan el relé cerrado o abierto fijo para medir con el
multímetro entre las patas 4 y 6, y `p` vuelve al patrón.

**Después, el firmware de este nivel:**

`config_nivel2.h` tiene una constante `MODO_BANCO`. Con ella en `true`, el
programa no espera pulsos reales del sensor: los genera él mismo a 5 por segundo
mientras el telar está "tejiendo" (como la máquina, que en pausa no da pulsos), que es el
ritmo del telar a 300 pasadas por minuto. Necesita la red y el backend como en la máquina:
el dibujo se asigna desde la web y se arranca con ▶. Como el mismo firmware maneja los relés
del Bloque A, ▶ también pulsa el relé de Marcha: en el banco, los relés no tienen que estar
conectados a la botonera del telar. Sirve para verificar la
lógica de avance y el comando de las salidas con un LED en cada canal.

**Por defecto está en `false`, y tiene que volver a `false` antes de instalar**: con el
modo banco activo el firmware ignora el sensor real y aplica las filas al ritmo de un
reloj interno, desfasado del telar.
