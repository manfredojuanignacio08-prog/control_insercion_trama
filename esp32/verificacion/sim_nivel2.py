# Simulación del FLUJO LÓGICO del Nivel 2 (selección de las bobinas)
# Verifica que un dibujo se traduzca correctamente en la secuencia de bobinas que se activan
# en cada pasada: una sola por pasada (en cada pasada entra una sola trama), cada fila tantas
# pasadas como sus repeticiones, los intercalados alternando sus filas en orden, y el dibujo en
# bucle. Cada bobina es un canal del ESP32 que comanda un relé LCA110 sobre su lector óptico.
# El modelo del firmware con el sensor de pasada (conteo, retrocesos, reinicios) está en
# sim_nivel2_firmware.py.

N_CANALES = 4                      # bobinas de selección del C 201 (confirmado por el dueño)
PINES_CANAL = [18, 19, 21, 22]     # config.h: PIN_CANAL
PINES_OCUPADOS = {25, 26, 27, 32, 33, 34, 35, 2}   # relés y sensado del Bloque A, sensor, LED
PINES_SOLO_ENTRADA = {34, 35, 36, 39}              # el ESP32 no puede usarlos como salida


def bobina_de_fila(fila):
    """La bobina de una fila (desde 0), o None si la fila no tiene ninguna marcada."""
    marcadas = [c for c, v in enumerate(fila) if v]
    assert len(marcadas) <= 1, "una fila lleva como máximo una bobina"
    return marcadas[0] if marcadas else None


def secuencia_de_bobinas(matriz, repeticiones, grupos=()):
    """Qué bobina se activa en cada pasada de una vuelta del dibujo. Un intercalado
    {desde, hasta, pasadas} recorre sus filas en orden, cada una sus repeticiones, hasta
    completar sus pasadas (como posicion.js en el backend)."""
    grupos = sorted(grupos, key=lambda g: g["desde"])
    salida, f = [], 0
    while f < len(matriz):
        g = next((g for g in grupos if g["desde"] == f), None)
        if g:
            ciclo = [bobina_de_fila(matriz[i])
                     for i in range(g["desde"], g["hasta"] + 1)
                     for _ in range(repeticiones[i])]
            salida += [ciclo[k % len(ciclo)] for k in range(g["pasadas"])]
            f = g["hasta"] + 1
        else:
            salida += [bobina_de_fila(matriz[f])] * repeticiones[f]
            f += 1
    return salida


def canales(bobina):
    """El estado de los canales en una pasada: solo el de la bobina activa."""
    return tuple(1 if c == bobina else 0 for c in range(N_CANALES))


print("=" * 66)
print("  SIMULACIÓN DEL FLUJO LÓGICO, Nivel 2 (selección de las bobinas)")
print("=" * 66)

# Dibujo de ejemplo: una raya (bobina 1 tres pasadas, bobina 3 dos) y después un intercalado
# de las filas 3 a 6 (bobinas 1, 3, 4 y 2, una pasada cada una) durante 8 pasadas.
matriz = [
    [1, 0, 0, 0],   # fila 1: bobina 1
    [0, 0, 1, 0],   # fila 2: bobina 3
    [1, 0, 0, 0],   # fila 3: bobina 1  ┐
    [0, 0, 1, 0],   # fila 4: bobina 3  │ intercalado
    [0, 0, 0, 1],   # fila 5: bobina 4  │ de 8 pasadas
    [0, 1, 0, 0],   # fila 6: bobina 2  ┘
]
repeticiones = [3, 2, 1, 1, 1, 1]
grupos = [{"desde": 2, "hasta": 5, "pasadas": 8}]

vuelta = secuencia_de_bobinas(matriz, repeticiones, grupos)
print(f"\n  Telar de {N_CANALES} bobinas. Dibujo de {len(matriz)} filas = {len(vuelta)} pasadas por vuelta.")
print("  Simulando 2 vueltas completas del dibujo:\n")

historial = []
for v in range(2):
    texto = []
    for b in vuelta:
        historial.append(canales(b))
        texto.append(f"B{b + 1}" if b is not None else "-")
    print(f"  vuelta {v + 1}: {' '.join(texto)}")
print()

# ── VERIFICACIONES ──
print("=" * 66)
print("  VERIFICACIONES")
print("=" * 66 + "\n")

pasadas_vuelta = len(vuelta)
v = []
# 1. Una sola bobina por pasada
v.append(("En cada pasada se activa una sola bobina (una trama por pasada)",
          all(sum(h) == 1 for h in historial)))
# 2. Cada fila dura sus repeticiones
v.append(("La fila 1 dura sus 3 pasadas (B1) y la fila 2 sus 2 (B3)",
          vuelta[:5] == [0, 0, 0, 2, 2]))
# 3. El intercalado alterna sus filas en orden
v.append(("El intercalado alterna en orden: B1, B3, B4, B2, B1, B3, B4, B2",
          vuelta[5:] == [0, 2, 3, 1, 0, 2, 3, 1]))
# 4. El dibujo se repite idéntico (bucle)
v.append(("El dibujo se repite idéntico en cada vuelta (bucle correcto)",
          historial[:pasadas_vuelta] == historial[pasadas_vuelta:]))
# 5. Nunca más canales que los físicos
v.append((f"Nunca se activan más canales que los físicos ({N_CANALES})",
          all(len(h) == N_CANALES and sum(h) <= N_CANALES for h in historial)))
# 6. Los pines de los canales son salidas libres
v.append((f"Los {N_CANALES} canales usan pines de salida que no pisan a otros ({PINES_CANAL})",
          len(PINES_CANAL) == N_CANALES and not set(PINES_CANAL) & PINES_OCUPADOS
          and not set(PINES_CANAL) & PINES_SOLO_ENTRADA))

okc = 0
for nombre, cond in v:
    print(f"  {'✅' if cond else '❌'} {nombre}")
    if cond: okc += 1
print(f"\n  RESULTADO: {okc}/{len(v)} verificaciones OK")
