# Puesta en marcha en el telar (Vamatex C 201, cuatro bobinas)

La fábrica tiene telares C 201, C 301 y C 401; el equipo investigó los tres, y el hardware se
instala en el **C 201** (matrícula 1104, cuatro bobinas de selección), el mismo telar que se relevó y
midió. El diseño sirve igual para los otros dos modelos, que comparten la arquitectura de selección. Este documento reúne lo que hay que hacer
antes y durante la instalación. Nada de esto se puede verificar sin la máquina.

## 1. Claves del sistema (SESSION_SECRET, RECOVERY_SECRET y ESP32_DEVICE_KEY)

Son tres contraseñas largas que el servidor necesita. Se cargan como **variables de entorno** en Render
(no van escritas en el código).

| Variable | Para qué sirve | Qué pasa si falta |
|---|---|---|
| `SESSION_SECRET` | El servidor firma con ella la cookie de sesión de quien inicia sesión. Sin una clave secreta, cualquiera podría fabricar una cookie falsa. | **El servidor no arranca.** |
| `RECOVERY_SECRET` | Cifra los códigos de recuperación guardados en la base: sin ella, quien consiga una copia de la base no puede usarlos. Mínimo 16 caracteres. | **El servidor no arranca.** Si se cambia después, los códigos guardados dejan de leerse: regenerarlos con `npm run codigo -- <usuario> --rotar` (con los dos guiones antes del usuario: sin ellos, npm se queda con `--rotar` y no rota nada). |
| `ESP32_DEVICE_KEY` | Contraseña compartida entre el servidor y los ESP32. Ellos no tienen huella ni navegador: mandan esta clave en cada pedido (header `X-Device-Key`). | El servidor rechaza a los ESP32 con error 401 y no controlan nada. |

**Pasos**

1. Generar tres valores **distintos** y largos (mínimo 32 caracteres):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (o un generador de contraseñas).
2. En Render: el servicio → **Environment** → agregar `SESSION_SECRET`, `RECOVERY_SECRET` y `ESP32_DEVICE_KEY` con esos valores →
   guardar (Render redespliega solo). Agregar también `WEBAUTHN_RP_ID` (solo el dominio, ej. `control-trama-backend.onrender.com`) y `WEBAUTHN_ORIGIN` (con https, ej. `https://control-trama-backend.onrender.com`).
3. Copiar **el mismo valor** de `ESP32_DEVICE_KEY` en `DEVICE_KEY` de `esp32/control_trama_esp32/config.h`
   (el único firmware de la placa) y volver a cargarlo. Tienen que ser idénticos, carácter por carácter. En ese
   mismo archivo van `WIFI_SSID` y `WIFI_PASSWORD` de la red de la fábrica y `NIVEL2_INSTALADO` (`false` mientras
   el sensor y los relés LCA110 no estén conectados): en el repositorio quedan con un texto de ejemplo
   (`NOMBRE_DE_LA_RED`, `CLAVE_DE_LA_RED`); los datos reales se escriben solo en la copia que se carga a la placa y
   **no se suben** al repositorio. Si la clave del router cambia, hay que actualizarla y volver a cargarlo.
4. Comprobar: el monitor serie no muestra errores 401 y en la web se puede iniciar sesión.

No publicar estas claves en el repositorio ni compartirlas. En el repo quedan los textos de ejemplo; la clave del
dispositivo real va solo en Render y en la copia que se carga a la placa, y lo mismo el WiFi de la fábrica. Si se
sospecha que una se filtró, se cambia en Render y en el firmware (y la del WiFi, en el router). **Las versiones
anteriores del repositorio tenían escritas la clave del dispositivo y la del WiFi**: siguen en el historial de git,
así que hay que cambiar las dos antes de poner el sistema en la fábrica.

## 2. Ajustar la sincronización (Nivel 2)

**Qué se quiere saber.** Cada pasada, el telar "mira" la selección en un instante preciso (cuando abre la
calada), y el sensor inductivo avisa el comienzo de la pasada en otro instante. Además, con el papel la
selección se activa y se suelta en cada pasada (entre dos agujeros seguidos hay papel); el firmware, como
viene, la mantiene mientras la bobina se repite, y también puede soltarla en cada pasada. Si la fila se aplica antes o después de tiempo, o dura poco, la tela sale mal.

**Sin osciloscopio** (el camino previsto; la guía de los relés LCA110 lo explica paso a paso):

1. Con el multímetro, medir el nivel y la corriente de la salida del lector óptico, para decidir cómo se
   conectan los relés LCA110 (en serie o en paralelo con el lector, o en su lugar, en uno de los casos
   1, 2A o 2B). El paso a paso de la medición y la conexión está en
   `esp32/documentacion/PASO_A_PASO_RELES_LCA110.md`.
