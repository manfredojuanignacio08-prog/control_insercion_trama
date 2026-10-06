# Firmware ESP32, Control de Inserción de Trama (Gateway)

Este firmware está hecho **a medida del hardware documentado por el
equipo** ("Documentación Eléctrica Telar - ESP32"): el ESP32 actúa como
**gateway de control remoto** sobre un telar automático ya operativo. No
reemplaza la lógica de la máquina (le "aprieta los botones").

**Cómo:** tres relés optoacoplados conectados **en paralelo** con los
botones físicos de **Marcha** (GPIO 25 → IN1), **Pausa** (GPIO 26 → IN2)
y **Retroceder** (GPIO 27 → IN3). Un pulso breve del relé equivale a una
pulsación manual, y la botonera física sigue funcionando exactamente
igual.

**Idea clave:** el ESP32 sondea `GET /api/telares/{TELAR_ID}` (8), el mismo endpoint
que consume la web. Cuando alguien asigna un patrón desde la
web (estado pasa a `tejiendo`), el ESP32 pulsa Marcha en la máquina
real; cuando alguien pausa, pulsa Pausa.

**Una sola placa, un solo programa.** El gabinete tiene un único ESP32 y se le carga siempre el
mismo firmware: `control_trama_esp32/control_trama_esp32.ino`. Qué hace depende de
`NIVEL2_INSTALADO` en `config.h`:

- **`false` (hoy):** solo el Bloque A, los relés y el sensado de la botonera.
- **`true`:** además el sensor de pasada (Bloque C) y los relés LCA110 de la selección
  (Bloque D). Se cambia recién cuando los dos estén armados y conectados: con `true` la web deja
  de estimar las pasadas y espera las del sensor.

El detalle del Nivel 2 está en `control_trama_esp32/README.md`.

---

## 1. Qué hace, paso a paso

1. Se conecta al Wi-Fi (datos en `config.h`).
2. Cada 2,5 s consulta el estado del telar en el backend.
3. Al detectar un **cambio** de estado deseado:
   - pasó a `tejiendo` → pulso de 300 ms en el relé de **Marcha**
   - dejó de `tejiendo` → pulso de 300 ms en el relé de **Pausa**
   - cada ⏪ pedido desde la web (sube `retroceder_seq`) → pulso de 300 ms en el relé de
     **Retroceder**, siempre después del de Pausa
4. Si alguien usa la botonera a mano, lo sensa y se lo avisa al backend (`POST /evento-fisico`).
5. Si se cae el Wi-Fi o el backend no responde: **no hace nada**
   (fail-safe). El telar queda gobernado por su botonera física, que
   nunca deja de funcionar porque la conexión es en paralelo.
6. Deja registro de sus fallas en `POST /api/errores`.

## 2. Protecciones incluidas en el código

- **Arranque seguro de relés**: nivel inactivo escrito en los pines
  *antes* de configurarlos como salida → sin pulso fantasma al encender.
- **Primera lectura sin actuar**: tras un reinicio, el firmware solo
  memoriza el estado del backend; no arranca ni pausa la máquina por su
  cuenta.
- **Pulso acotado e incondicional**: un relé jamás queda pegado.
- **Anti-doble-pulso**: 2 s mínimos entre comandos.
- **Watchdog por hardware (15 s)**: si el programa se cuelga (ruido
  eléctrico), el ESP32 se reinicia solo con los relés en reposo.
- **Polaridad configurable por relé** (`RELE_MARCHA_ACTIVO_BAJO`, `RELE_PAUSA_ACTIVO_BAJO`, `RELE_RETROCEDER_ACTIVO_BAJO` en `config.h`) para
  módulos activo-bajo (los más comunes) o activo-alto.

> Las recomendaciones sobre la parte **eléctrica** (pull-ups en IN1/IN2,
> fusible, convivencia del USB con la fuente, cableado, etc.) están en
> `documentacion/RECOMENDACIONES_ELECTRICAS.md`.

## 3. Conexión (resumen del documento eléctrico del equipo)

> 📐 **Diagrama visual completo**: `diagramas/hardware/diagrama_conexion_electrica.svg` (y su
> versión `.png` para pegar en Word/PowerPoint).
> Muestra las 4 etapas con las mejoras recomendadas marcadas en ámbar.

