# Nivel 2 por control de marcos (dobby), la vía viable

Este documento amplía el `NIVELES_DE_CONTROL.md` con la **solución concreta y
alcanzable** para el Nivel 2, dado que los tejidos de esta planta son
**mayormente patrones simples y repetitivos** (tipo cortina: un dibujo que se
repite constantemente), y no logos ni figuras complejas.

Esa característica -patrones repetitivos- es la que vuelve el Nivel 2
**realizable como prototipo real**, no como una meta lejana.

## La idea clave: no hace falta control hilo por hilo

El mecanismo Jacquard original controla **cada hilo por separado** (por eso
puede hacer dibujos complejos, pero necesita cientos o miles de elementos).
Un patrón que se repite **no necesita esa complejidad**: se puede tejer
controlando **marcos** (grupos de hilos que suben y bajan juntos), que es
justamente lo que hace un telar **dobby o de maquinita**.

| Enfoque | Qué controla | Elementos necesarios | ¿Viable como prototipo? |
|---|---|---|---|
| Jacquard (hilo por hilo) | cada hilo | cientos / miles | ❌ inviable a esa escala |
| **Dobby (por marcos)** | grupos de hilos | **4** bobinas de selección (C 201) | ✅ **sí, con un ESP32** |

Toda tela con un patrón que se repite (cortinas, rayas, espigado, panal,
tramas geométricas) se define por una **secuencia corta de combinaciones de
marcos** que se repite en bucle. Y "una secuencia corta que se repite en
bucle" es exactamente lo que el sistema ya hace hoy con la matriz de pasadas.

## Cómo funciona

En cada pasada del telar, algunos marcos suben y otros bajan; esa combinación
forma el cruce de los hilos que da el dibujo. Cada pasada se reduce entonces a indicar **cuáles se activan**. En este
telar son 4 bobinas de selección, confirmado por el dueño el 19/09/26 (el relevamiento del
28/08/26 había estimado seis). El patrón repetitivo es una lista corta
de esas combinaciones, que se repite.

```
   Secuencia (se repite):     Bobinas activas en cada pasada
   ┌───────────┐              Pasada 1 → 1,3
   │  backend  │  ──────────▶ Pasada 2 → 2,4
   │ (patrón)  │              Pasada 3 → 1,3
   └───────────┘              Pasada 4 → 2,4   (y vuelve a empezar)
        │
        ▼
   ┌───────────┐  en lugar del ┌───────────────────────┐
   │   ESP32   │ ────────────▶ │ 4 relés LCA110        │
   │ (gateway) │     papel     │ (uno por lector)      │
   └───────────┘               └───────────────────────┘
                                          │
                                          ▼
                   lectores → plaquetas → bobinas → marcos suben/bajan
```

## El hardware necesario

El telar **ya tiene las bobinas de selección instaladas y funcionando**: no hay
que comprarlas ni montarlas. Lo que falta es la electrónica que las comande en
lugar del lector óptico de la cinta de papel.

- **Trabajan con 24 V en corriente alterna**, confirmado por el dueño de la
  planta el 03/09/26. Este dato define toda la etapa de potencia.
- Hoy la señal **no llega directo desde el lector óptico a las bobinas**: pasa
  por unas plaquetas electrónicas alojadas en la caja del telar.
- **El punto de intervención es el propio lector óptico, no la bobina.** El
  dueño de la planta lo explicó así: cada lector óptico se corta con una llave,
  de modo que en lugar de que sea el papel el que interrumpe el haz, lo hace un
  interruptor electrónico que entrega un 1 o un 0. Esto simplifica bastante la
  etapa de potencia, porque el sistema no conmuta la corriente de la bobina
  sino la señal del lector, que maneja mucha menos corriente. Las plaquetas del
  telar quedan intactas y siguen haciendo su trabajo.
- **Relés de estado sólido LCA110 (OptoMOS), uno por lector óptico, cuatro en total (uno por bobina de selección).** Es el punto donde más se
  equivoca la intuición: un relé mecánico común no sirve acá. El telar trabaja
  a 300 pasadas por minuto, o sea 5 por segundo, y cada bobina puede activarse
  una vez por pasada. Eso son hasta 180.000 activaciones en una jornada de 10
  horas, cuando la vida típica de un relé mecánico con carga ronda las 100.000:
  se gastaría en una jornada. El LCA110 no tiene partes móviles,
  conmuta en unos pocos milisegundos y no se desgasta.
