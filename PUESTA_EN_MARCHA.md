# Puesta en marcha en el telar (Vamatex C 401, cuatro bobinas)

La fábrica tiene telares C 201, C 301 y C 401; el equipo investigó los tres, pero el hardware se
instala en el **C 401** (cuatro bobinas de selección). Este documento reúne lo que hay que hacer
antes y durante la instalación. Nada de esto se puede verificar sin la máquina.

## 1. Claves del sistema (SESSION_SECRET y ESP32_DEVICE_KEY)

Son dos contraseñas largas que el servidor necesita. Se cargan como **variables de entorno** en Render
(no van escritas en el código).

| Variable | Para qué sirve | Qué pasa si falta |
|---|---|---|
| `SESSION_SECRET` | El servidor firma con ella la cookie de sesión de quien inicia sesión. Sin una clave secreta, cualquiera podría fabricar una cookie falsa. | Se usa una clave temporal: funciona, pero todos quedan deslogueados en cada reinicio del servidor. |
| `ESP32_DEVICE_KEY` | Contraseña compartida entre el servidor y los ESP32. Ellos no tienen huella ni navegador: mandan esta clave en cada pedido (header `X-Device-Key`). | El servidor rechaza a los ESP32 con error 401 y no controlan nada. |

**Pasos**

1. Generar dos valores **distintos** y largos (mínimo 32 caracteres):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (o un generador de contraseñas).
2. En Render: el servicio → **Environment** → agregar `SESSION_SECRET` y `ESP32_DEVICE_KEY` con esos valores →
   guardar (Render redespliega solo). Agregar también `WEBAUTHN_RP_ID` (solo el dominio, ej. `control-trama-backend.onrender.com`) y `WEBAUTHN_ORIGIN` (con https, ej. `https://control-trama-backend.onrender.com`).
3. Copiar **el mismo valor** de `ESP32_DEVICE_KEY` en `DEVICE_KEY` de `esp32/control_trama_esp32/config.h`
   (Nivel 1) y de `esp32/nivel2/config_nivel2.h` (Nivel 2), y volver a cargar los firmwares. Tienen que ser
   idénticos, carácter por carácter.
4. Comprobar: el monitor serie no muestra errores 401 y en la web se puede iniciar sesión.

No publicar estas claves en el repositorio ni compartirlas. En el repo queda el texto de ejemplo; la clave
real va solo en la copia que se carga a la placa y en Render. Si se sospecha que una se filtró, se cambia en
Render y en los firmwares.

## 2. Medir con el osciloscopio (Nivel 2)

**Qué se quiere saber.** Cada pasada, el telar "mira" la selección en un instante preciso (cuando abre la
calada). El sensor inductivo avisa el comienzo de la pasada en otro instante. Si el firmware aplica la fila
antes o después de que el telar mire, la tela sale con una fila corrida.

**Qué medir** (con el telar en marcha, a 300 pasadas por minuto = una pasada cada 200 ms):

1. La señal del sensor (pulso de pasada) y la **salida del lector óptico** (lo que le llega a las plaquetas
   del telar), en dos canales, disparando el osciloscopio con el pulso del sensor.
2. El tiempo entre el pulso y el momento en que el lector "lee" (la ventana), repetido en varias pasadas.
3. El nivel y la corriente de la salida del lector, para decidir cómo se conectan los relés PhotoMOS (en
   serie o en paralelo con esa señal).

**Qué decide la medición** (en `config_nivel2.h`):

| Resultado | Ajuste |
|---|---|
| La ventana de lectura llega antes de que el pulso más la latencia del relé (~1 ms) y del ESP32 alcancen a aplicar la fila | `DESPLAZAMIENTO_FILAS = 1` (aplica en el pulso N la fila N+1) o mover el blanco metálico en el eje |
| Hay un desfase pequeño dentro de la pasada | `RETARDO_APLICACION_US` (máximo 50 000 µs) |
| Coincide | Ambos en 0 |

**Seguridad.** Las bobinas trabajan a 24 V de alterna. Medir del lado de baja tensión (el lector), no
conectar la masa del osciloscopio a algo cuyo referencial no se conozca, y hacerlo con el profesor o el
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

- [ ] Claves cargadas en Render y en los dos `config` (sección 1).
- [ ] `N_CANALES = 4` y `elementos_seleccion = 4` (ya están así).
- [ ] `TELAR_ID = 8` en los dos firmwares.
- [ ] Migraciones 009, 012 y 013 probadas antes en una base de prueba (no directo en Neon).
- [ ] `MODO_BANCO = false` en `config_nivel2.h`.
- [ ] Medición con osciloscopio hecha y ajustes cargados (sección 2).
- [ ] Un canal armado y probado en la máquina **antes** de armar los otros tres.
- [ ] Jornada de validación del conteo hecha (sección 3).
