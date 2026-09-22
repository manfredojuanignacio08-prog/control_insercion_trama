#!/bin/sh
# Verificación del firmware en la PC, sin placa ni Arduino IDE.
#  1) Prueba la lógica REAL de nivel2/sensor_pasada.h (retrocesos, reclasificación, período de gracia)
#     con un reloj simulado.
#  2) Comprueba que los dos sketches compilan (sintaxis) contra "stubs" mínimos de la API de Arduino.
#     Es una comprobación de sintaxis y tipos: NO reemplaza compilar con el core ESP32 real.
set -e
cd "$(dirname "$0")"
ESP=../..
echo "== 1) sensor_pasada.h"
g++ -std=c++17 -I. -I$ESP/nivel2 -include Arduino.h test_sensor_pasada.cpp -o /tmp/test_sensor_pasada
/tmp/test_sensor_pasada
echo "== 2) sintaxis de los sketches"
python3 generar_prototipos.py $ESP/control_trama_esp32/control_trama_esp32.ino /tmp/n1.cpp
g++ -std=c++17 -fsyntax-only -I. -I$ESP/control_trama_esp32 -include Arduino.h -Wall /tmp/n1.cpp && echo "Nivel 1: OK"
python3 generar_prototipos.py $ESP/nivel2/nivel2_seleccion.ino /tmp/n2.cpp
g++ -std=c++17 -fsyntax-only -I. -I$ESP/nivel2 -include Arduino.h -Wall /tmp/n2.cpp && echo "Nivel 2: OK"