2. `PORCENTAJE_SELECCION` viene en 0: la bobina queda activa mientras se repita (por ejemplo, las 120
   pasadas seguidas de una bobina) y cambia cuando cambia la bobina, que es lo que se ve en el telar.
   Si en la prueba alguna pasada no toma la selección, probar con un porcentaje: se estima con una regla
   sobre la cinta de papel, el diámetro del agujero dividido por la distancia entre los centros de dos
   agujeros seguidos (agujeros de 4 mm cada 8 mm dan 50 %).
3. Tejer una prueba corta con un dibujo fácil de reconocer y corregir según la tabla de abajo.

**Con osciloscopio, si hay uno en la escuela** (a 300 pasadas por minuto, una pasada cada 200 ms): medir
la señal del sensor y la salida del lector óptico en dos canales, disparando con el pulso del sensor.
Se ve el tiempo entre el pulso y la lectura (la ventana) y qué parte de cada pasada dura la señal del
lector cuando pasa un agujero.

**Qué se ajusta** (en `esp32/control_trama_esp32/config.h`):

| Resultado | Ajuste |
|---|---|
| El dibujo sale corrido una pasada (la ventana de lectura llega antes de que se aplique la fila, o después) | `DESPLAZAMIENTO_FILAS` en 1 o −1, o mover el blanco metálico en el eje |
| Hay un desfase pequeño dentro de la pasada (solo se ve con osciloscopio) | `RETARDO_APLICACION_US` (máximo 50 000 µs) |
| Algunas pasadas no toman la selección, o la señal del lector dura otra parte de la pasada que la mitad | `PORCENTAJE_SELECCION` (hoy 0: se mantiene mientras la bobina se repita; de 1 a 90 se suelta en cada pasada) |
| La tela sale bien | No se toca nada |

**Seguridad.** Las bobinas trabajan a 24 V de alterna. Medir del lado de baja tensión (el lector); con
osciloscopio, no conectar su masa a algo cuyo referencial no se conozca. Hacerlo con el profesor o el
técnico presentes.

## 3. Validar el conteo del sensor

El sensor cuenta pulsos y eso da las pasadas. Antes de creerle hay que comprobar que no cuenta de más
(rebotes) ni de menos (pulsos perdidos) a 300 por minuto.

1. Con el Nivel 2 instalado y reportando, anotar el **contador mecánico del telar** al empezar.
2. Tejer un período largo (idealmente una jornada) y anotar el contador mecánico al terminar.
3. Comparar la diferencia con el conteo del sistema. Si coinciden (una sugerencia de criterio, a definir
   con el profesor: menos de 0,1 % de diferencia), el conteo se da por bueno. Si no, revisar el montaje del
   sensor: filtro de rebote, distancia al blanco, cableado.
4. En la web, con el editor abierto, aparece **"Conteo del sensor sin validar"** junto al estado del telar.
   Tocar **Validar** y confirmar. (Equivale a `POST /api/telares/:id/validar-conteo` con `{"confirmo": true}`.)

Hasta validarlo, los metros de las estadísticas figuran como **estimados** (≈).

## 4. Lista de primera puesta en marcha

- [ ] Claves cargadas en Render (`SESSION_SECRET`, `RECOVERY_SECRET`, `ESP32_DEVICE_KEY`) y en `config.h` (sección 1).
- [ ] `N_CANALES = 4` y `elementos_seleccion = 4` (ya están así).
- [ ] `TELAR_ID` del firmware igual al id del telar que muestra la web. Con la sesión
      iniciada, abrir `https://control-trama-backend.onrender.com/api/telares`: la web usa el
      **primero de esa lista** (ordenada por código, no por id). Su `id` es el que va en
      `TELAR_ID`. Si no coinciden, la web muestra un telar y la placa acciona otro; el síntoma es
      que la web marca "Sin datos del ESP32" aunque la placa esté conectada.
- [ ] Migraciones probadas antes en una base de prueba (no directo en Neon). Ya se verificaron
      sobre una copia con datos de producción: se aplican y los datos se conservan.
- [ ] `NIVEL2_INSTALADO = true` y `MODO_BANCO = false` en `config.h`, recién con el sensor y los relés LCA110 conectados.
- [ ] Sincronización ajustada con la prueba de tejido (o el osciloscopio) y valores cargados (sección 2).
- [ ] Un canal armado y probado en la máquina **antes** de armar los otros tres.
- [ ] Jornada de validación del conteo hecha (sección 3).
