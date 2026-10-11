# Paso a paso: medición y conexión de los relés LCA110 (Bloque D)

Cómo reemplazar cada lector óptico por un relé LCA110: qué medir, cómo decidir cuál de los tres
casos corresponde, cómo armar los relés y cómo conectarlos al telar. Se hace **primero con un
solo lector** (el lector 1) y recién cuando ese canal funciona se repite con los otros tres.

Diagramas que acompañan esta guía (en `diagramas/hardware/`):

- `canal_rele_sin_sensor.png`: un canal, con el cuadro "cómo saber cuál corresponde" y los tres casos.
- `diagrama_bloque_D_caso1.png`, `diagrama_bloque_D_caso2A.png` y `diagrama_bloque_D_caso2B.png`: los
  cuatro relés conectados, uno por caso.

---

## Antes de empezar

**Herramientas y materiales**

- Multímetro con tensión continua (V), continuidad y corriente (mA, y el borne de 10 A).
- Cinta de papel o de enmascarar y un marcador para etiquetar cables. Celular para sacar fotos.
- 4 relés LCA110, 4 resistencias de 330 Ω y 4 de 10 kΩ (¼ W), del lado del ESP32.
- Solo para los casos 2A y 2B: 4 resistencias de 10 kΩ **½ W**, del lado del telar.
- Borneras, placa perforada, termocontraíble y cable fino.
- Para la prueba en el banco: una pila de 9 V, un LED y una resistencia de 1 kΩ.

**Reglas de seguridad (todas las etapas)**

1. **Conectar y desconectar cables siempre con el telar apagado y desenchufado.** Con el telar
   encendido solo se mide, con las puntas del multímetro, sin tocar nada con la mano.
2. Con el telar encendido, **sin tejer**: el telar parado, sin dar Marcha.
3. Cuando una medición no da clara, o no coincide con ninguno de los casos, **parar y consultar**.
   No probar a ver qué pasa.
4. Cuando se mide corriente, la punta roja va al borne de mA (o de 10 A). **Después de medir
   corriente hay que volver la punta roja al borne de V**: si se mide tensión con la punta en el
   borne de corriente, se hace un cortocircuito.
5. Nada del lado del telar se une con el GND del ESP32. Los dos lados solo se tocan a través del
   relé.

**Planilla para anotar** (una por lector; completar a medida que se mide):

| Dato | Lector 1 |
|---|---|
| Color del cable que va a "+ alimentación" | |
| Color del cable que va a "− alimentación" | |
| Color del cable de señal A | |
| Color del cable de señal B | |
| Tensión entre + y − (paso 1.3) | |
| Tensión entre A y B con **papel** (paso 1.4) | |
| Tensión entre A y B con **luz/agujero** (paso 1.4) | |
| A contra −, con papel / con luz (paso 1.5) | |
| B contra −, con papel / con luz (paso 1.5) | |
| Tensión entre los bornes de señal **con el lector desconectado** (paso 2.2) | |
| Caso que corresponde | |
| Corriente con el relé "cerrado" (paso 2.5) | |

---

## Etapa 1 · Relevar el lector 1 (lector conectado)

**1.1** Telar apagado y desenchufado. Ubicar el lector 1 y los 4 cables que van de él a la
plaqueta.

**1.2** Sacar una foto de cómo están conectados. Marcar cada cable con cinta en las dos puntas
(por ejemplo `L1-1`, `L1-2`, `L1-3`, `L1-4`) y anotar en la planilla el color y el borne de la
plaqueta al que va cada uno. **No desconectar nada todavía.**

**1.3 Encontrar la alimentación.** Enchufar y encender el telar, sin tejer. Multímetro en tensión
continua (si no es autorrango, empezar por la escala más alta y bajar). Medir de a pares en los
tornillos de la plaqueta. El par de alimentación es el que da **siempre la misma tensión**, haya
papel o luz delante del lector. Con la punta negra en uno y la roja en el otro, si la lectura da
positiva, la roja está en **+** y la negra en **−**. Anotar la tensión. Los otros dos cables son la
señal (A y B).

**1.4 Ver qué hace el agujero.** Medir entre A y B:

- con **papel** delante del lector (la cinta sin agujero, o un papel tapándolo), y
- con **luz** (un agujero de la cinta delante, o sin papel).

Anotar las dos lecturas. Lo que importa es qué cambia: si con luz la tensión entre A y B **baja a
casi 0 V**, el agujero **une** A y B; si con luz la tensión **sube**, el agujero los **separa**.

**1.5 Medir cada cable de señal contra el −.** Punta negra en el − de alimentación. Medir A y
después B, con papel y con luz. Anotar las cuatro lecturas. Sirven en la etapa 2 si el caso
resulta ser el 2.

**1.6** Apagar y desenchufar el telar.

---

## Etapa 2 · Decidir el caso (lector desconectado)

