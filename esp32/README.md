# Firmware ESP32 — Control de Inserción de Trama (Gateway)

Este firmware está hecho **a medida del hardware documentado por el
equipo** ("Documentación Eléctrica Telar - ESP32"): el ESP32 actúa como
**gateway de control remoto** sobre un telar automático ya operativo. No
reemplaza la lógica de la máquina — le "aprieta los botones".

**Cómo:** dos relés optoacoplados conectados **en paralelo** con los
botones físicos de **Marcha** (GPIO 25 → IN1) y **Pausa** (GPIO 26 → IN2).
Un pulso breve del relé equivale a una pulsación manual, y la botonera
física sigue funcionando exactamente igual.

**Idea clave:** el ESP32 sondea `GET /api/telares/1` — el mismo endpoint
que consumen la web y la app. Cuando alguien asigna un patrón desde la
web/app (estado pasa a `tejiendo`), el ESP32 pulsa Marcha en la máquina
real; cuando alguien detiene, pulsa Pausa. **Cero cambios en el backend.**

---

## 1. Qué hace, paso a paso

1. Se conecta al Wi-Fi (datos en `config.h`).
2. Cada 2,5 s consulta el estado del telar en el backend.
3. Al detectar un **cambio** de estado deseado:
   - pasó a `tejiendo` → pulso de 300 ms en el relé de **Marcha**
   - dejó de `tejiendo` → pulso de 300 ms en el relé de **Pausa**
4. Si se cae el Wi-Fi o el backend no responde: **no hace nada**
   (fail-safe). El telar queda gobernado por su botonera física, que
   nunca deja de funcionar porque la conexión es en paralelo.
5. Deja registro de sus fallas en `POST /api/errores`.

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
- **Polaridad configurable** (`RELE_ACTIVO_BAJO` en `config.h`) para
  módulos activo-bajo (los más comunes) o activo-alto.

> Las recomendaciones sobre la parte **eléctrica** (pull-ups en IN1/IN2,
> fusible, convivencia USB+24V, cableado, etc.) están en
> `RECOMENDACIONES_ELECTRICAS.md`, en esta misma carpeta.

## 3. Conexión (resumen del documento eléctrico del equipo)

> 📐 **Diagrama visual completo**: `diagrama_conexion_electrica.svg` (y su
> versión `.png` para pegar en Word/PowerPoint), en esta misma carpeta.
> Muestra las 4 etapas con las mejoras recomendadas marcadas en ámbar.

| Etapa | Conexión |
|---|---|
| Potencia | 24V telar → fusible → diodo Schottky → LM2596 → 5V |
| 5V | LM2596 OUT+ → ESP32 VIN **y** JD-VCC del relé (jumper quitado) |
| Lógica | ESP32 3.3V → VCC lógico del relé; GPIO 25 → IN1; GPIO 26 → IN2 |
| Telar | NO1+COM1 en paralelo al botón de Marcha; NO2+COM2 al de Pausa |
| Filtrado | TVS P6KE33CA + 470 µF + 100 nF en la entrada; 47 µF en la salida |

## 4. Cómo compilar y subir

1. Instalá el **IDE de Arduino**; agregá el core de **esp32** (Espressif)
   desde el Board Manager.
2. *Tools → Manage Libraries* → instalá **ArduinoJson** (Benoît Blanchon,
   v7.x). `WiFi` y `HTTPClient` ya vienen con el core.
3. Abrí `control_trama_esp32.ino` y **editá `config.h`**: Wi-Fi, URL del
   backend (la del servidor Node, **no** la de Supabase) y la polaridad
   del relé si hiciera falta.
4. Placa: *ESP32 Dev Module* → puerto → **Upload**.
5. Monitor serie a **115200 baudios** para ver conexión, sondeos y pulsos.

> ⚠️ **No conectar el USB con los 24V puestos** sin la protección del
> punto 2 de `RECOMENDACIONES_ELECTRICAS.md`. Para programar: desconectar
> la entrada de 24V primero.

## 5. Cómo probarlo sin conectar el telar todavía

1. Armá solo la parte lógica: ESP32 + módulo de relés (alimentado por USB
   alcanza para la prueba, con JD-VCC puenteado temporalmente al 5V del
   USB).
2. Levantá el backend y asigná un patrón desde la web → a los pocos
   segundos se **escucha el clic** del relé de Marcha y el LED parpadea.
3. Tocá "Detener" en la web → clic del relé de Pausa.
4. Recién cuando eso funcione, cablear los contactos NO/COM a la botonera
   del telar según el documento eléctrico.

## 6. Alcance del control: dos niveles (importante)

El telar tiene, en la práctica, dos "máquinas": la de **accionamiento**
(arranca/para) y la **lectora de secuencia** (el Jacquard con tarjetas
perforadas, que dicta el dibujo pasada por pasada).

- **Nivel 1 — Arranque y parada (lo que hace el ESP32 hoy):** darle Play y
  Pausa al telar con los relés. Resuelto, sin inconvenientes de fondo.
- **Nivel 2 — Dictar la secuencia completa (evolución futura):** reemplazar
  las tarjetas perforadas del Jacquard, lo que implica un retrofit del
  mecanismo. Fuera del alcance de esta etapa.

El detalle completo de esta distinción —clave para entender el alcance del
proyecto y para la presentación— está en **`NIVELES_DE_CONTROL.md`**, en
esta misma carpeta.
