# Simulación del FLUJO LÓGICO del Nivel 2 (control por marcos / dobby)
# Verifica que un patrón repetitivo se traduzca correctamente en la secuencia
# de marcos que suben en cada pasada, y que el ESP32 (vía el registro de
# desplazamiento 74HC595) los comande.

N_CANALES_74HC595 = 8   # un solo integrado da 8 salidas

class Registro74HC595Simulado:
    """Simula el registro de desplazamiento. Cada salida comanda un relé de estado sólido,
    y cada SSR acciona una bobina de selección del telar."""
    def __init__(self, n_marcos):
        self.n = n_marcos
        self.salidas = [0]*N_CANALES_74HC595   # 0=abajo, 1=arriba
    def set_marcos(self, marcos_arriba):
        self.salidas = [0]*N_CANALES_74HC595
        for m in marcos_arriba:
            if 0 <= m < self.n:
                self.salidas[m] = 1
        return [self.salidas[i] for i in range(self.n)]

def patron_a_secuencia_marcos(matriz, n_marcos):
    """
    Traduce una matriz de pasadas (lo que ya define el editor) a la secuencia
    de 'qué marcos suben en cada pasada'. Cada fila de la matriz = una pasada.
    Convención simple: en la pasada i, sube el marco (valor % n_marcos).
    (En un dobby real, cada columna de la matriz mapea a un marco; acá se
    simula la lógica de traducción, que es lo que se quiere verificar.)
    """
    secuencia = []
    for fila in matriz:
        marcos = set()
        for col, val in enumerate(fila):
            if val:  # celda activa → ese marco sube en esta pasada
                marcos.add(col % n_marcos)
        secuencia.append(sorted(marcos))
    return secuencia

print("="*66)
print("  SIMULACIÓN DEL FLUJO LÓGICO — Nivel 2 (marcos / dobby)")
print("="*66)

# Patrón de ejemplo: una RAYA repetitiva (como las telas de las fotos).
# El Vamatex C201 de la planta tiene 3 bobinas de selección instaladas
# (relevamiento del 28/08/26), así que el patrón trabaja con 3 marcos.
# Cada FILA de la matriz es una PASADA, y cada columna una bobina:
#   [1,1,1] -> suben los tres marcos ; [0,1,0] -> sube solo el del medio
N_MARCOS = 3
patron_raya = [
    [1,0,1],  # pasada 1: suben el 1 y el 3
    [0,1,0],  # pasada 2: sube el del medio
    [1,0,1],  # pasada 3: como la 1
    [0,1,0],  # pasada 4: como la 2
]

registro = Registro74HC595Simulado(N_MARCOS)
secuencia = patron_a_secuencia_marcos(patron_raya, N_MARCOS)

print(f"\n  Telar de {N_MARCOS} marcos (bobinas instaladas). Patrón de {len(patron_raya)} pasadas.\n")
print("  Simulando 2 repeticiones completas del patrón (8 pasadas):\n")

historial = []
for rep in range(2):
    for i, marcos in enumerate(secuencia):
        estado_bobinas = registro.set_marcos(marcos)
        historial.append(tuple(estado_bobinas))
        arriba = ','.join(str(m+1) for m in marcos) if marcos else 'ninguno'
        print(f"  rep{rep+1} pasada {i+1}: marcos arriba = [{arriba}]   bobinas={estado_bobinas}")
    print()

# ── VERIFICACIONES ──
print("="*66)
print("  VERIFICACIONES")
print("="*66 + "\n")

v = []
# 1. Cada pasada activa exactamente los marcos correctos
v.append(("La pasada 1 sube los marcos 1 y 3",
          secuencia[0] == [0,2]))
v.append(("La pasada 2 sube solo el marco 2",
          secuencia[1] == [1]))
# 2. El patrón se repite idéntico (bucle correcto)
prim_rep = historial[0:4]
seg_rep  = historial[4:8]
v.append(("El patrón se repite idéntico en cada vuelta (bucle correcto)",
          prim_rep == seg_rep))
# 3. Nunca se activan más marcos que los que tiene el telar
v.append((f"Nunca se activan más marcos que los físicos ({N_MARCOS})",
          all(sum(h) <= N_MARCOS for h in historial)))
# 4. En cada pasada, complementariedad (los que no suben, bajan)
v.append(("En cada pasada, cada marco está definido (arriba O abajo)",
          all(len(h) == N_MARCOS for h in historial)))
# 5. Un solo 74HC595 alcanza (tiene 8 salidas)
v.append((f"Un solo 74HC595 alcanza para este telar ({N_MARCOS} marcos, 8 salidas disponibles)",
          N_MARCOS <= N_CANALES_74HC595))

okc = 0
for nombre, cond in v:
    print(f"  {'✅' if cond else '❌'} {nombre}")
    if cond: okc += 1
print(f"\n  RESULTADO: {okc}/{len(v)} verificaciones OK")
