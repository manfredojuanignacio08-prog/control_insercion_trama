# Niveles de control del telar — alcance del ESP32

Este documento aclara **qué parte del telar controla el sistema hoy** y qué
quedaría como evolución futura. Es importante para entender el alcance real
del proyecto y para explicarlo bien en la presentación.

## El telar tiene, en la práctica, dos "máquinas"

En este tipo de telar (tejido plano con mecanismo **Jacquard**) conviven dos
funciones bien separadas:

1. **La máquina de accionamiento.** Es la que mueve el telar: arranca, para,
   avanza y retrocede el tejido. Se opera con la botonera física
   (Marcha / Pausa).

2. **La máquina lectora de secuencia (el Jacquard con tarjetas perforadas).**
   Es la que "lee" el dibujo y le dicta al telar, pasada por pasada, qué hacer
   para formar el patrón. Hoy funciona con **tarjetas perforadas físicas**:
   aproximadamente una tarjeta por ciclo, y cambiar de diseño implica
   desmontar e intercambiar cientos de tarjetas a mano (un proceso de horas).

El sistema de este proyecto apunta a reemplazar la **función** de esa segunda
máquina (la lectora) con algo digital: la página web + la base de datos pasan
a ser las que definen y almacenan la secuencia del patrón, en vez de las
tarjetas de cartón.

## Los dos niveles de control

Conviene separar el control del telar en dos niveles, porque tienen muy
distinta dificultad y conviene ser honesto sobre cada uno.

### 🟢 Nivel 1 — Arranque y parada (lo que hace el ESP32 HOY)

El ESP32 acciona la **máquina de accionamiento**: darle Play (Marcha) y Pausa
al telar, mediante los dos relés en paralelo con la botonera, como describe el
resto de esta documentación.

- **Estado:** resuelto en el diseño y probado a nivel de código.
- **Dificultad:** baja. No invade la electrónica del telar; solo "aprieta los
  botones" a distancia, y la botonera manual sigue funcionando igual.
- **Qué permite:** manejar el telar desde la web — darle play, pausarlo —
  sin estar físicamente frente a la máquina.

**Este nivel es el alcance actual del proyecto y no tiene inconvenientes de
fondo.**

### 🟡 Nivel 2 — Dictar la secuencia del patrón (evolución futura)

Reemplazar **por completo** a la máquina lectora significa que el sistema no
solo dé Play, sino que le entregue al telar la **secuencia completa del
dibujo** (qué hacer en cada pasada), ocupando el lugar de las tarjetas
perforadas del Jacquard.

- **Estado:** fuera del alcance de esta etapa. Es la meta a la que apunta el
  proyecto, pero requiere un paso de estudio previo.
- **El punto a resolver:** hay que averiguar **cómo la máquina lectora le
  dicta hoy la secuencia a la de accionamiento**. En este telar la lectura es
  un **mecanismo Jacquard por tarjetas perforadas físicas** (no digitalizado):
  es un sistema mecánico, no una señal eléctrica simple. Por eso reemplazarlo
  no es tan directo como el Nivel 1.
- **Camino probable:** llegar al Nivel 2 implicaría un **retrofit del
  Jacquard** — es decir, un Jacquard electrónico (o un mecanismo que
  seleccione los hilos por electroimanes/actuadores) que reciba la secuencia
  desde el backend en lugar de leerla de las tarjetas. Eso es un proyecto de
  hardware en sí mismo, sobre la mecánica del telar, y excede la etapa actual.

## Cómo plantearlo (resumen para la presentación)

- **Ya cubierto y demostrable:** el sistema **define y guarda los patrones**
  (reemplaza la *función* de la máquina lectora a nivel de diseño y datos), y
  el **ESP32 controla el arranque y la parada** del telar (Nivel 1). Con esto,
  darle Play en la web y que el telar arranque es viable y sin inconvenientes
  de fondo.
- **Como evolución (Nivel 2):** que el ESP32 (o un Jacquard electrónico de
  retrofit) le **dicte la secuencia completa** al telar, reemplazando
  físicamente a las tarjetas perforadas. Depende de intervenir el mecanismo
  Jacquard, y queda planteado como el siguiente paso una vez validado el
  prototipo en un único telar.

En una frase: **hoy el sistema decide y guarda el "qué tejer", y el ESP32
puede arrancar y parar el telar; que además le dicte físicamente cada pasada,
ocupando el lugar de las tarjetas del Jacquard, es la evolución que sigue.**
