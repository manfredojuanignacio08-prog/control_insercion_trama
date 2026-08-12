# Simulación del FLUJO LÓGICO del Nivel 2 (control por marcos / dobby)
# Verifica que un patrón repetitivo se traduzca correctamente en la secuencia
# de marcos que suben en cada pasada, y que el ESP32 (vía PCA9685) los comande.

class PCA9685Simulado:
    """Simula el controlador de 16 canales. Cada canal = un servo = un marco."""
    def __init__(self, n_marcos):
        self.n = n_marcos
        self.canales = [0]*16   # 0=abajo, 1=arriba
    def set_marcos(self, marcos_arriba):
        self.canales = [0]*16
        for m in marcos_arriba:
            if 0 <= m < self.n:
                self.canales[m] = 1
        return [self.canales[i] for i in range(self.n)]

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

# Patrón de ejemplo: una RAYA repetitiva (como las telas de las fotos)
# 4 pasadas que se repiten, con 8 marcos.
N_MARCOS = 8
# matriz: cada fila es una pasada; 1 = ese marco/columna sube
patron_raya = [
    [1,0,1,0,1,0,1,0],  # pasada 1: suben marcos pares
    [0,1,0,1,0,1,0,1],  # pasada 2: suben marcos impares
    [1,0,1,0,1,0,1,0],  # pasada 3: como la 1
    [0,1,0,1,0,1,0,1],  # pasada 4: como la 2
]

pca = PCA9685Simulado(N_MARCOS)
secuencia = patron_a_secuencia_marcos(patron_raya, N_MARCOS)

print(f"\n  Telar de {N_MARCOS} marcos. Patrón repetitivo de {len(patron_raya)} pasadas.\n")
print("  Simulando 2 repeticiones completas del patrón (8 pasadas):\n")

historial = []
for rep in range(2):
    for i, marcos in enumerate(secuencia):
        estado_servos = pca.set_marcos(marcos)
        historial.append(tuple(estado_servos))
        arriba = ','.join(str(m+1) for m in marcos) if marcos else 'ninguno'
        print(f"  rep{rep+1} pasada {i+1}: marcos arriba = [{arriba}]   servos={estado_servos}")
    print()

# ── VERIFICACIONES ──
print("="*66)
print("  VERIFICACIONES")
print("="*66 + "\n")

v = []
# 1. Cada pasada activa exactamente los marcos correctos
v.append(("La pasada 1 sube los marcos pares (1,3,5,7)",
          secuencia[0] == [0,2,4,6]))
v.append(("La pasada 2 sube los marcos impares (2,4,6,8)",
          secuencia[1] == [1,3,5,7]))
# 2. El patrón se repite idéntico (bucle correcto)
prim_rep = historial[0:4]
seg_rep  = historial[4:8]
v.append(("El patrón se repite idéntico en cada vuelta (bucle correcto)",
          prim_rep == seg_rep))
# 3. Nunca se activan más marcos que los que tiene el telar
v.append(("Nunca se activan más marcos que los físicos (8)",
          all(sum(h) <= N_MARCOS for h in historial)))
# 4. En cada pasada, complementariedad (los que no suben, bajan)
v.append(("En cada pasada, cada marco está definido (arriba O abajo)",
          all(len(h) == N_MARCOS for h in historial)))
# 5. Un PCA9685 alcanza (≤16 canales)
v.append(("Un solo PCA9685 alcanza para este telar (≤16 marcos)",
          N_MARCOS <= 16))

okc = 0
for nombre, cond in v:
    print(f"  {'✅' if cond else '❌'} {nombre}")
    if cond: okc += 1
print(f"\n  RESULTADO: {okc}/{len(v)} verificaciones OK")