**2.1** Con el telar apagado y desenchufado, desconectar de la plaqueta los 4 cables del lector 1
(ya están marcados). Cubrir cada punta con cinta para que no toquen nada.

**2.2** Encender el telar, sin tejer. Medir la tensión entre los **2 bornes de señal que quedaron
libres** en la plaqueta.

- **Hay tensión** (algunos voltios): la plaqueta pone la tensión y el lector solo une o separa los
  2 bornes. **→ Caso 1.** Seguir en el paso 2.5.
- **Da 0 V**: la tensión la ponía el lector. Seguir en el paso 2.3.

**2.3 Identificar salida y referencia** (solo si dio 0 V). Apagar y desenchufar el telar.
Multímetro en continuidad (o en ohms). Medir cada borne de señal contra el borne del −:

- El que da continuidad (casi 0 Ω) es la **referencia**.
- El otro es la **salida**.
- Si ninguno da continuidad, o los dos la dan, **parar**: el lector no encaja en estos casos y hay
  que revisar la plaqueta antes de seguir.

**2.4 Elegir entre 2A y 2B.** Con las lecturas del paso 1.5, mirar el cable que resultó ser la
salida, **con luz** (agujero):

- La salida está cerca de la tensión de alimentación (**+V**). **→ Caso 2A.**
- La salida está cerca de **0 V**. **→ Caso 2B.**
- Si con papel y con luz da casi lo mismo, la medición no sirve: repetir la etapa 1.

**2.5 Medir la corriente que va a pasar por el relé.** Esta medición imita al relé cerrado, así
que de paso muestra si la bobina 1 reacciona. Hacer la conexión con el telar apagado y
desenchufado. Recién después encenderlo, sin tejer, y leer.

Multímetro en corriente continua, **empezando por el borne y la escala de 10 A**. Si la lectura
es chica, pasar a mA. Para cambiar de borne, apagar el telar primero. Según el caso:

| Caso | Dónde va el multímetro (en lugar del relé) |
|---|---|
| 1 | entre los 2 bornes de señal |
| 2A | entre el + y la salida, con la resistencia de 10 kΩ ½ W ya puesta entre la salida y el − |
| 2B | entre la salida y el −, con la resistencia de 10 kΩ ½ W ya puesta entre el + y la salida |

- **Pocos mA (menos de 20): perfecto.**
- Entre 20 y 100 mA: sirve, pero anotarlo y consultarlo antes de seguir.
- **Más de 100 mA: no se puede usar el LCA110** (aguanta 120 mA como máximo). Parar.
- La tensión de alimentación tiene que ser menor de 60 V. Con más, parar y consultar.

Mientras el multímetro está puesto, fijarse si la bobina 1 se activa (si se escucha, o si la
plaqueta tiene una luz). **En los casos 2A y 2B la bobina tiene que activarse con el multímetro
puesto y soltarse al sacarlo.** En el caso 1, si con agujero A y B quedan unidos (paso 1.4),
también se activa con el multímetro puesto. Si con agujero quedan separados, es al revés: se
activa al sacarlo.

**2.6** Apagar y desenchufar el telar. **Volver la punta roja al borne de V.**

---

## Etapa 3 · Armar los relés del lado del ESP32 (en el banco, sin el telar)

**3.1 Identificar las patas del LCA110.** Es un integrado de 6 patas. La pata 1 está marcada con
un punto o una muesca. Las patas 1, 2 y 3 están de un lado y las 4, 5 y 6 enfrente, numeradas
en sentido antihorario mirándolo desde arriba.

- **1 y 2**: el LED de entrada (lado ESP32). 1 es el + (ánodo) y 2 el − (cátodo).
- **4 y 6**: la salida (lado telar). No tienen polaridad.
- **3 y 5**: no se conectan.

**3.2 Probar cada relé antes de soldarlo al ESP32.** ESP32 alimentado solo por USB. Para cada
relé:

1. Del lado de la salida, multímetro en continuidad (o en ohms) entre las patas 4 y 6: tiene que
   dar **abierto**.
2. Del lado del LED, conectar el pin **3V3** del ESP32, una resistencia de 330 Ω, la pata 1, y de la
   pata 2 al **GND** del ESP32. La salida tiene que pasar a **cerrado** (unas decenas de ohms).
3. Sacar el 3V3: tiene que volver a abierto.

Si un relé no cambia, revisar la orientación (pata 1) antes de descartarlo.

**3.3 Soldar los cuatro canales** en la placa perforada, iguales entre sí:

| Relé | GPIO |
|---|---|
| 1 | 18 |
| 2 | 19 |
| 3 | 21 |
| 4 | 22 |

En cada canal:

- GPIO → resistencia de 330 Ω → pata 1.
- Pata 2 → GND del ESP32 (las cuatro patas 2 van al mismo GND).
- Resistencia de 10 kΩ del GPIO a GND, **pegada al pin**, antes de la de 330 Ω. Así el relé queda
  abierto mientras el ESP32 arranca.
