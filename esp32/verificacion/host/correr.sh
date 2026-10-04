#!/bin/sh
# Verificación del firmware en la PC, sin placa ni Arduino IDE.
#  1) Prueba la lógica REAL de nivel2/sensor_pasada.h (retrocesos, reclasificación, período de gracia)
#     de nivel2/seleccion_dibujo.h (un agujero por pasada), con un reloj simulado, y de
#     nivel2/posicion_dibujo.h (la posición avanza y retrocede igual que en el backend).
#  1d) Corre el sketch de prueba de mesa de un relé (pruebas/prueba_rele_lca110) con reloj simulado.
#  2) Comprueba que los dos sketches compilan (sintaxis) contra "stubs" mínimos de la API de Arduino.
#     Es una comprobación de sintaxis y tipos: NO reemplaza compilar con el core ESP32 real.
set -e
cd "$(dirname "$0")"
ESP=../..
echo "== 1) sensor_pasada.h"
g++ -std=c++17 -I. -I$ESP/nivel2 -include Arduino.h test_sensor_pasada.cpp -o /tmp/test_sensor_pasada
/tmp/test_sensor_pasada
echo "== 1b) seleccion_dibujo.h"
g++ -std=c++17 -I. -I$ESP/nivel2 -include Arduino.h test_seleccion.cpp -o /tmp/test_seleccion
/tmp/test_seleccion
echo "== 1c) posicion_dibujo.h (misma posición que el backend)"
g++ -std=c++17 -I. -I$ESP/nivel2 test_posicion_dibujo.cpp -o /tmp/test_posicion_dibujo
/tmp/test_posicion_dibujo
echo "== 1d) sketch de prueba de mesa de un relé (patrón del LED)"
g++ -std=c++17 -I. -include Arduino.h -Wall test_prueba_rele.cpp -o /tmp/test_prueba_rele
/tmp/test_prueba_rele
echo "== 2) sintaxis de los sketches"
python3 generar_prototipos.py $ESP/control_trama_esp32/control_trama_esp32.ino /tmp/n1.cpp
g++ -std=c++17 -fsyntax-only -I. -I$ESP/control_trama_esp32 -include Arduino.h -Wall /tmp/n1.cpp && echo "Nivel 1: OK"
python3 generar_prototipos.py $ESP/nivel2/nivel2_seleccion.ino /tmp/n2.cpp
g++ -std=c++17 -fsyntax-only -I. -I$ESP/nivel2 -include Arduino.h -Wall /tmp/n2.cpp && echo "Nivel 2: OK"
