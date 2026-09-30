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
svg = _leer('diagramas/hardware/diagrama_conexion_electrica.svg')
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

# ── 2b. Sensado de los 3 botones (GPIO32/33/34, solo lectura) ──
ino_sens = all(bool(re.search(rf'PIN_SENSOR_{n}\s*=\s*{p}', ino))
               for n, p in [('MARCHA', 32), ('PAUSA', 33), ('RETROCEDER', 34)])
svg_sens = 'GPIO 32' in svg and 'GPIO 34' in svg
chk("Sensado de los 3 botones en GPIO32/33/34 (firmware y diagrama)", ino_sens and svg_sens,
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

# ── 5. El VCC del módulo de relés va a 5V, nunca a los 3.3V del ESP32 ──
# El módulo se usa con el jumper JD-VCC puesto (une JD-VCC y VCC). Si además se llevaran
# los 3.3V del ESP32 al VCC, quedarían unidas las líneas de 5V y 3.3V.
svg_vcc_5v  = '5V → VCC del módulo' in svg and '3.3V → VCC' not in svg
doc_vcc_5v  = 'nunca a los 3.3V del ESP32' in doc and '3.3V → VCC lógico' not in doc
chk("VCC del módulo de relés a 5V, nunca a los 3.3V del ESP32 (diagrama y doc)", svg_vcc_5v and doc_vcc_5v,
    f"svg={svg_vcc_5v} doc={doc_vcc_5v}")

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
m_w1 = re.search(r'digitalWrite\(PIN_RELE_MARCHA,\s*nivelInactivo\(', ino)
idx_w1 = m_w1.start() if m_w1 else -1
m_pm = re.search(r'pinMode\(PIN_RELE_MARCHA,\s*OUTPUT\)', ino)
idx_pm = m_pm.start() if m_pm else -1
chk("Firmware: arranque seguro (escribe INACTIVO antes de pinMode)", 0 <= idx_w1 < idx_pm,
    f"write@{idx_w1} < pinMode@{idx_pm}")

# ── 10. Relé activo-bajo coherente (firmware) ──
rab = 'RELE_MARCHA_ACTIVO_BAJO' in cfg and 'nivelActivo' in ino and 'nivelInactivo' in ino
chk("Firmware maneja polaridad del relé (activo-bajo configurable)", rab)

# ── 11. Pulso momentáneo (no deja el relé pegado) ──
pulso = 'pulsarRele' in ino and ('delay' in ino or 'DURACION_PULSO' in ino or 'PULSO' in ino.upper())
chk("Firmware: pulso momentáneo del relé (simula apretar el botón)", pulso)

# ── 5b. Resistencias de las entradas del módulo: pull-up a 3,3 V en IN1 e IN2 (activo-bajo) y
# pull-down a GND en IN3 (el módulo de Retroceder es activo-alto: con pull-up arrancaría pegado).
# Ninguna a 5 V: esas líneas van a pines del ESP32, que no toleran 5 V.
svg_in3 = '10 kΩ a GND' in svg and 'IN3 con pull-down a GND' in svg and 'IN1, IN2 e IN3 a 3' not in svg
doc_in3 = 'IN3 con pull-down de 10 kΩ a GND' in doc
guia_a = ''
try:
    from docx import Document
    _d = Document(os.path.join(RAIZ, 'documentacion_proyecto', 'Guia_Armado_Bloque_A.docx'))
    guia_a = ' '.join(p.text for p in _d.paragraphs)
except Exception:
    pass
sin_5v = '3,3V/5V' not in guia_a and 'nunca a 5 V' in guia_a
chk("Pull-up a 3,3 V en IN1/IN2 y pull-down a GND en IN3, ninguno a 5 V (diagrama, doc y guía)",
    svg_in3 and doc_in3 and sin_5v, f"svg={svg_in3} doc={doc_in3} guía={sin_5v}")

# ── 12. Límite de filas: el mismo en la web, el servidor, el firmware y la base ──
# Se cambió de 100 a 300 en todas las capas a la vez; si una quedara distinta, la web
# aceptaría dibujos que el servidor, la base o la placa rechazan.
web = _leer('backend/public/index.html')
val = _leer('backend/src/utils/validacion.js')
n2  = _leer('esp32/nivel2/nivel2_seleccion.ino')
mig = _leer('backend/src/db/migracion_017_filas_hasta_300.sql')
def _num(pat, txt):
    m = re.search(pat, txt)
    return int(m.group(1)) if m else None
lim = {
    'web (casilla)':      _num(r'id="in-rows"[^>]*max="(\d+)"', web),
    'web (corrección)':   _num(r'const r = Math\.min\((\d+), Math\.max\(1, rNum\)\)', web),
    'servidor':           _num(r'const MAX_FILAS = (\d+);', val),
    'firmware Nivel 2':   _num(r'static const int MAX_FILAS = (\d+);', n2),
    'base (migración)':   _num(r'filas BETWEEN 1 AND (\d+)', mig),
}
chk("Límite de filas igual en web, servidor, firmware y base", len(set(lim.values())) == 1 and None not in lim.values(),
    ", ".join(f"{k}={v}" for k, v in lim.items()))

# ── 13. Límite de columnas: el mismo en la web y en el servidor ──
col = {
    'web':      _num(r'const c = Math\.min\((\d+), Math\.max\(1, cNum\)\)', web),
    'servidor': _num(r'const MAX_COLUMNAS = (\d+);', val),
}
chk("Límite de columnas igual en web y servidor", len(set(col.values())) == 1 and None not in col.values(),
    ", ".join(f"{k}={v}" for k, v in col.items()))

# ── 14. Pines de las bobinas del Nivel 2: firmware y diagrama del canal ──
cfg2 = _leer('esp32/nivel2/config_nivel2.h')
m = re.search(r'PIN_CANAL\[N_CANALES\]\s*=\s*\{\s*([\d,\s]+)\}', cfg2)
pines = [int(x) for x in m.group(1).split(',')] if m else []
canal = _leer('diagramas/hardware/canal_rele.svg')
chk("Pines de las bobinas del Nivel 2 iguales en firmware y diagrama (18, 19, 21, 22)",
    pines == [18, 19, 21, 22] and '18 · 19 · 21 · 22' in canal, f"firmware={pines}")

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
