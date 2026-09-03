# Recomendaciones sobre la conexión eléctrica (Telar – ESP32)

Revisión del diseño eléctrico del nodo de control. La base es sólida: el
ESP32 actúa como puente entre la web y la botonera del telar, mediante tres
relés en paralelo con los botones de Marcha, Pausa y Retroceder, más el
sensado aislado de esos mismos tres botones, para detectar cuando el operario los usa a mano.

La alimentación es una **fuente propia HLK-5M05 (220 V AC → 5 V DC, 1 A)**,
independiente del telar: el sistema no toma corriente de la máquina, y lo
único que toca su circuito son los contactos secos de los relés y las
entradas de sensado, aisladas por optoacopladores.

Lo que sigue son las mejoras y precauciones concretas, ordenadas por
importancia.

## 1. Lo más importante: el "golpe fantasma" de los relés al arrancar

**El problema:** los módulos de relé optoacoplados comunes se activan con
nivel BAJO. Durante el arranque del ESP32 (encendido, reinicio por corte
de luz, reinicio por watchdog), los pines GPIO quedan un instante
"flotando" antes de que el programa los configure — y un pin flotante
puede dejar pasar corriente por el optoacoplador. Resultado posible: **el
telar recibe un pulso de Marcha o Pausa que nadie pidió**, justo al
prenderse el sistema. En una máquina real esto es un riesgo de seguridad,
no un detalle.

**Solución en dos capas (recomendadas las dos):**

1. **Hardware (5 resistencias, centavos):** una resistencia **pull-up de
   10 kΩ** desde cada IN a 3.3V — IN1, IN2 e IN3 (los tres relés) — más una
   por cada entrada de sensado (GPIO 32 y 33). Mantienen los pines
   en nivel inactivo durante el arranque, pase lo que pase con el
   software. Es la protección más barata y efectiva de toda la lista.
2. **Software (ya aplicado en el firmware):** se escribe el nivel inactivo
   en el pin **antes** de configurarlo como salida, y tras un reinicio el
   firmware **solo memoriza** el estado del backend sin pulsar nada, hasta
   detectar un cambio real.

