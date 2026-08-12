# Verificación de coherencia entre: firmware (.ino), diagrama SVG, documento Word
import re

ino = open('/home/claude/proyecto_completo/esp32/control_trama_esp32/control_trama_esp32.ino').read()
cfg = open('/home/claude/proyecto_completo/esp32/control_trama_esp32/config.h').read()
svg = open('/home/claude/proyecto_completo/diagramas/diagrama_conexion_electrica.svg').read()
doc = open('/tmp/doc_elec_plain.txt').read()

checks = []
def chk(nombre, cond, detalle=""):
    checks.append((cond, nombre, detalle))

# ── 1. Pines de relé coinciden en las 3 fuentes ──
ino_marcha = 'PIN_RELE_MARCHA = 25' in ino
ino_pausa  = 'PIN_RELE_PAUSA  = 26' in ino
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
ino_25_in1 = bool(re.search(r'PIN_RELE_MARCHA = 25.*IN1', ino))
doc_25_in1 = bool(re.search(r'GPIO 25.*IN1', doc))
svg_in1 = 'IN1' in svg and 'IN2' in svg
chk("GPIO25→IN1 y GPIO26→IN2 (mapeo consistente)", ino_25_in1 and doc_25_in1 and svg_in1,
    f"ino_25→IN1={ino_25_in1} doc_25→IN1={doc_25_in1} svg_tiene_IN1/IN2={svg_in1}")

# ── 3. Cadena de voltajes 24V→5V→3.3V ──
v24 = '24V' in svg and '24V' in doc
v5  = '5V' in svg and '5V' in doc
v33 = '3.3V' in svg and '3.3V' in doc
chk("Cadena de voltajes 24V→5V→3.3V presente en diagrama y doc", v24 and v5 and v33,
    f"24V={v24} 5V={v5} 3.3V={v33}")

# ── 4. LM2596 como regulador en ambos ──
lm = 'LM2596' in svg and 'LM2596' in doc
chk("Regulador LM2596 (24V→5V) en diagrama y doc", lm)

# ── 5. Alimentación lógica del relé a 3.3V (VCC) separada de JD-VCC (5V) ──
svg_vcc_logic = '3.3V → VCC lógico' in svg or ('3.3V' in svg and 'VCC' in svg)
doc_vcc_logic = '3.3V' in doc and 'VCC' in doc
doc_jdvcc = 'JD-VCC' in doc
svg_jdvcc = 'JD-VCC' in svg
chk("VCC lógico del relé a 3.3V (separado de JD-VCC a 5V)", svg_vcc_logic and doc_vcc_logic and doc_jdvcc and svg_jdvcc,
    f"svg_vcc_logic={svg_vcc_logic} doc_vcc_logic={doc_vcc_logic} JD-VCC(doc={doc_jdvcc},svg={svg_jdvcc})")

# ── 6. Quitar jumper JD-VCC (crítico para no quemar el ESP32) ──
svg_jumper = 'Quitar' in svg and 'jumper' in svg.lower()
doc_jumper = 'jumper' in doc.lower() or 'quitar el jumper' in doc.lower()
chk("Advertencia de quitar el jumper JD-VCC", svg_jumper and doc_jumper,
    f"svg={svg_jumper} doc={doc_jumper}")

# ── 7. Relés en PARALELO con la botonera (no en serie) ──
svg_par = 'paralelo' in svg.lower()
doc_par = 'paralelo' in doc.lower()
chk("Relés conectados en PARALELO con los botones del telar", svg_par and doc_par)

# ── 8. Protección eléctrica: fusible, schottky, TVS ──
prot = all(x in svg for x in ['FUSIBLE','SCHOTTKY','TVS']) and all(x.lower() in doc.lower() for x in ['fusible','schottky','tvs'])
chk("Etapa de protección (fusible + Schottky + TVS) en diagrama y doc", prot)

# ── 9. Arranque seguro de relés en el firmware ──
# escribe NIVEL_INACTIVO ANTES de pinMode OUTPUT
idx_w1 = ino.find('digitalWrite(PIN_RELE_MARCHA, NIVEL_INACTIVO)')
idx_pm = ino.find('pinMode(PIN_RELE_MARCHA, OUTPUT)')
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
