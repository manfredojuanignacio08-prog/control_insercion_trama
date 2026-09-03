# Nivel 2 por control de marcos (dobby) — la vía viable

Este documento amplía el `NIVELES_DE_CONTROL.md` con la **solución concreta y
alcanzable** para el Nivel 2, dado que los tejidos de esta planta son
**mayormente patrones simples y repetitivos** (tipo cortina: un dibujo que se
repite constantemente), y no logos ni figuras complejas.

Esa característica —patrones repetitivos— es la que vuelve el Nivel 2
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
| **Dobby (por marcos)** | grupos de hilos | **8** (máximo de este telar) | ✅ **sí, con un ESP32** |

Toda tela con un patrón que se repite (cortinas, rayas, espigado, panal,
tramas geométricas) se define por una **secuencia corta de combinaciones de
marcos** que se repite en bucle. Y "una secuencia corta que se repite en
bucle" es exactamente lo que el sistema ya hace hoy con la matriz de pasadas.

## Cómo funciona

En cada pasada del telar, algunos marcos suben y otros bajan; esa combinación
forma el cruce de los hilos que da el dibujo. Cada pasada se reduce entonces a indicar **cuáles se activan**. En este
telar son 3, confirmado en el relevamiento del 28/08/26. El patrón repetitivo es una lista corta
de esas combinaciones, que se repite.

```
   Secuencia (se repite):     Marcos arriba en cada pasada
   ┌───────────┐              Pasada 1 → 1,3,5,7
   │  backend  │  ──────────▶ Pasada 2 → 2,4,6,8
   │ (patrón)  │              Pasada 3 → 1,3,5,7
   └───────────┘              Pasada 4 → 2,4,6,8   (y vuelve a empezar)
        │
        ▼
   ┌───────────┐   energiza    ┌──────────────────────┐
   │   ESP32   │ ────────────▶ │ 8 actuadores          │
   │ (gateway) │               │ (uno por marco)       │
   └───────────┘               └──────────────────────┘
                                        │
                                        ▼
                                  marcos del telar suben/bajan
```

## El hardware necesario

El telar **ya tiene las bobinas de selección instaladas y funcionando**: no hay
que comprarlas ni montarlas. Lo que falta es la electrónica que las comande en
lugar del lector óptico de la cinta de papel.

- **Trabajan con 24 V en corriente alterna**, confirmado por el dueño de la
  planta el 03/09/26. Este dato define toda la etapa de potencia.
- Hoy la señal **no llega directo desde el lector óptico a las bobinas**: pasa
  por unas plaquetas electrónicas alojadas en la caja del telar. La propuesta
  del dueño es cortar la señal de la óptica e inyectar la del sistema en su
  lugar, sin intervenir esas plaquetas.
- **Relés de estado sólido (SSR), uno por bobina.** Es el punto donde más se
  equivoca la intuición: un relé mecánico común no sirve acá. El telar trabaja
  alrededor de 200 pasadas por minuto, o sea unas 3 por segundo, y cada bobina
  puede conmutar una vez por pasada. Eso son unas 96.000 conmutaciones en un
  turno de 8 horas, cuando la vida típica de un relé mecánico con carga ronda
  las 100.000: se gastaría en un turno. Un SSR no tiene partes móviles,
  conmuta en microsegundos y no se desgasta.
- Sirven tanto un **módulo SSR armado** (entrada de 3-32 V DC, que es
  justo lo que entrega el ESP32, y salida para carga de alterna) como el
  circuito clásico de **optotriac MOC3041 más triac BT136**, que además
  conmuta en el cruce por cero y genera menos ruido eléctrico.
- El **ESP32** recibe del backend la secuencia y, en cada pasada, activa las
  bobinas que corresponden a esa fila.
- Con un solo **registro de desplazamiento 74HC595** alcanza de sobra: sus 8
  salidas cubren este telar sin quedarse sin pines.

**Lo que quedó descartado:** las versiones anteriores de este documento
planteaban MOSFET IRLZ44N con diodos flyback. Eso vale para bobinas de
corriente continua, pero no para estas: un MOSFET conduce en un solo sentido y
su diodo interno deja pasar el otro semiciclo, con lo que la bobina quedaría
siempre parcialmente energizada.

**Datos que faltan medir en la máquina:** la velocidad real en pasadas por
minuto y el consumo de una bobina. El primero confirma el cálculo de vida útil
y el segundo define qué SSR comprar.

Esto es **de escala de prototipo**, no de proyecto industrial.

## Cómo se conecta con lo que ya está hecho

Encaja naturalmente con el sistema actual:

- El **editor** ya define una matriz de pasadas que se repite. Solo hay que
  interpretar cada fila de esa matriz como *"qué marcos suben en esta
  pasada"*, en vez de (o además de) la simulación visual.
- El **backend** ya guarda y entrega esa secuencia por la API. No hay que
  rediseñarlo: el ESP32 pediría la secuencia igual que hoy pide el estado.
- El **firmware** del ESP32 pasaría de accionar 3 relés (Marcha/Pausa/Retroceder) a
  accionar además los 8 actuadores de los marcos, siguiendo la secuencia.

En otras palabras: **la parte de software ya está casi lista; lo que se suma
es la parte física de los marcos, que ahora es chica.**

## Cómo plantear el Nivel 2 (replanteo)

Con esto, el Nivel 2 deja de ser "evolución lejana" y pasa a ser **el próximo
paso concreto y demostrable**:

- **Nivel 1 (ya):** el ESP32 arranca y para el telar.
- **Nivel 2 (alcanzable como prototipo):** el ESP32 controla los marcos de un
  telar dobby según la secuencia que le manda el backend, tejiendo un patrón
  repetitivo real. **Un demostrador de 8 marcos ya prueba el concepto
  completo**, sin necesidad de escalar a los cientos de hilos de un Jacquard.

## Aclaración honesta de alcance

Esto aplica si el telar es —o puede adaptarse a— **control por marcos**. Si el
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
