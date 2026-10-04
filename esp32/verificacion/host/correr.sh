#!/bin/sh
# Verificación del firmware en la PC, sin placa ni Arduino IDE.
#  1) Prueba la lógica REAL de sensor_pasada.h (retrocesos, reclasificación, período de gracia),
#     de seleccion_dibujo.h (un agujero por pasada), con un reloj simulado, y de
#     posicion_dibujo.h (la posición avanza y retrocede igual que en el backend).
#  1d) Corre el sketch de prueba de mesa de un relé (pruebas/prueba_rele_lca110) con reloj simulado.
#  1e) Ejecuta el Bloque A (relés y sensado de la botonera) del firmware con reloj simulado.
#  2) Comprueba que el firmware compila (sintaxis) en sus dos modos, con NIVEL2_INSTALADO en false
#     y en true, contra "stubs" mínimos de la API de Arduino.
#     Es una comprobación de sintaxis y tipos: NO reemplaza compilar con el core ESP32 real.
set -e
cd "$(dirname "$0")"
ESP=../..
FW=$ESP/control_trama_esp32
echo "== 1) sensor_pasada.h"
g++ -std=c++17 -I. -I$FW -include Arduino.h test_sensor_pasada.cpp -o /tmp/test_sensor_pasada
/tmp/test_sensor_pasada
echo "== 1b) seleccion_dibujo.h"
g++ -std=c++17 -I. -I$FW -include Arduino.h test_seleccion.cpp -o /tmp/test_seleccion
/tmp/test_seleccion
echo "== 1c) posicion_dibujo.h (misma posición que el backend)"
g++ -std=c++17 -I. -I$FW test_posicion_dibujo.cpp -o /tmp/test_posicion_dibujo
/tmp/test_posicion_dibujo
echo "== 1d) sketch de prueba de mesa de un relé (patrón del LED)"
g++ -std=c++17 -I. -include Arduino.h -Wall test_prueba_rele.cpp -o /tmp/test_prueba_rele
/tmp/test_prueba_rele
echo "== 1e) Bloque A del firmware"
python3 generar_prototipos.py $FW/control_trama_esp32.ino /tmp/fw_botonera.cpp
g++ -std=c++17 -I. -I$FW -include Arduino.h test_botonera.cpp -o /tmp/test_botonera
/tmp/test_botonera
echo "== 2) sintaxis del firmware en sus dos modos"
python3 generar_prototipos.py $FW/control_trama_esp32.ino /tmp/fw.cpp
g++ -std=c++17 -fsyntax-only -I. -I$FW -include Arduino.h -Wall /tmp/fw.cpp && echo "Solo Bloque A (NIVEL2_INSTALADO false): OK"
g++ -std=c++17 -fsyntax-only -I. -I$FW -include Arduino.h -Wall -DNIVEL2_INSTALADO=true /tmp/fw.cpp && echo "Bloques A, C y D (NIVEL2_INSTALADO true): OK"