- **Por qué el LCA110 y no un SSR de potencia.** Como corta la señal del lector
  (unos pocos mA, menos de 24 V) y no la corriente de la bobina, alcanza con un
  relé de señal. Su salida son dos MOSFET en antiserie: conduce en los dos
  sentidos, así que sirve con continua y con alterna (hasta 350 V y 120 mA). Se
  comanda directo desde un pin del ESP32 y aísla los dos lados. La conexión final,
  la más segura, pone el relé en lugar del lector (con agujero el lector da la señal +V; ahora la
  da el relé), con una resistencia de protección: `diagramas/hardware/conexion_final_rele.png` y
  `esp32/documentacion/PASO_A_PASO_RELES_LCA110.md`.
- El **ESP32** recibe del backend la secuencia y, en cada pasada, activa las
  bobinas que corresponden a esa fila.
- **Los LCA110 se conectan directo a los GPIO del ESP32** (18, 19, 21 y 22, con
  330 Ω en serie y 10 kΩ a GND). Un diseño anterior
  contemplaba un registro de desplazamiento 74HC595 para manejar ocho salidas
  con pocos pines, pero con cuatro canales no hace falta: al ESP32 le sobran
  GPIOs libres. Se elimina un componente, se simplifica el firmware y baja el
  costo.

**Lo que quedó descartado:** las versiones anteriores de este documento
planteaban MOSFET IRLZ44N con diodos flyback sobre las bobinas. Eso vale para
bobinas de corriente continua, pero no para estas: un MOSFET suelto conduce en un
solo sentido y su diodo interno deja pasar el otro semiciclo, con lo que la bobina
quedaría siempre parcialmente energizada. (El LCA110 no tiene ese problema: lleva
dos MOSFET enfrentados y además no actúa sobre la bobina sino sobre el lector.)

**Dato que falta medir en la máquina:** la tensión y la corriente en la salida
de un lector óptico, que confirman que el LCA110 alcanza (hasta 350 V y 120 mA) y
el caso de la conexión final (2A si con agujero la señal va a +V). La velocidad ya está
confirmada: el telar trabaja a 300 pasadas por minuto, dato que dio el dueño de
la planta el 06/09/26, lo que equivale a 5 conmutaciones por segundo y hasta
180.000 por jornada de 10 horas.

Esto es **de escala de prototipo**, no de proyecto industrial.

## Cómo se conecta con lo que ya está hecho

Encaja naturalmente con el sistema actual:

- El **editor** ya define una matriz de pasadas que se repite. Solo hay que
  interpretar cada fila de esa matriz como *"qué marcos suben en esta
  pasada"*, en vez de (o además de) la simulación visual.
- El **backend** ya guarda y entrega esa secuencia por la API. No hay que
  rediseñarlo: el ESP32 pediría la secuencia igual que hoy pide el estado.
- El **firmware** del ESP32 pasa de accionar 3 relés (Marcha/Pausa/Retroceder) a
  accionar además los 4 relés LCA110 de los lectores, siguiendo la secuencia (el mismo programa,
  `esp32/control_trama_esp32/`, con `NIVEL2_INSTALADO` en `true`).

En otras palabras: **la parte de software ya está casi lista; lo que se suma
es la parte física de los marcos, que ahora es chica.**

## Cómo plantear el Nivel 2 (replanteo)

Con esto, el Nivel 2 deja de ser "evolución lejana" y pasa a ser **el próximo
paso concreto y demostrable**:

- **Nivel 1 (ya):** el ESP32 arranca y para el telar.
- **Nivel 2 (alcanzable como prototipo):** el ESP32 controla los marcos de un
  telar dobby según la secuencia que le manda el backend, tejiendo un patrón
  repetitivo real. **Las cuatro bobinas del C 201 ya prueban el concepto
  completo**, sin necesidad de escalar a los cientos de hilos de un Jacquard.

## Aclaración honesta de alcance

Esto aplica si el telar es -o puede adaptarse a- **control por marcos**. Si el
telar puntual es un Jacquard puro de tarjetas, para patrones repetitivos se
puede usar igualmente una **fracción chica de los ganchos** y repetir el
módulo; pero lo natural y limpio es el enfoque dobby descrito acá.

Conviene confirmar un dato del telar real: **¿levanta los hilos por marcos
(unos pocos cuadros que suben y bajan) o cada hilo va por separado con las
tarjetas?** La respuesta define si el retrofit es directo (por marcos) o si
conviene hacer un demostrador a escala reducida.

En cualquier caso, para el tipo de tejido de esta planta (repetitivo), el
control por marcos es la vía correcta y **está al alcance de un prototipo con
ESP32**.
