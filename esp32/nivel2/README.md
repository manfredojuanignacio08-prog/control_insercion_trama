# Nivel 2, código en desarrollo

Este directorio contiene el firmware del **Nivel 2**: el conteo real de pasadas
(Bloque C) y la selección del dibujo (Bloque D).

## Estado

**No está instalado en la máquina.** Es código de desarrollo, escrito para poder
revisarlo y probarlo en banco antes de que existan las mediciones que faltan.

El firmware que hoy corre en el telar es el del Nivel 1, que está en
`esp32/control_trama_esp32/`. Los dos son proyectos separados a propósito: el
Nivel 1 ya funciona y no conviene tocarlo mientras se desarrolla el Nivel 2.

## Qué falta antes de poder usarlo

| Medición | Para qué |
|---|---|
| Tensión rectificada de los 24 V AC del telar | Elegir la resistencia del canal del sensor |
| Relación de giro del eje elegido | Confirmar que da una vuelta por pasada |
| Tensión y corriente en la salida de un lector óptico | Confirmar el relé y su conexionado |
| Si el agujero del papel abre o cierra el circuito | Definir si el relé va en serie o en paralelo |

Hasta tener esos datos, los valores marcados como `A_CONFIRMAR` en `config_nivel2.h`
son estimaciones y no deben darse por buenos.

## Archivos

- `nivel2_seleccion.ino`, el programa principal
- `config_nivel2.h`, parámetros y credenciales, en un solo lugar
- `sensor_pasada.h`, el conteo de pasadas (Bloque C)
- `seleccion_dibujo.h`, el comando de los seis canales (Bloque D)

## Cómo probarlo sin el telar

`config_nivel2.h` tiene una constante `MODO_BANCO`. Con ella en `true`, el
programa no espera pulsos reales del sensor: los genera él mismo a 5 por segundo,
que es el ritmo del telar a 300 pasadas por minuto. Sirve para verificar la
lógica de avance y el comando de las salidas con un LED en cada canal.
