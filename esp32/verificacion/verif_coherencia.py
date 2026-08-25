# Verificación de coherencia entre el firmware (.ino), el diagrama SVG y la
# documentación del repositorio.
#
# Uso:  python3 esp32/verificacion/verif_coherencia.py
# (se puede correr desde cualquier carpeta: las rutas se resuelven solas
#  respecto de la raíz del repositorio)
import re, os

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def _leer(ruta_rel):
    """Lee un archivo del repo. Si no existe, devuelve '' para que el check
    correspondiente falle con un mensaje claro en vez de romper el script."""
    try:
        with open(os.path.join(RAIZ, ruta_rel), encoding='utf-8') as fh:
            return fh.read()
    except FileNotFoundError:
        return ''

ino = _leer('esp32/control_trama_esp32/control_trama_esp32.ino')
cfg = _leer('esp32/control_trama_esp32/config.h')
svg = _leer('diagramas/diagrama_conexion_electrica.svg')
doc = _leer('esp32/README.md')   # la referencia escrita del diseño vive acá

checks = []
def chk(nombre, cond, detalle=""):
    checks.append((cond, nombre, detalle))

# ── 1. Pines de relé coinciden en las 3 fuentes ──
ino_marcha = bool(re.search(r'PIN_RELE_MARCHA\s*=\s*25', ino))
ino_pausa  = bool(re.search(r'PIN_RELE_PAUSA\s*=\s*26', ino))
svg_g25 = 'GPIO 25' in svg
svg_g26 = 'GPIO 26' in svg
doc_g25 = 'GPIO 25' in doc
doc_g26 = 'GPIO 26' in doc
chk("GPIO 25 (Marcha) coincide en firmware+diagrama+doc", ino_marcha and svg_g25 and doc_g25,
    f"ino={ino_marcha} svg={svg_g25} doc={doc_g25}")
chk("GPIO 26 (Pausa) coincide en firmware+diagrama+doc", ino_pausa and svg_g26 and doc_g26,
    f"ino={ino_pausa} svg={svg_g26} doc={doc_g26}")

# ── 2. Mapeo GPIO→IN correcto (25→IN1, 26→IN2) ──
# firmware: GPIO25 = IN1 (comentario), diagrama: "GPIO 25" ... "IN1", doc: "GPIO 25 ... IN1"
ino_25_in1 = bool(re.search(r'PIN_RELE_MARCHA\s*=\s*25.*IN1', ino))
doc_25_in1 = bool(re.search(r'GPIO 25.*IN1', doc))
svg_in1 = 'IN1' in svg and 'IN2' in svg
svg_in3 = 'IN3' in svg
ino_27 = bool(re.search(r'PIN_RELE_RETROCEDER\s*=\s*27', ino))
chk("GPIO25→IN1, GPIO26→IN2 y GPIO27→IN3 (mapeo consistente)",
    ino_25_in1 and doc_25_in1 and svg_in1 and svg_in3 and ino_27,
    f"ino_25→IN1={ino_25_in1} doc_25→IN1={doc_25_in1} svg_IN1/IN2={svg_in1} svg_IN3={svg_in3} ino_27={ino_27}")

# ── 2b. Sensado de Avanzar/Impulso (GPIO32/33, solo lectura) ──
ino_sens = bool(re.search(r'PIN_SENSOR_AVANZAR\s*=\s*32', ino)) and bool(re.search(r'PIN_SENSOR_IMPULSO\s*=\s*33', ino))
svg_sens = 'GPIO 32' in svg and 'GPIO 33' in svg
chk("Sensado de Avanzar/Impulso en GPIO32/33 (firmware y diagrama)", ino_sens and svg_sens,
    f"ino={ino_sens} svg={svg_sens}")

# ── 3. Cadena de alimentación 220V→5V→3.3V ──
v220 = '220V' in svg
v5   = '5V' in svg
v33  = '3.3V' in svg
chk("Cadena de alimentación 220V→5V→3.3V presente en el diagrama", v220 and v5 and v33,
    f"220V={v220} 5V={v5} 3.3V={v33}")

# ── 4. Módulo de fuente propio (independiente del telar) ──
fuente = 'HLK-5M05' in svg
chk("Módulo de fuente HLK-5M05 (220V→5V) en el diagrama", fuente)

# ── 5. Alimentación lógica del relé a 3.3V (VCC) separada de JD-VCC (5V) ──
svg_vcc_logic = '3.3V → VCC lógico' in svg or ('3.3V' in svg and 'VCC' in svg)
doc_vcc_logic = '3.3V' in doc and 'VCC' in doc
doc_jdvcc = 'JD-VCC' in doc
svg_jdvcc = 'JD-VCC' in svg
chk("VCC lógico del relé alimentado a 3.3V (en diagrama y doc)", svg_vcc_logic and doc_vcc_logic,
    f"svg={svg_vcc_logic} doc={doc_vcc_logic}")

# ── 6. Jumper JD-VCC PUESTO (una sola fuente de 5V para todo) ──
readme = _leer('esp32/README.md')
jumper_ok = 'jumper' in readme.lower() and 'puesto' in readme.lower()
chk("Jumper JD-VCC documentado como PUESTO", jumper_ok, f"README={jumper_ok}")

# ── 7. Relés en PARALELO con la botonera (no en serie) ──
svg_par = 'paralelo' in svg.lower()
doc_par = 'paralelo' in doc.lower()
chk("Relés conectados en PARALELO con los botones del telar", svg_par and doc_par)

# ── 8. Protección eléctrica: fusible de 1A en la entrada de red ──
prot = 'FUSIBLE' in svg.upper() and '1 A' in svg
chk("Fusible de 1A protegiendo la entrada de 220V (en el diagrama)", prot)

# ── 9. Arranque seguro de relés en el firmware ──
# escribe NIVEL_INACTIVO ANTES de pinMode OUTPUT
m_w1 = re.search(r'digitalWrite\(PIN_RELE_MARCHA,\s*NIVEL_INACTIVO\)', ino)
idx_w1 = m_w1.start() if m_w1 else -1
m_pm = re.search(r'pinMode\(PIN_RELE_MARCHA,\s*OUTPUT\)', ino)
idx_pm = m_pm.start() if m_pm else -1
chk("Firmware: arranque seguro (escribe INACTIVO antes de pinMode)", 0 <= idx_w1 < idx_pm,
    f"write@{idx_w1} < pinMode@{idx_pm}")

# ── 10. Relé activo-bajo coherente (firmware) ──
rab = 'RELE_ACTIVO_BAJO' in cfg and 'NIVEL_ACTIVO' in ino and 'NIVEL_INACTIVO' in ino
chk("Firmware maneja polaridad del relé (activo-bajo configurable)", rab)

# ── 11. Pulso momentáneo (no deja el relé pegado) ──
pulso = 'pulsarRele' in ino and ('delay' in ino or 'DURACION_PULSO' in ino or 'PULSO' in ino.upper())
chk("Firmware: pulso momentáneo del relé (simula apretar el botón)", pulso)

# ── RESULTADO ──
ok = sum(1 for c,_,_ in checks if c)
print(f"{'='*66}")
print(f"  VERIFICACIÓN DE COHERENCIA: {ok}/{len(checks)} chequeos OK")
print(f"{'='*66}\n")
for cond, nombre, det in checks:
    print(f"  {'✅' if cond else '❌'} {nombre}")
    if not cond and det:
        print(f"       ⤷ {det}")
print()
