# Scripts de verificación

Estos scripts verifican el diseño del sistema por software (sin hardware):

- **`verif_coherencia.py`**, compara el firmware (.ino), el diagrama eléctrico
  (SVG) y el documento de conexiones, y confirma que los pines, voltajes y
  conexiones coincidan entre los tres (18 chequeos).
- **`sim_flujo.py`**, simula el flujo lógico del Nivel 1 (Marcha/Pausa):
  arranque seguro, arranque/detención, sin doble-pulso (6 verificaciones).
- **`sim_nivel2.py`**, simula el flujo lógico del Nivel 2 (marcos/dobby):
  traducción de la matriz de pasadas a la secuencia de marcos y su repetición
  (6 verificaciones).
- **`sim_nivel2_firmware.py`**, simula el firmware del Nivel 2 con el sensor de pasada:
  conteo, vueltas, repeticiones por fila, retrocesos, retomar tras un reinicio y
  selección de las bobinas en cada pasada (29 verificaciones).

Para correrlos: `python3 <script>.py`, desde cualquier carpeta (el único que lee
archivos, `verif_coherencia.py`, los busca a partir de su propia ubicación).

- **`host/correr.sh`**, prueba la lógica REAL de `../control_trama_esp32/sensor_pasada.h` (retrocesos
  acumulados, reclasificación del pulso de retroceso, período de gracia del sensor)
  con un reloj simulado, la de `../control_trama_esp32/posicion_dibujo.h` (1,2 millones de pasadas
  al azar adelante y atrás contra el mismo modelo del backend), el patrón del sketch de prueba de
  mesa de un relé (`../pruebas/prueba_rele_lca110`), y comprueba que el firmware compila en sus dos modos (`NIVEL2_INSTALADO` en `false` y en `true`) contra stubs
  mínimos de Arduino. Es un chequeo de lógica y de sintaxis: no reemplaza compilar
  con el core ESP32 real.

**Importante:** estas verificaciones aseguran que el diseño es coherente y la
lógica correcta, pero NO reemplazan la validación física con multímetro. Para
eso está `../documentacion/CHECKLIST_VALIDACION.md`.
