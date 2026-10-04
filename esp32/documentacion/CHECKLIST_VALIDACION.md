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
      dañarlo).

## Etapa 2, El ESP32 solo (SIN el relé, SIN el telar)

- [ ] Conectá el ESP32 al 5V ya verificado (pin VIN).
- [ ] Cargá el firmware. Abrí el monitor serie.
- [ ] Confirmá que **conecta al WiFi** y que **sondea el backend** (se ve en
      el log). Todavía no hay relé, así que no pasa nada físico: solo se
      valida que la lógica corre.
- [ ] Medí el pin **3.3V** del ESP32: debe leer ~3,3 V (es el que alimenta la
      lógica del relé).

## Etapa 3, El relé, pero con un LED o zumbador (NO el telar)

- [ ] Conectá el módulo relé por el conector de las señales (GND · IN1 · IN2 · VCC),
      con el jumper JD-VCC puesto y el conector del jumper sin usar: VCC a 5V (nunca a
      los 3.3V del ESP32), GND común, GPIO 25 → IN1, GPIO 26 → IN2, GPIO 27 → IN3 (relé adicional para
      Retroceder, si el módulo es de 2 canales, hace falta sumar un
      tercer relé o pasar a un módulo de 3-4 canales).
- [ ] En lugar del telar, poné un **LED con resistencia** (o un zumbador, o
      simplemente escuchá el "clic" del relé) en los contactos NO/COM de
      cada uno de los tres relés.
- [ ] Desde la web, asigná un patrón (estado "tejiendo"): debe sonar/encender
      el relé de **Marcha** una vez (un pulso, no quedar pegado).
- [ ] Detené desde la web: debe activarse el relé de **Pausa** una vez.
- [ ] Apretá el botón ⏪ de la web (con confirmación): debe activarse el
      relé de **Retroceder** una vez.
- [ ] **Prueba del arranque seguro:** reiniciá el ESP32 con todo conectado.
      Los tres relés **NO deben dispararse solos** al encender. Si se
      disparan, revisá los pull-ups de 10 kΩ en IN1/IN2/IN3.
- [ ] **Reposo del módulo de 2 canales:** con el ESP32 encendido y sin pulsos, el LED de
      IN1 e IN2 tiene que quedar **apagado del todo** (ni siquiera tenue). La entrada queda
      en 3,3 V y el módulo en 5 V: en la mayoría de los módulos eso no hace circular
      corriente, pero en algunos sí. Si queda encendido, cambiá el módulo o sacá el
      jumper JD-VCC y alimentá VCC con 3,3 V y JD-VCC con 5 V.

## Etapa 3b, Sensado de los botones (banco, sin telar)

- [ ] Armá un canal de sensado: puente rectificador (DB157) + capacitor 22-47 µF + R 2,2 kΩ 1W
      → LED del PC817; del otro lado, colector con pull-up de 10 kΩ a 3.3V
      → GPIO 32 (Avanzar). Repetí para GPIO 33 (Impulso).
- [ ] Con el multímetro, confirmá que **en reposo el GPIO lee 3.3V** (alto).
- [ ] Simulá el botón: aplicá una fuente de 24V AC (o el propio telar, más
      adelante) a la entrada del puente. El GPIO debe caer a **0V** (bajo)
      mientras dure la pulsación.
- [ ] En el monitor de serie debe aparecer el mensaje de sensado, y en la
      web la barra de estado debe mostrar **"Posición incierta"**.
- [ ] Apretá **Confirmar** en la web: el aviso debe desaparecer.
- [ ] **Anti-rebote:** una pulsación sola no debe generar más de un aviso
      (el firmware filtra con 400 ms de debounce).

## Etapa 4, Conexión al telar (recién ahora)

- [ ] Con el telar **apagado**, identificá los dos cables de cada botón
      físico (Marcha, Pausa y Retroceder: cada par sirve tanto para el relé
      como para el sensado). Si un botón tiene 3 o 4 terminales, con el multímetro en
      continuidad elegí el par **NA** (el que NO pita en reposo y SÍ al
      apretar); el par NC no se usa.
- [ ] Conectá **en paralelo** NO1/COM1 a las chapas del botón de Marcha,
      NO2/COM2 a las del botón de Pausa, y NO3/COM3 a las del botón de
      Retroceder. En paralelo = la botonera manual tiene que seguir
      funcionando igual.
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

**Coherencia entre documentos:** los
pines (GPIO 25→IN1 Marcha, GPIO 26→IN2 Pausa), la cadena de voltajes
(220V→5V→3,3V, con la fuente HLK-5M05), el jumper JD-VCC puesto (todo el módulo a 5V, sin llevar 3.3V al VCC), la conexión en paralelo, y la etapa de protección coinciden entre el
firmware, el diagrama eléctrico y el documento de conexiones.

> **Estado actual:** `verif_coherencia.py` da 17/17. Ya incluye el tercer relé (GPIO 27 → IN3), que
> el diagrama muestra, y además compara los límites de filas y columnas entre la web, el servidor,
> el firmware y la base, y los pines de las bobinas del Nivel 2 con su diagrama.

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
