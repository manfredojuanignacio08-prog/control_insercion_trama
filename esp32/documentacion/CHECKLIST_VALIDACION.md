# Checklist de validación del circuito (antes de conectar al telar)

Los diagramas y el firmware ya fueron verificados por coherencia y por
simulación lógica (ver más abajo). Pero un circuito de potencia **se valida
en el banco, por etapas, con un multímetro**, ninguna simulación reemplaza
esto, porque el ruido eléctrico real del telar y la corriente de sus motores
solo se conocen midiéndolos.

Seguí este orden. **No saltees etapas** y no conectes al telar hasta el final.

## Etapa 1, Alimentación (SIN el ESP32 conectado)

- [ ] Con el circuito armado pero **el ESP32 y el relé desconectados**,
      alimentá la entrada de 220V del módulo de fuente (con su fusible de 1A
      en serie).
- [ ] Medí con el multímetro la salida del **HLK-5M05**: debe dar **5 V
      fijos y estables**. No tiene potenciómetro de ajuste; si no da 5 V, el
      módulo está fallado y hay que reemplazarlo.
- [ ] Verificá la polaridad: OUT+ es positivo, OUT– es negativo. Un error
      acá quema todo lo que conectes después.
- [ ] Cortá la alimentación. Confirmá que el **jumper JD-VCC del módulo relé
      esté PUESTO** (une JD-VCC con VCC: así el módulo se alimenta con los
      mismos 5 V, sin fuente separada para las bobinas).

## Etapa 2, El ESP32 solo (SIN el relé, SIN el telar)

- [ ] Conectá el ESP32 al 5V ya verificado (pin VIN).
- [ ] Cargá el firmware. Abrí el monitor serie.
- [ ] Confirmá que **conecta al WiFi** y que **sondea el backend** (se ve en
      el log). Todavía no hay relé, así que no pasa nada físico: solo se
      valida que la lógica corre.
- [ ] Medí el pin **3.3V** del ESP32: debe leer ~3,3 V (es la referencia de las
      resistencias de 10 kΩ de IN1/IN2 y del sensado; el módulo de relés se alimenta con 5 V).

## Etapa 3, El relé, pero con un LED o zumbador (NO el telar)

- [ ] Conectá el módulo relé por el conector de las señales (GND · IN1 · IN2 · VCC),
      con el jumper JD-VCC puesto y el conector del jumper sin usar: VCC a 5V (nunca a
      los 3.3V del ESP32), GND común, GPIO 25 → IN1, GPIO 26 → IN2, GPIO 27 → S del módulo individual de
      Retroceder (activo-alto: su resistencia de 10 kΩ va a GND, no a 3,3 V).
- [ ] En lugar del telar, poné un **LED con resistencia** (o un zumbador, o
      simplemente escuchá el "clic" del relé) en los contactos NO/COM de
      cada uno de los tres relés.
- [ ] Desde la web, asigná un patrón (estado "tejiendo"): debe sonar/encender
      el relé de **Marcha** una vez (un pulso, no quedar pegado).
- [ ] Tocá ⏸ en la web: debe activarse el relé de **Pausa** una vez.
- [ ] Apretá el botón ⏪ de la web (con confirmación): debe activarse el
      relé de **Retroceder** una vez.
- [ ] **Prueba del arranque seguro:** reiniciá el ESP32 con todo conectado.
      Los tres relés **NO deben dispararse solos** al encender. Si se
      disparan, revisá los pull-ups de 10 kΩ en IN1/IN2 y el pull-down de GPIO 27.
- [ ] **Reposo del módulo de 2 canales:** con el ESP32 encendido y sin pulsos, el LED de
      IN1 e IN2 tiene que quedar **apagado del todo** (ni siquiera tenue). La entrada queda
      en 3,3 V y el módulo en 5 V: en la mayoría de los módulos eso no hace circular
      corriente, pero en algunos sí. Si queda encendido, cambiá el módulo o sacá el
      jumper JD-VCC y alimentá VCC con 3,3 V y JD-VCC con 5 V. Cómo medirlo: tensión
      IN–GND ≈ 3,3 V y VCC–IN ≈ 1,7 V; corriente con el multímetro en mA en serie entre
      el GPIO y el IN: menos de 0,1 mA está bien, más de 0,5 mA es un problema.

## Etapa 3b, Sensado de los botones (banco, sin telar)

- [ ] Armá un canal de sensado: puente rectificador (DB157) + capacitor 22 µF 50 V + R 2,2 kΩ 1W
      → LED del PC817; del otro lado, colector con pull-up de 10 kΩ a 3.3V
      → GPIO 32 (Marcha). Repetí para GPIO 33 (Pausa) y GPIO 34 (Retroceder).
- [ ] Sin tensión en la entrada del puente, el GPIO lee **3,3 V** (alto).
- [ ] Aplicá 24 V de alterna (o de 12 a 24 V de continua) a la entrada del puente: el GPIO cae a
      **0 V**. Ese es el **reposo** en el telar: en el par NA de un botón hay 24 V mientras nadie
      lo aprieta.
- [ ] Apretar el botón es sacar esa tensión: el GPIO vuelve a 3,3 V después de 0,15 a 0,25 s (lo
      que tarda en descargarse el capacitor). Cada vez que la volvés a aplicar (en el telar, al
      soltar el botón), el GPIO cae y el monitor serie muestra «Botonera: alguien apretó ...».
      Simulando **Marcha** o **Retroceder** sin un trabajo abierto en la web, la barra de estado
      del editor muestra **"Posición incierta"** (con un trabajo abierto, Marcha pasa la web a
      "Tejiendo" y Pausa a "Pausado").
