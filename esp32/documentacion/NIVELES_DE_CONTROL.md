# Niveles de control del telar, alcance del ESP32

Este documento aclara **qué parte del telar controla el sistema hoy** y qué
queda como evolución. Es importante para entender el alcance real
del proyecto y para explicarlo bien en la presentación.

> **Estado actual (relevamiento confirmado).** El telar de implementación es el Vamatex C 201:
> la secuencia la lee un **dobby con cinta de papel perforada** y **cuatro bobinas de selección**
> (no un Jacquard por tarjetas, como se suponía al principio; las secciones de abajo conservan ese
> análisis inicial). El Nivel 2 dejó de ser "evolución futura": quedó instalado y probado en el telar el
> 30/10/2026 por la vía de control por marcos del final de este documento, con un sensor inductivo y cuatro relés LCA110
> en el lugar de los lectores ópticos. Todo corre en **un solo ESP32 con un solo programa** (`esp32/control_trama_esp32/`).

## El telar tiene, en la práctica, dos "máquinas"

En este tipo de telar (tejido plano con mecanismo **Jacquard**) conviven dos
funciones bien separadas:

1. **La máquina de accionamiento.** Es la que mueve el telar: arranca, para,
   avanza y retrocede el tejido. Se opera con la botonera física
   (Marcha / Pausa / Retroceder).

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

### 🟢 Nivel 1, Arranque y parada (lo que hace el ESP32 HOY)

El ESP32 acciona la **máquina de accionamiento**: darle Marcha, Pausa y Retroceder
al telar, mediante los tres relés en paralelo con la botonera, como describe el
resto de esta documentación.

- **Estado:** instalado y probado en el telar el 19/09/2026.
- **Dificultad:** baja. No invade la electrónica del telar; solo "aprieta los
  botones" a distancia, y la botonera manual sigue funcionando igual.
- **Qué permite:** manejar el telar desde la web (arrancarlo, pausarlo,
  retrocederlo) sin estar físicamente frente a la máquina.

**Este nivel ya está instalado en el telar y no tiene inconvenientes de
fondo.**

### 🟢 Nivel 2, Dictar la secuencia del patrón (instalado y probado: ver el final)

Reemplazar **por completo** a la máquina lectora significa que el sistema no
solo dé Marcha, sino que le entregue al telar la **secuencia completa del
dibujo** (qué bobina se activa en cada pasada), ocupando el lugar de las
tarjetas perforadas (en este telar, la cinta de papel).

- **Estado:** instalado y probado en el telar el 30/10/2026, con el gabinete y los
  cuatro canales: el sensor cuenta las pasadas y cada relé LCA110 selecciona su bobina
  según el dibujo. Antes se había probado en protoboard (10/10/2026) y con el primer
  canal en la máquina (17/10/2026).
- **El punto a resolver:** había que averiguar **cómo la máquina lectora le
  dicta la secuencia a la de accionamiento**. Al principio se suponía un
  **mecanismo Jacquard por tarjetas perforadas físicas**, un sistema mecánico
  y no una señal eléctrica simple. El relevamiento mostró que en este telar la
  lee un lector óptico sobre una cinta de papel, que da una señal eléctrica
  por bobina, y eso simplifica el reemplazo.
- **Camino elegido:** un relé LCA110 en el lugar de cada lector óptico,
  comandado por el ESP32 con la secuencia que recibe del backend, y un sensor
  inductivo que cuenta las pasadas. Es un proyecto de hardware en sí mismo,
  pero no toca la mecánica del telar.

## Cómo plantearlo (resumen para la presentación)

- **Ya cubierto y demostrable:** el sistema **define y guarda los patrones**
  (reemplaza la *función* de la máquina lectora a nivel de diseño y datos), y
  el **ESP32 controla el arranque, la pausa y el retroceso** del telar (Nivel 1),
  instalado y probado en la máquina.
- **En desarrollo (Nivel 2):** que el ESP32 le **dicte la secuencia completa**
  al telar, reemplazando a la cinta perforada, con un relé LCA110 en el lugar
  de cada lector óptico.

En una frase: **hoy el sistema decide y guarda el "qué tejer", y el ESP32
arranca, pausa y retrocede el telar; que además le dicte cada pasada, ocupando
el lugar de la cinta perforada, es lo que se está desarrollando.**

---

## 📌 La vía viable para el Nivel 2: control por marcos (dobby)

Dado que los tejidos de esta planta son **mayormente patrones repetitivos**
(tipo cortina), el Nivel 2 es alcanzable como prototipo real mediante
**control por marcos (dobby)** en lugar de control hilo por hilo. Esto reduce
el hardware de "cientos de electroimanes" a las **cuatro bobinas de selección** que el
telar ya tiene (confirmado por el dueño el 19/09/26; el relevamiento del 28/08/26 había estimado
seis), algo que el mismo ESP32 del Nivel 1 maneja sin problema.

El desarrollo completo de esta solución -cómo funciona, el hardware, y cómo se
conecta con lo que ya está hecho- está en:
**`NIVEL2_CONTROL_POR_MARCOS.md`** (en esta misma carpeta), y el firmware en `esp32/control_trama_esp32/` (con `NIVEL2_INSTALADO` en `true`).