| Etapa | Conexión |
|---|---|
| Potencia | 220V pared → fusible 1A lento → módulo HLK-5M05 → 5V (fuente propia, no toca el telar) |
| 5V | HLK-5M05 OUT → ESP32 VIN **y** VCC del módulo relé (jumper JD-VCC/VCC puesto) |
| Lógica | GPIO 25 → IN1; GPIO 26 → IN2; GPIO 27 → IN3. IN1 e IN2 con pull-up de 10 kΩ a 3.3V (módulo de 2 canales, activo-bajo); IN3 con pull-down de 10 kΩ a GND (el módulo de Retroceder es activo-alto: con pull-up arrancaría pegado). Todo por el conector de las señales (GND · IN · VCC): el VCC de ese conector va a **5V**, nunca a los 3.3V del ESP32 (con el jumper puesto, unirían 5V y 3.3V). El conector del jumper (JD-VCC · VCC · GND) no se usa |
| Telar | NO1+COM1 en paralelo al botón de Marcha; NO2+COM2 al de Pausa; NO3+COM3 al de Retroceder |
| Sensado | Los mismos 3 botones (Marcha/Pausa/Retroceder) → puente rectificador DB157 → capacitor 22–47 µF → R 2,2 kΩ → PC817 → GPIO 32 / 33 / 34 (pull-up 10 kΩ a 3.3V) |
| Filtrado | Capacitores de 100 nF de desacople junto al ESP32 y junto a cada módulo de relé |

### Sensado de los botones del telar (solo lectura)

Los mismos tres botones que tienen relé (Marcha, Pausa y Retroceder) se **escuchan** además,
con un optoacoplador PC817 por canal que aísla los 24 V AC de la botonera del micro. Si un
operario los aprieta a mano, el ESP32 avisa al backend (`POST /evento-fisico`) y la web refleja
lo que pasa en la máquina: arrancada, pausada o una pasada atrás. El firmware descarta el eco de
sus propios pulsos (el relé cierra el mismo circuito que el botón). Si alguien arranca o retrocede
a mano sin un trabajo abierto, la web marca la posición como incierta hasta que se confirme
(`POST /confirmar-posicion`).

## 4. Cómo compilar y subir

1. Instalá el **IDE de Arduino**; agregá el core de **esp32** (Espressif)
   desde el Board Manager.
2. *Tools → Manage Libraries* → instalá **ArduinoJson** (Benoît Blanchon,
   v7.x). `WiFi` y `HTTPClient` ya vienen con el core.
3. Abrí `control_trama_esp32/control_trama_esp32.ino` (los demás archivos de la carpeta se abren
   como pestañas) y **editá `config.h`**: `NIVEL2_INSTALADO` (`false` hoy), Wi-Fi (en el repositorio
   viene `NOMBRE_DE_LA_RED` / `CLAVE_DE_LA_RED`; los datos reales no se suben), `DEVICE_KEY` (la misma que
   `ESP32_DEVICE_KEY` del backend), `TELAR_ID` (8) y URL del
   backend (la del servidor Node, **no** la de Neon) y la polaridad
   del relé si hiciera falta.
4. Placa: *ESP32 Dev Module* → puerto → **Upload**.
5. Monitor serie a **115200 baudios** para ver conexión, sondeos y pulsos.

> ⚠️ **No conectar el USB con la fuente HLK-5M05 encendida** sin la protección del
> punto 2 de `documentacion/RECOMENDACIONES_ELECTRICAS.md`. Para programar: desenchufar
> primero la fuente (220 V).

## 5. Cómo probarlo sin conectar el telar todavía

1. Armá solo la parte lógica: ESP32 + módulo de relés (alimentado por USB
   alcanza para la prueba, con JD-VCC puenteado temporalmente al 5V del
   USB).
2. Levantá el backend y asigná un patrón desde la web → a los pocos
   segundos se **escucha el clic** del relé de Marcha (el LED azul de la placa queda encendido
   mientras hay red).
3. Tocá "Pausa" en la web → clic del relé de Pausa.
4. Recién cuando eso funcione, cablear los contactos NO/COM a la botonera
   del telar según el documento eléctrico.

## 6. Alcance del control: dos niveles (importante)

El telar tiene, en la práctica, dos "máquinas": la de **accionamiento**
(arranca/para) y la **lectora de secuencia** (el dobby con cinta de papel
perforada, que dicta el dibujo pasada por pasada).

- **Nivel 1, Arranque y parada (lo que hace el ESP32 hoy):** darle Play y
  Pausa al telar con los relés. Resuelto, sin inconvenientes de fondo.
- **Nivel 2, Dictar el dibujo (en desarrollo):** contar las pasadas con un sensor inductivo
  y reemplazar la cinta de papel perforada del dobby con cuatro relés LCA110 sobre los lectores
  ópticos. Lo hace el mismo firmware, con `NIVEL2_INSTALADO` en `true`.

El detalle completo de esta distinción -clave para entender el alcance del
proyecto y para la presentación- está en **`documentacion/NIVELES_DE_CONTROL.md`**.