- [ ] Apretá **Confirmar** en la web: el aviso debe desaparecer.
- [ ] **Anti-rebote:** cada vez que se aplica la tensión tiene que salir un solo aviso
      (el firmware filtra con 400 ms de debounce). Si salen avisos solos con la tensión aplicada,
      sin tocar nada, falta el capacitor de ese canal o está invertido.
- [ ] **Encendido del telar:** aplicá la tensión a dos o tres canales a la vez (como cuando se
      prende el telar con el gabinete encendido): el monitor muestra «Botonera: N canales bajaron
      juntos ...» y no sale ningún aviso.

## Etapa 4, Conexión al telar (recién ahora)

- [ ] Con el telar **apagado**, identificá los dos cables de cada botón
      físico (Marcha, Pausa y Retroceder: cada par sirve tanto para el relé
      como para el sensado). Si un botón tiene 3 o 4 terminales, con el multímetro en
      continuidad elegí el par **NA** (el que NO pita en reposo y SÍ al
      apretar); el par NC no se usa.
- [ ] Con el telar **encendido** y sin tejer, medí en alterna cada par NA: unos **24 V sin apretar
      y 0 V apretando**. Si da 0 V sin apretar, ese no es el par NA: no conectes.
- [ ] Conectá **en paralelo** NO1/COM1 a las chapas del botón de Marcha,
      NO2/COM2 a las del botón de Pausa, y NO3/COM3 a las del botón de
      Retroceder. En paralelo = la botonera manual tiene que seguir
      funcionando igual.
- [ ] Antes de energizar, verificá que **la botonera manual del telar sigue
      andando** (apretá los botones a mano).
- [ ] Recién ahí probá el arranque, la pausa y el retroceso desde la web, con alguien al lado
      del botón Stop del telar por las dudas (la máquina no tiene una parada de emergencia aparte).
- [ ] Con el telar encendido y sin tocar nada, GPIO 32, 33 y 34 dan **0 V**. Apretá cada botón
      a mano (al menos medio segundo): al soltarlo, el monitor muestra «Botonera: alguien apretó …»
      una vez.
- [ ] Con el telar tejiendo, medí en el gabinete el GPIO 32 (Marcha) contra GND: tiene que seguir
      en 0 V. Si da 3,3 V, avisá: el telar puentea el botón de Marcha mientras anda y, cuando pare
      solo, el sensado lo tomaría como un Marcha.
- [ ] Con el gabinete encendido, apagá y prendé el telar: el monitor muestra «Botonera: 3 canales
      bajaron juntos …» y la web no cambia.

## Notas de seguridad

- El telar es una máquina industrial: probá siempre con el **botón Stop del telar
  al alcance** (no tiene una parada de emergencia aparte).
- Nunca conectes/desconectes cables con el circuito energizado.
- Si algo se calienta, huele raro o hace un ruido anormal: cortá la
  alimentación y revisá antes de seguir.

---

## Estado de la verificación previa (hecha por software)

Antes de esta validación física, ya se verificó lo siguiente:

**Coherencia entre documentos:** los
pines (GPIO 25→IN1 Marcha, GPIO 26→IN2 Pausa), la cadena de voltajes
(220V→5V→3,3V, con la fuente HLK-5M05), el jumper JD-VCC puesto (todo el módulo a 5V, sin llevar 3.3V al VCC), la conexión en paralelo, y la etapa de protección coinciden entre el
firmware, el diagrama eléctrico y el documento de conexiones.

> **Estado actual:** `verif_coherencia.py` da 19/19 (incluye que haya un solo firmware para la placa, que sus pines no se pisen, que `NIVEL2_INSTALADO` venga en `false` y que la cantidad de bobinas sea la misma en la web, el firmware y la base). Ya incluye el tercer relé (GPIO 27 → S del módulo de Retroceder), que
> el diagrama muestra, y además compara los límites de filas y columnas entre la web, el servidor,
> el firmware y la base, y los pines de las bobinas del Nivel 2 con su diagrama.

**Simulación del flujo lógico Nivel 1 (6/6):** el arranque seguro (el telar
no arranca solo), el arranque con "tejiendo", la ausencia de doble-pulso
(no re-arranca si el estado no cambia), la detención con "pausado" y con
"apagado" (al terminar el trabajo), y que los relés no se quedan pegados.

**Simulación del flujo lógico Nivel 2 (6/6):** la traducción del dibujo a la bobina de
cada pasada (una sola: una trama por pasada), las repeticiones de cada fila, los
intercalados, la repetición idéntica del patrón en bucle, y que los canales no superan
los físicos ni pisan otros pines.

**Simulación del firmware del Nivel 2 (29/29):** conteo, vueltas, repeticiones por fila,
retrocesos, retomar tras un reinicio y la selección de las bobinas en cada pasada. Además,
`verificacion/host/correr.sh` prueba en la PC el código real del firmware (sensor, selección,
posición y Bloque A) y que compile en sus dos modos.

Estas verificaciones aseguran que el **diseño es coherente y la lógica es
correcta**. Lo que confirma la checklist de arriba es que la **implementación
física** (voltajes, corrientes, cableado real) también lo sea.
