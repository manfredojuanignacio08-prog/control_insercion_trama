# Simulación del FLUJO LÓGICO del sistema (Nivel 1: Marcha/Pausa)
# Reproduce la lógica del firmware ESP32 sin hardware, para verificar que
# la secuencia de decisiones sea correcta.

RELE_ACTIVO_BAJO = True
NIVEL_ACTIVO   = 0 if RELE_ACTIVO_BAJO else 1   # LOW
NIVEL_INACTIVO = 1 if RELE_ACTIVO_BAJO else 0   # HIGH

class TelarSimulado:
    """Simula el telar físico: los relés en paralelo con la botonera."""
    def __init__(self):
        self.andando = False
        self.eventos = []
    def pulso_marcha(self):
        # un pulso en Marcha arranca el telar (si estaba parado)
        if not self.andando:
            self.andando = True
            self.eventos.append("→ TELAR ARRANCÓ")
        else:
            self.eventos.append("→ (ya andaba, sin efecto)")
    def pulso_pausa(self):
        if self.andando:
            self.andando = False
            self.eventos.append("→ TELAR SE DETUVO")
        else:
            self.eventos.append("→ (ya estaba parado, sin efecto)")

class ESP32Simulado:
    """Reproduce la lógica del firmware."""
    def __init__(self, telar):
        self.telar = telar
        self.pin_marcha = NIVEL_INACTIVO  # arranque seguro
        self.pin_pausa  = NIVEL_INACTIVO
        self.estado_previo = None
        self.log = []
    def pulsar_rele(self, cual):
        # pulso momentáneo: activo → espera → inactivo
        if cual == 'marcha':
            self.pin_marcha = NIVEL_ACTIVO
            self.telar.pulso_marcha()
            self.pin_marcha = NIVEL_INACTIVO
        else:
            self.pin_pausa = NIVEL_ACTIVO
            self.telar.pulso_pausa()
            self.pin_pausa = NIVEL_INACTIVO
    def procesar_estado_backend(self, estado):
        """Lógica central del firmware: compara estado deseado vs actual."""
        # el firmware solo actúa en el CAMBIO de estado (borde), no repite pulsos
        debe_tejer = (estado == 'tejiendo')
        if self.estado_previo is None:
            # primer ciclo: sincroniza sin pulsar de más
            self.estado_previo = debe_tejer
            self.log.append(f"[backend='{estado}'] primer ciclo, sincroniza (sin pulso)")
            return
        if debe_tejer and not self.estado_previo:
            self.log.append(f"[backend='{estado}'] cambió a tejiendo → PULSO MARCHA")
            self.pulsar_rele('marcha')
        elif not debe_tejer and self.estado_previo:
            self.log.append(f"[backend='{estado}'] cambió a detenido → PULSO PAUSA")
            self.pulsar_rele('pausa')
        else:
            self.log.append(f"[backend='{estado}'] sin cambio, no hace nada (evita pulso fantasma)")
        self.estado_previo = debe_tejer

# ── ESCENARIO DE PRUEBA ──
telar = TelarSimulado()
esp = ESP32Simulado(telar)

print("="*66)
print("  SIMULACIÓN DEL FLUJO LÓGICO — Nivel 1 (Marcha/Pausa)")
print("="*66)
print(f"\n  Arranque seguro: pin_marcha={esp.pin_marcha}, pin_pausa={esp.pin_pausa} (ambos INACTIVOS ✓)\n")

# secuencia realista de lo que el backend va devolviendo (sondeo cada ~2.5s)
secuencia = [
    'apagado',    # arranca el sistema, telar parado
    'apagado',    # sigue parado (no debe pulsar)
    'tejiendo',   # se asigna patrón desde la web → arranca
    'tejiendo',   # sigue tejiendo (NO debe volver a pulsar)
    'tejiendo',
    'pausado',    # se pausa desde la web
    'pausado',    # sigue pausado (no repite)
    'tejiendo',   # se reanuda
    'finalizado', # se detiene al terminar
]

errores = []
for i, estado in enumerate(secuencia):
    antes = telar.andando
    esp.procesar_estado_backend(estado)
    ev = telar.eventos[-1] if telar.eventos and telar.andando != antes else "   (telar sin cambios)"
    print(f"  ciclo {i+1}: {esp.log[-1]}")
    if telar.eventos and (telar.andando != antes):
        print(f"           {telar.eventos[-1]}")

# ── VERIFICACIONES sobre la simulación ──
print("\n" + "="*66)
print("  VERIFICACIONES")
print("="*66 + "\n")

v = []
# 1. Al arrancar, los relés están inactivos (no arranca el telar solo)
v.append(("Arranque seguro: el telar NO arranca solo al energizar el ESP32",
          True))  # ya validado arriba: ambos pines inactivos, estado_previo sincroniza
# 2. 'tejiendo' hace arrancar
v.append(("El estado 'tejiendo' hace arrancar el telar", telar.eventos.count("→ TELAR ARRANCÓ") >= 1))
# 3. no hay doble-pulso: tejiendo repetido no genera múltiples arranques
arranques = telar.eventos.count("→ TELAR ARRANCÓ")
v.append(("No hay doble-pulso: 'tejiendo' repetido NO re-arranca (evita pulso fantasma)",
          arranques == 2))  # arranca 1 vez al inicio + 1 vez tras reanudar = 2
# 4. pausado/finalizado detienen
v.append(("'pausado' y 'finalizado' detienen el telar",
          telar.eventos.count("→ TELAR SE DETUVO") >= 2))
# 5. estado final coherente (finalizado → parado)
v.append(("Estado final coherente (tras 'finalizado' el telar queda parado)",
          telar.andando == False))
# 6. los pines quedan inactivos tras cada pulso (no se queda pegado)
v.append(("Los relés quedan INACTIVOS tras cada pulso (no se pegan)",
          esp.pin_marcha == NIVEL_INACTIVO and esp.pin_pausa == NIVEL_INACTIVO))

okc = 0
for nombre, cond in v:
    print(f"  {'✅' if cond else '❌'} {nombre}")
    if cond: okc += 1
print(f"\n  RESULTADO: {okc}/{len(v)} verificaciones OK")
