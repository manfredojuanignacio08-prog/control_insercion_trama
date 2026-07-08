# Checklist de validación del circuito (antes de conectar al telar)

Los diagramas y el firmware ya fueron verificados por coherencia y por
simulación lógica (ver más abajo). Pero un circuito de potencia **se valida
en el banco, por etapas, con un multímetro** — ninguna simulación reemplaza
esto, porque el ruido eléctrico real del telar y la corriente de sus motores
solo se conocen midiéndolos.

Seguí este orden. **No saltees etapas** y no conectes al telar hasta el final.

## Etapa 1 — Alimentación (SIN el ESP32 conectado)

- [ ] Con el circuito armado pero **el ESP32 y el relé desconectados**,
      alimentá la entrada con los 24V (o la fuente de banco).
- [ ] Medí con el multímetro la salida del **LM2596**: ajustá el
      potenciómetro hasta leer **5,0 V** estables en OUT+ / OUT–.
- [ ] Verificá la polaridad: OUT+ es positivo, OUT– es negativo. Un error
      acá quema todo lo que conectes después.
- [ ] Cortá la alimentación. Confirmá que el **jumper JD-VCC del módulo relé
      esté QUITADO** (si queda puesto, puede realimentar 5V al ESP32 y
      dañarlo).

## Etapa 2 — El ESP32 solo (SIN el relé, SIN el telar)

- [ ] Conectá el ESP32 al 5V ya verificado (pin VIN).
- [ ] Cargá el firmware. Abrí el monitor serie.
- [ ] Confirmá que **conecta al WiFi** y que **sondea el backend** (se ve en
      el log). Todavía no hay relé, así que no pasa nada físico: solo se
      valida que la lógica corre.
- [ ] Medí el pin **3.3V** del ESP32: debe leer ~3,3 V (es el que alimenta la
      lógica del relé).

## Etapa 3 — El relé, pero con un LED o zumbador (NO el telar)

- [ ] Conectá el módulo relé: 5V a JD-VCC, 3.3V a VCC lógico, GND común,
      GPIO 25 → IN1, GPIO 26 → IN2.
- [ ] En lugar del telar, poné un **LED con resistencia** (o un zumbador, o
      simplemente escuchá el "clic" del relé) en los contactos NO/COM.
- [ ] Desde la web, asigná un patrón (estado "tejiendo"): debe sonar/encender
      el relé de **Marcha** una vez (un pulso, no quedar pegado).
- [ ] Detené desde la web: debe activarse el relé de **Pausa** una vez.
- [ ] **Prueba del arranque seguro:** reiniciá el ESP32 con todo conectado.
      Los relés **NO deben dispararse solos** al encender. Si se disparan,
      revisá los pull-ups de 10 kΩ en IN1/IN2.

## Etapa 4 — Conexión al telar (recién ahora)

- [ ] Con el telar **apagado**, identificá los dos cables de cada botón
      físico (Marcha y Pausa).
- [ ] Conectá **en paralelo** NO1/COM1 a las chapas del botón de Marcha, y
      NO2/COM2 a las del botón de Pausa. En paralelo = la botonera manual
      tiene que seguir funcionando igual.
- [ ] Antes de energizar, verificá que **la botonera manual del telar sigue
      andando** (apretá los botones a mano).
- [ ] Recién ahí probá el arranque/pausa desde la web, con alguien al lado
      del botón de parada de emergencia del telar por las dudas.

## Notas de seguridad

- El telar es una máquina industrial: probá siempre con la **parada de
  emergencia accesible**.
- Nunca conectes/desconectes cables con el circuito energizado.
- Si algo se calienta, huele raro o hace un ruido anormal: cortá la
  alimentación y revisá antes de seguir.

---

## Estado de la verificación previa (hecha por software)

Antes de esta validación física, ya se verificó lo siguiente:

**Coherencia entre documentos (12/12):** los pines (GPIO 25→IN1 Marcha,
GPIO 26→IN2 Pausa), la cadena de voltajes (24V→5V→3,3V), la separación
JD-VCC/VCC-lógico, la advertencia de quitar el jumper, la conexión en
paralelo, y la etapa de protección coinciden entre el firmware, el diagrama
eléctrico y el documento de conexiones.

**Simulación del flujo lógico Nivel 1 (6/6):** el arranque seguro (el telar
no arranca solo), el arranque con "tejiendo", la ausencia de doble-pulso
(no re-arranca si el estado no cambia), la detención con "pausado"/
"finalizado", y que los relés no se quedan pegados.

**Simulación del flujo lógico Nivel 2 (6/6):** la traducción de la matriz de
pasadas a la secuencia de marcos, la repetición idéntica del patrón en bucle,
y que nunca se activan más marcos que los físicos.

Estas verificaciones aseguran que el **diseño es coherente y la lógica es
correcta**. Lo que confirma la checklist de arriba es que la **implementación
física** (voltajes, corrientes, cableado real) también lo sea.
