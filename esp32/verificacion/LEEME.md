# Scripts de verificación

Estos scripts verifican el diseño del sistema por software (sin hardware):

- **`verif_coherencia.py`**, compara el firmware (.ino), el diagrama eléctrico
  (SVG) y el documento de conexiones, y confirma que los pines, voltajes y
  conexiones coincidan entre los tres; también la cantidad de bobinas, los límites del dibujo y
  el solo sensado entre la web, el servidor, el firmware y la base, y que el watchdog dure más que el pedido
  más lento con la red mala (22 chequeos).
- **`sim_flujo.py`**, simula el flujo lógico del Nivel 1 (Marcha/Pausa):
  arranque seguro, arranque/detención, sin doble-pulso (6 verificaciones).
- **`sim_nivel2.py`**, simula el flujo lógico del Nivel 2 (selección de las bobinas):
  traducción del dibujo a la bobina de cada pasada, una sola por pasada, con las
  repeticiones de cada fila, los intercalados y el bucle (6 verificaciones).
- **`sim_nivel2_firmware.py`**, simula el firmware del Nivel 2 con el sensor de pasada:
  conteo, vueltas, repeticiones por fila, retrocesos, retomar tras un reinicio y
  selección de las bobinas en cada pasada, también con `DESPLAZAMIENTO_FILAS`, que corre la
  selección en pasadas y no en filas (30 verificaciones).

Para correrlos: `python3 <script>.py`, desde cualquier carpeta (el único que lee
archivos, `verif_coherencia.py`, los busca a partir de su propia ubicación).

- **`host/correr.sh`**, prueba la lógica REAL de `../control_trama_esp32/sensor_pasada.h` (retrocesos
  acumulados, reclasificación del pulso de retroceso, período de gracia del sensor)
  con un reloj simulado, la de `../control_trama_esp32/posicion_dibujo.h` (2,4 millones de pasadas
  al azar adelante y atrás contra el mismo modelo del backend), la de
  `../control_trama_esp32/seleccion_dibujo.h` (un agujero por pasada, cuánto dura y cuándo se
  suelta), el Bloque A del firmware (arranque seguro, orden de Pausa y Retroceder, un pulso por
  cada retroceso pedido, eco del propio relé, y los canales que bajan juntos cuando se prende el
  telar, que no se avisan), el patrón del sketch de prueba de
  mesa de un relé (`../pruebas/prueba_rele_lca110`), y comprueba que el firmware compila en sus dos modos (`NIVEL2_INSTALADO` en `false` y en `true`) contra stubs
  mínimos de Arduino que se comportan como el core 3.x (un `digitalWrite` antes de `pinMode` no
  hace nada). Por último (paso 3) corre el firmware completo con el Nivel 2 contra la librería
  **ArduinoJson real** y las respuestas que arma el backend real (`host/red/payloads.h`, generadas
  con `host/red/gen_payload.mjs`): descarga de un dibujo con intercalado, posición retomada,
  selección pasada por pasada con `DESPLAZAMIENTO_FILAS` en 0, 1 y −1, consultas de estado (Pausa,
  Retroceder, solo sensado, producción nueva), un Retroceder de la botonera que se reclasifica con la
  respuesta del evento, y reportes (con la producción para la que cuenta la placa) aceptados y rechazados. Necesita la
  ArduinoJson 7: la busca en `ARDUINOJSON_SRC` o en `~/Arduino/libraries/ArduinoJson/src` (donde
  la deja el Arduino IDE); si no está, ese paso se omite. Es un chequeo de lógica y de sintaxis: no
  reemplaza compilar con el core ESP32 real.

**Importante:** estas verificaciones aseguran que el diseño es coherente y la
lógica correcta, pero NO reemplazan la validación física con multímetro. Para
eso está `../documentacion/CHECKLIST_VALIDACION.md`.