- Patas 4 y 6 → bornera de salida del canal (rotular `R1`, `R2`, `R3`, `R4`).

**3.4 Probar con el firmware, todavía en el banco.**

1. En `config.h`, poner `NIVEL2_INSTALADO` y `MODO_BANCO` en `true`.
2. Entre las patas 4 y 6 de cada relé, conectar la pila de 9 V, la resistencia de 1 kΩ y el LED,
   en serie.
3. Cargar un dibujo en la web y ponerlo a tejer: el LED de cada canal tiene que encenderse según
   su columna. Con `PORCENTAJE_SELECCION` en 0 (como viene) queda encendido fijo mientras la misma
   bobina se repite y cambia cuando cambia la bobina; con un porcentaje (por ejemplo 50) parpadea
   una vez por pasada.
4. Con el ESP32 apagado, los cuatro LED quedan apagados (los relés abiertos).

Al terminar, **volver `MODO_BANCO` a `false`.** Con `true` no se instala nunca en la máquina.

---

## Etapa 4 · Conectar el relé 1 al telar

**4.1** Telar apagado y desenchufado, ESP32 apagado. Seguir el diagrama del caso que corresponde
(`diagrama_bloque_D_caso1`, `_caso2A` o `_caso2B`). Todo va con bornera, para poder volver a
conectar el lector si hiciera falta.

**Caso 1**

- Pata 4 del relé 1 → un borne de señal del lector 1 en la plaqueta.
- Pata 6 → el otro borne de señal.
- Los cables + y − que iban al lector quedan sin usar: aislar las puntas (o dejar la bornera vacía).

**Caso 2A**

- Pata 4 del relé 1 → **+** del conector del lector 1.
- Pata 6 → **salida** (señal).
- Resistencia de 10 kΩ ½ W de la salida al **−**.
- La referencia se une al − de ese mismo conector (si en la plaqueta ya están unidas, no hace
  falta un cable).

**Caso 2B**

- Resistencia de 10 kΩ ½ W del **+** a la **salida** (señal).
- Pata 4 del relé 1 → salida.
- Pata 6 → **−** del conector del lector 1.
- La referencia se une al − de ese mismo conector.

En los casos 2A y 2B, cada canal usa el + y el − **de su propio conector** y lleva su propia
resistencia. Las salidas de los cuatro relés no se unen entre sí.

**4.2 Configurar el firmware** (`esp32/control_trama_esp32/config.h`):

| Caso | `CANAL_ACTIVO_EN_ALTO` |
|---|---|
| 1, si con agujero A y B quedaban unidos | `true` |
| 1, si con agujero A y B quedaban separados | `false` |
| 2A | `true` |
| 2B | `true` |

Es un solo valor para los cuatro canales: los cuatro lectores tienen que haber dado el mismo caso.
Si alguno da distinto, consultar antes de seguir. `NIVEL2_INSTALADO` se pone en `true` recién
cuando también esté armado y conectado el sensor de pasada (Bloque C). Hasta entonces se puede
dejar el relé conectado con `NIVEL2_INSTALADO` en `false`: el ESP32 no lo acciona y queda abierto.

**4.3 Prueba en reposo.** ESP32 apagado. Encender el telar, sin tejer. Con el relé abierto la
plaqueta tiene que ver **papel**: la bobina 1 en reposo.

- **Caso 2A**: la salida contra el − da cerca de 0 V.
- **Caso 2B**: la salida contra el − da cerca de +V.
- **Caso 1 con `true`**: entre los 2 bornes de señal se lee lo mismo que con papel en el paso 1.4.
  (Con `false`, ver la nota del final.)

**4.4 Prueba con el ESP32.** Encender el ESP32. Mientras arranca y sin trabajo en curso, la bobina
1 sigue en reposo. La prueba tejiendo se hace con el sensor de pasada instalado y una cinta o
dibujo de prueba, como dice `PUESTA_EN_MARCHA.md` (sincronización y prueba de tejido).

**4.5 Los otros tres.** Con el canal 1 funcionando, repetir las etapas 1, 2 y 4 con los lectores 2,
3 y 4 (la etapa 3 ya está hecha para los cuatro). Lector 2 → relé 2 (GPIO 19), lector 3 → relé 3
(GPIO 21) y lector 4 → relé 4 (GPIO 22).

---

## Nota sobre el caso 1 con `false`

Si en el caso 1 el agujero **separa** los bornes, con el relé abierto la plaqueta ve agujero. Eso
significa que con el ESP32 apagado, o mientras arranca, la plaqueta vería "agujero" en ese canal y
la bobina se activaría. En los casos 2A y 2B, y en el caso 1 con `true`, eso no pasa: relé abierto
es papel. Si sale el caso 1 con `false`, consultar antes de dejarlo instalado.