**Elección de pines — bien elegidos:** los cinco pines en uso —GPIO 25, 26 y
27 para los relés (Marcha, Pausa, Retroceder) y GPIO 32 y 33 para el sensado
del sensado— **no** son pines de arranque del ESP32 (los "strapping
pins" 0, 2, 5, 12 y 15 cambian de nivel solos durante el boot). Mantenerlos;
no mover ni los relés ni las entradas de sensado a un pin de arranque: un
relé conectado ahí puede dar un pulso fantasma al encender la placa.

## 2. Alimentación por USB durante la programación

Cuando se conecta el cable USB para programar o ver el monitor serie, el
puerto USB de la computadora alimenta el ESP32 por su propio regulador.
Si al mismo tiempo el módulo de fuente está entregando 5 V al pin VIN,
ambas fuentes quedan enfrentadas.

**Regla práctica:** desconectar la entrada de 220 V del módulo de fuente
antes de enchufar el USB para programar. Es la forma más simple y segura;
no hace falta ningún componente extra para resolverlo.

Una vez cargado el firmware, el sistema trabaja alimentado únicamente por
su propia fuente, con el USB desconectado.

## 3. Dimensionar el fusible

La alimentación del sistema es una fuente propia HLK-5M05 (220 V AC → 5 V
DC, 1 A), independiente del telar, y el fusible protege su entrada de red.

El consumo real del circuito es chico: ESP32 con WiFi (~250 mA
pico) + 3 relés (~70 mA c/u en 5V) → unos 500 mA como techo en la línea
de 5V. Del lado de 220V eso es una corriente muy baja, pero el módulo
switching tiene un pico de arranque (inrush) bastante mayor que su
consumo nominal.

Recomendación: **fusible lento (slow-blow) de 1 A** en la entrada de 220 V,
que es el valor que indica el propio datasheet del módulo. Un fusible de
menor amperaje puede saltar solo en cada encendido por ese pico inicial,
sin que haya ninguna falla real.

## 4. Verificaciones de la etapa de alimentación

- **Medir la salida ANTES de conectar el ESP32:** con la entrada de 220 V
  conectada y la salida en vacío, confirmar con el multímetro que entrega
  **5,0 V estables**. El módulo no tiene ajuste; si no da 5 V, está fallado
  y hay que reemplazarlo antes de conectarle nada.
- **Respetar la polaridad de salida:** OUT+ es positivo, OUT– negativo. Un
  error acá quema el ESP32 en el acto.
- **Capacitor de desacople de 100 nF** lo más cerca posible del pin de
  alimentación del ESP32 y del VCC del módulo de relés. Filtra el ruido de
  alta frecuencia que generan las bobinas al conmutar.
- **Aislar la entrada de red:** los 220 V solo deben tocar el módulo de
  fuente. Ningún cable de red debe quedar suelto ni cerca de la etapa
  lógica dentro del gabinete.

## 5. Cableado y ruido (costo cero, mucho efecto)

- **Los cables de los relés a la botonera, trenzados de a pares** (NO1 con
  COM1 trenzados entre sí; ídem canales 2 y 3) y **lejos de los cables de los
  motores** del telar. El ruido inductivo de los motores es la causa nº1
  de cuelgues de WiFi y reinicios en este tipo de montaje.
- **Cables cortos en la etapa lógica** (3.3 V, IN1, IN2, IN3 y las dos
  entradas de sensado): cuanto más largos, más antena para el ruido.
- **Tierra en estrella:** todos los GND (salida de la fuente, ESP32, módulo
  de relés) a un mismo punto físico, no encadenados uno tras otro.
- **El jumper JD-VCC/VCC del módulo de relés va PUESTO:** con una sola
  fuente de 5 V alimentando todo, el jumper une ambas líneas y no hace
  falta una alimentación separada para las bobinas. El aislamiento entre la
  señal del ESP32 y el contacto que toca el telar lo da el optoacoplador
  interno del módulo, que sigue cumpliendo su función igual.

## 6. Protecciones para las reservas (MOSFET y TB6600)

Para cuando se usen los componentes reservados, dejar previsto:

- **IRLZ44N:** resistencia de **100–220 Ω en serie con el Gate** (limita el
  pico de corriente que el GPIO le entrega a la compuerta) y **pull-down
  de 10 kΩ de Gate a GND** (que el MOSFET no quede a mitad de camino con
  el pin flotando durante el arranque — mismo problema del punto 1).
  Si la carga es inductiva, **diodo volante (flyback)** en paralelo,
  ej. 1N5408.
- **TB6600:** comparte GND con el ESP32 y usa señales de 3.3V sin
  problema; solo respetar la corriente configurada por los DIP switches
  según el motor que se conecte.

## 7. Protecciones que ya quedaron aplicadas en el firmware

Estas van de regalo con el código nuevo (adaptado al diseño real de
relés):

| Protección | Qué evita |
|---|---|
| Arranque seguro de relés (nivel inactivo antes de `pinMode`) | El pulso fantasma al encender |
| Primera lectura "solo memorizar, no actuar" | Que un reinicio del ESP32 arranque o pause la máquina solo |
| Pulso de duración fija (300 ms) con apagado incondicional | Que un relé quede pegado "apretando" el botón |
| Anti-doble-pulso (2 s mínimos entre comandos) | Doble pulsación por lecturas repetidas del backend |
| Watchdog por hardware (15 s) | Cuelgues por ruido eléctrico: el ESP32 se reinicia solo, con relés en reposo |
| Fail-safe sin red | Si se cae el WiFi o el backend, el ESP32 no actúa y la botonera física sigue mandando |
| Polaridad configurable **por relé** (`RELE_*_ACTIVO_BAJO`) | Permite mezclar módulos activo-bajo y activo-alto en el mismo equipo. Ojo: la resistencia de cada canal depende de esto — pull-up a 3.3V para activo-bajo, pull-down a GND para activo-alto |

## 8. Resumen de compras/cambios (todo protección, nada de sensores)

| Ítem | Cantidad | Para qué |
|---|---|---|
| Resistencia 10 kΩ | 6 (+2 si se usa el MOSFET) | Pull-up de IN1/IN2/IN3 (3 relés) + 3 del sensado de los mismos botones (punto 1), y pull-down de Gate (punto 6) |
| Resistencia 100–220 Ω | 1 | Serie de Gate del IRLZ44N (punto 6) |
| Fusible lento 1 A | 1 (+ repuesto) | Entrada de **220 V** del módulo de fuente (punto 3) |
| Optoacoplador PC817 + puente DB157 + R 2,2 kΩ 1 W | 3 de cada uno | Sensado aislado de los botones Marcha, Pausa y Retroceder (24 V AC → GPIO 32/33/34) |
| Capacitor electrolítico 22–47 µF 50 V | 3 | En paralelo a la salida del puente, antes de la resistencia. Aplana el AC rectificado: sin él el LED del optoacoplador pulsa 100 veces por segundo y el firmware lee varias pulsaciones donde hubo una sola. Es crítico en el canal de Retroceder, donde cada evento repetido retrocede una pasada de más. TIENE POLARIDAD. |
| Diodo 1N5408 | 1 (solo si el MOSFET maneja carga inductiva) | Flyback (punto 6) |

Total estimado: unos pocos dólares. La mejora de fiabilidad es enorme en
relación al costo — especialmente los pull-ups del punto 1, que son la
diferencia entre un prototipo y algo seguro de dejar conectado a una
máquina.
