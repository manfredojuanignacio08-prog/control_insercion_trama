# Recomendaciones sobre la conexión eléctrica (Telar – ESP32)

Revisión del documento "Documentación Eléctrica Telar - ESP32". La base
está **muy bien pensada**: relés optoacoplados en paralelo con la botonera
(no invasivo), step-down desde los 24V del telar, y una etapa de filtrado
seria (fusible, Schottky, TVS, electrolíticos y cerámicos). Lo que sigue
son mejoras y precauciones **sin agregar ningún sensor nuevo** — solo
elementos de protección, criterios de armado y cambios de código (que ya
quedaron aplicados en el firmware).

---

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

1. **Hardware (2 resistencias, centavos):** una resistencia **pull-up de
   10 kΩ** desde IN1 a 3.3V, y otra desde IN2 a 3.3V. Mantienen los pines
   en nivel inactivo durante el arranque, pase lo que pase con el
   software. Es la protección más barata y efectiva de toda la lista.
2. **Software (ya aplicado en el firmware):** se escribe el nivel inactivo
   en el pin **antes** de configurarlo como salida, y tras un reinicio el
   firmware **solo memoriza** el estado del backend sin pulsar nada, hasta
   detectar un cambio real.

**Elección de pines — bien elegidos:** GPIO 25 y 26 **no** son pines de
arranque del ESP32 (los "strapping pins" 0, 2, 5, 12 y 15 cambian de nivel
solos durante el boot). Mantener esos dos; no mover los relés a ninguno de
los pines de arranque.

## 2. Peligro concreto: USB y 24V al mismo tiempo

Cuando se conecta el cable USB para programar o ver el monitor serie
**con el sistema alimentado desde los 24V del telar**, la salida de 5V del
LM2596 y los 5V del puerto USB de la computadora quedan enfrentados por el
pin VIN. Según la placa, eso puede quemar el diodo interno del ESP32 o
inyectar corriente a la PC.

**Regla práctica:** desconectar la entrada de 24V (o abrir el fusible)
antes de enchufar el USB. **Alternativa de hardware:** un diodo Schottky
adicional en serie entre la salida del LM2596 y VIN — con eso pueden
convivir ambas fuentes sin pelearse (la caída de ~0.3V no afecta, VIN
acepta 4.7V sin problema).

## 3. Dimensionar el fusible (que hoy no tiene valor definido)

El consumo real del circuito es chico: ESP32 con WiFi (~250 mA pico) +
2 relés (~70 mA c/u en 5V) → menos de 150 mA sobre la línea de 24V
(el LM2596 convierte potencia, no corriente 1:1). Recomendación:
**fusible lento (slow-blow) de 0.5 A** en la entrada de 24V. Uno mucho más
grande "protege" poco; uno rápido puede saltar con el pico de carga de los
capacitores al conectar.

## 4. Ajustes finos de la etapa de potencia

- **Ajustar el LM2596 ANTES de conectar el ESP32:** girar el preset con la
  salida en vacío midiendo con multímetro hasta clavar 5.0–5.1V. Estos
  módulos vienen de fábrica con la salida alta (a veces >10V) y eso mata
  la placa en el acto.
- **Verificar el Schottky de entrada:** que sea de al menos **2–3 A y
  40V+** (ej. SS34 o 1N5822). Uno chico (1N5819, 1 A) trabaja al límite
  con el pico de arranque de los capacitores.
- **El TVS P6KE33CA está bien elegido**, un solo detalle: su tensión de
  recorte (clamping) llega a ~45V en picos fuertes y el LM2596 tolera 40V
  (45V absoluto). Está justo pero dentro de margen. Si se quiere más
  holgura sin cambiar nada más, la variante **P6KE30CA** recorta más bajo
  y sigue lejos de los 24V nominales.
- **Capacitores a 50V para línea de 24V:** correcto, buen margen. Respetar
  la polaridad de los electrolíticos (franja = negativo), como ya indica
  la guía.

## 5. Cableado y ruido (costo cero, mucho efecto)

- **Los cables de los relés a la botonera, trenzados de a pares** (NO1 con
  COM1 trenzados entre sí; ídem canal 2) y **lejos de los cables de los
  motores** del telar. El ruido inductivo de los motores es la causa nº1
  de cuelgues de WiFi y reinicios en este tipo de montaje.
- **Cables cortos en la etapa lógica** (3.3V, IN1, IN2): cuanto más
  largos, más antena para el ruido.
- **Tierra en estrella:** todos los GND (LM2596 OUT-, ESP32, relé) a un
  mismo punto físico, no encadenados uno tras otro.
- **El jumper del relé quitado + VCC lógico a 3.3V** (como ya está en la
  guía) es la configuración correcta: la bobina se alimenta con los 5V del
  LM2596 y la lógica con el ESP32, con el optoacoplador de por medio.
  Mantenerlo así.

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
| Polaridad del relé configurable (`RELE_ACTIVO_BAJO`) | Adaptarse a módulos activo-alto sin tocar el código |

## 8. Resumen de compras/cambios (todo protección, nada de sensores)

| Ítem | Cantidad | Para qué |
|---|---|---|
| Resistencia 10 kΩ | 2 (+2 si se usa el MOSFET) | Pull-up de IN1/IN2 (punto 1) y pull-down de Gate (punto 6) |
| Resistencia 100–220 Ω | 1 | Serie de Gate del IRLZ44N (punto 6) |
| Fusible lento 0.5 A | 1 (+ repuesto) | Entrada de 24V (punto 3) |
| Diodo Schottky extra (SS34 o similar) | 1 (opcional) | Convivencia USB + 24V (punto 2) |
| Diodo 1N5408 | 1 (solo si el MOSFET maneja carga inductiva) | Flyback (punto 6) |

Total estimado: unos pocos dólares. La mejora de fiabilidad es enorme en
relación al costo — especialmente los pull-ups del punto 1, que son la
diferencia entre un prototipo y algo seguro de dejar conectado a una
máquina.
