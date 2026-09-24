# Cambios de la revisión completa

Correcciones aplicadas sobre el repositorio a partir de la revisión de firmware, backend, base
de datos y documentación. Cada punto lleva el número que tenía en la revisión.

## Qué probé y qué NO

| Comprobación | Resultado |
|---|---|
| `npm test`: posición (avanzar/retroceder espejo); cookie firmada y clave de dispositivo; **controladores con un pool de base de datos simulado** (retomar/reanudar, `reinicio`, `sin_senal`, retroceso, bloqueo de edición, estadísticas estimadas/validadas, reporte del sensor, registro con invitación y sin sesión); **la lógica de la web ejecutada sin navegador** (recuperar el trabajo al abrir, reanudar, 401, terminar trabajo, etiquetas de estimado) | OK |
| `esp32/verificacion/host/correr.sh`: lógica real de `sensor_pasada.h` con reloj simulado; sintaxis de los dos sketches contra stubs de Arduino | OK |
| Scripts de verificación existentes (13/13, 6/6, 6/6, 21/21) | OK |
| `node --check` de todo el backend y del JavaScript de la web | OK |
| Backend contra una base PostgreSQL real, navegador real, compilación con el core ESP32 real | **NO se pudo** (no hay base ni placa en este entorno). Probar primero en una base de prueba. |

## Críticos

| # | Qué se hizo |
|---|---|
| 1 | Autenticación real. `middleware/auth.js`: cookie de sesión firmada para el operario y clave `X-Device-Key` para los ESP32. Todas las rutas de `/api` la exigen (salvo `/health` y `/auth/*`); las acciones de la web solo con sesión y los avisos del hardware (`evento-fisico`, `pasadas`) solo con clave de dispositivo. El login ahora emite la cookie; se agregaron `GET /auth/sesion` y `POST /auth/logout`. Se quitó "Continuar sin iniciar sesión". La web maneja el 401 y vuelve al ingreso. |
| 2 | `MODO_BANCO = false` por defecto, con el motivo explicado en el archivo. |
| 3 | El Nivel 2 se separó en dos núcleos: `loop()` (núcleo 1) solo cuenta pulsos y aplica filas, sin esperar nunca a la red; toda la red va a `tareaRed()` (núcleo 0). La descarga del dibujo se arma en un buffer aparte y se copia en una sección crítica. Timeouts de red 5 s (ya no bloquean el tiempo real). `delay(5)` → `delay(1)`. |
| 4 | `StaticJsonDocument<8192>` → `JsonDocument` (heap, ArduinoJson 7). |
| 5 | Los dos firmwares usan core ESP32 3.x + ArduinoJson 7. Mismo bloque de watchdog (`init` y, si ya estaba inicializado, `reconfigure`). |
| 6 | `RECOMENDACIONES_ELECTRICAS.md` (las dos copias): IN1/IN2 pull-up, **IN3 pull-down a GND**, sensado 32/33/34 con pull-up. Se corrigió "GPIO 32 y 33" y "seis SSR". |

## Importantes

| # | Qué se hizo |
|---|---|
| 7 | **Modelo confirmado: una fila = una pasada** (lo de dibujar la fila dos veces para repetirla quedó superado en la octava pasada: ahora cada fila lleva su número de repeticiones). `utils/posicion.js` se simplificó: `avanzar` y `retroceder` son espejos exactos (una prueba lo verifica), sin repeticiones por celda. Retroceder desde la fila 0 va a la última (el dibujo es un lazo) y descuenta una vuelta si cruza el inicio. El comentario "retrocedió una pasada" ahora es cierto. `pasada_actual`/`columna_actual` quedan en 0 por compatibilidad. |
| 8 | Nivel 1: cuando `reportarEventoFisico()` devuelve OK, `estadoDeseado` se actualiza (marcha→1, pausa→0), así el sondeo siguiente no ve un "cambio" y no da el pulso extra. |
| 9 | El conteo del Nivel 1 se marca como **estimado** (`origen_conteo`). Con el Nivel 2: el sensor escribe `pasadas_sensor` (no `pasadas_totales`), deja un heartbeat, y mientras es reciente `POST /avanzar` responde 409 `SENSOR_ACTIVO` y la web deja de avanzar por reloj y sigue la posición del sensor. Las estadísticas dicen "estimadas" / "≈" hasta que el conteo esté validado (`POST /validar-conteo`, tras comparar con el contador mecánico). |
| 10 | El rate limit y el heartbeat "ESP32 conectado" ya no se conceden por `?origen=esp32`: exigen la clave de dispositivo. |
| 11 | Tabla `migraciones_aplicadas`: cada migración corre una sola vez y en transacción. La 009 **ya no borra dibujos** (restricciones `NOT VALID`); si una migración falla, el error queda visible y se reintenta. |
| 12 | `PUT /patrones/:id` responde 409 si se cambia la matriz o las dimensiones de un dibujo con producción abierta. Nombre, colores y metadatos se pueden editar. |
| 13 | El aviso de retroceso es un **contador**, no un booleano. Además se corrigió algo que la revisión no mencionaba: el Nivel 2 leía `retroceder_seq`, que solo sube por pedidos de la web, así que **los retrocesos hechos en la botonera no llegaban**. Ahora lee `retrocesos_contados` (web + botonera). También se resolvió la carrera entre el aviso (hasta 2,5 s de demora) y el pulso del sensor: si el pulso llegó antes y la máquina está en pausa, se reclasifica. |
| 14 | Período de gracia: hasta el primer pulso rige `GRACIA_ARRANQUE_MS` (15 s); con pulsos, `TIMEOUT_SIN_PULSOS_MS` (3 s). |

## Menores

Hecho: `TELAR_ID` 8 y misma URL/clave en los dos niveles (con soporte HTTPS); `config (1).h` borrado; `reportarError()` ahora se usa (reinicio por watchdog/brownout/panic, pérdida de Wi-Fi, backend sin respuesta; se envía al recuperarse la red); datos de máquina unificados (`elementos_seleccion` 4 en la base, el backend y el firmware); el Nivel 2 escribe `pasadas_sensor`; invitaciones (se consumen al crear el usuario); registro libre limitado a 3 usuarios (`REGISTRO_LIBRE_MAX`), y agregar una huella a una cuenta existente exige sesión; límite de intentos en login/recuperación; `WEBAUTHN_RP_ID` por variable de entorno (aviso al arrancar si falta); índice único de una producción `en_curso` por telar; `limit`/`offset` en historial y dibujos, `limit` validado en errores; `.env.example`, `.dockerignore`, `.gitignore`; `docker-compose` sin contraseña fija, sin exponer Postgres y sin CORS `*`.

**No se tocó, como pediste:** las credenciales Wi-Fi en los `config`. Tampoco el `recovery_code` en texto plano (decisión documentada; con el límite de intentos ya no se puede adivinar por fuerza bruta).

## Segunda revisión (sobre mis propios cambios)

Releí todo lo que había cambiado buscando errores míos. Encontré y corregí:

| Problema en mi cambio anterior | Corrección |
|---|---|
| El manejador de errores descartaba el `codigo` del error: el 409 `PATRON_EN_PRODUCCION` llegaba a la web sin código y se mostraba el cartel equivocado ("ya existe un dibujo con ese nombre"). | `errorHandler` ahora reenvía `codigo`. |
| La cookie de sesión se marcaba `Secure` siempre en producción: por `http://` en la red local el navegador la descartaba y nadie podía mantener la sesión. | `Secure` solo si la conexión es HTTPS. |
| Bloqueé editar la matriz de un dibujo con trabajo abierto, pero la web **no tenía cómo cerrarlo** (solo existía Pausa): el operario quedaba sin salida. | Botón `⏹ Terminar trabajo` (con confirmación) y aviso claro al intentar editar. |
| La pantalla seguía mostrando "Celda / Pasada" (modelo viejo). | Se muestra solo "Fila N / total". |

## Retomar el trabajo (lo que pediste)

Lo que encontré revisando este caso, y lo que hice:

1. **Al recargar la página la fila volvía a 0** en pantalla aunque el telar siguiera en la fila N (y desde ahí divergían pantalla y backend). Ahora la web **recupera sola el trabajo en curso al abrirse** (mismo dibujo, misma fila; en pausa te deja listo para ▶) y, al reanudar, toma la fila **del backend**.
2. **Empezar otro dibujo cerraba en silencio el trabajo pausado.** Ahora pregunta antes ("Hay un trabajo en curso… ¿empezar igual?").
3. **Asignar de nuevo el mismo dibujo reiniciaba la producción.** Ahora el backend la **reanuda** (salvo `reiniciar: true`).
4. **Corte de luz / traslado a la fábrica:** el Nivel 1, al arrancar en frío (no en reinicio por watchdog), avisa `reinicio`: el estado pasa de "tejiendo" a **"pausado" sin perder producción, dibujo ni posición**, y marca la posición como incierta para que la verifiques. Antes quedaba "tejiendo" con la máquina apagada.
5. **Nivel 2:** retoma la fila y el conteo desde el backend (esto ya estaba, pero lo había roto un bug que corregí en la primera pasada); ahora reporta cada 1 s en vez de 2,5 s y una vez más al pausar: la pausa guarda la posición exacta y un corte de luz pierde como mucho ~5 pasadas.

Límite que no se puede resolver por software: **sin el sensor del Nivel 2**, si cerrás la página con el telar *en marcha*, el conteo por reloj se detiene y la fila queda atrasada (la web te lo avisa al recuperar el trabajo). Con la pausa, no hay pérdida.

## Tercera pasada (hasta que no quedaron errores)

Repetí la revisión sobre el código ya corregido, esta vez ejecutando los controladores con una base simulada. Errores adicionales encontrados y corregidos:

| Problema | Corrección |
|---|---|
| Nivel 2: si la descarga del dibujo fallaba al arrancar (sin red al backend), la primera consulta "detectaba un cambio de dibujo" y lo bajaba **desde la fila 0**, perdiendo el trabajo a medias. | El nodo **siempre** adopta la posición y el conteo del backend (una producción nueva nace en 0, así que es equivalente). |
| Nivel 1 y 2: el socket HTTPS se reutilizaba aunque el servidor ya lo hubiera cerrado, lo que hace fallar el pedido siguiente. | Ante un error de conexión se cierra el socket TLS y el próximo pedido abre uno nuevo. |
| Web: con la sesión vencida el sondeo del telar seguía golpeando la API cada 4 s, y al volver a entrar no se reanudaba. | Se detiene al vencer la sesión y se reanuda al volver a entrar. |
| `middleware/auth.js` leía `SESSION_SECRET` al importarse, antes de que `server.js` cargara el `.env`. | Carga el `.env` por su cuenta. |
| Diagrama y documentos que todavía decían "seis" lectores/SSR y "3 salidas". | Corregidos a cuatro (documentos, SVG, simulaciones). |

## Cuarta pasada

Ejecuté la lógica de la web (antes solo la había releído) y volví a mirar el firmware con ojo de concurrencia. Encontré y corregí:

| Problema | Corrección |
|---|---|
| Nivel 2: `noInterrupts()` en el ESP32 solo frena las interrupciones **del núcleo que lo llama**. Con la red en el núcleo 0 y la interrupción del sensor en el núcleo 1, un `contador++` de la interrupción podía cruzarse con un `contador = valor` de la red y perder una actualización (conteo corrido). | Spinlock entre núcleos (`portENTER_CRITICAL`, y `_ISR` dentro de la interrupción). |
| Nivel 2: un aviso de retroceso que el telar nunca llegó a ejecutar (el relé no actuó) quedaba esperando y **descontaba una pasada de un pulso horas después**. | Caduca a los 30 s y se descarta al arrancar el tejido. Probado con reloj simulado. |
| Migración 012: si la creación del índice único fallaba por datos previos, se revertía **toda** la migración y el backend (que ya usa esas columnas) dejaba de andar. | Índice único movido a la migración 013, aparte. |
| Web: con el sensor mandando, la fila del sensor se marcaba sobre el dibujo abierto en el editor aunque fuera **otro** dibujo. | Solo se sincroniza si el dibujo abierto es el que está tejiendo el telar. |
| README sin las variables nuevas (`SESSION_SECRET`, `ESP32_DEVICE_KEY`...) ni las migraciones nuevas. | Actualizado. |

Resultado de la última pasada: sin errores pendientes en lo que se pudo verificar sin hardware.

## Documentación corregida a cuatro bobinas

| Archivo | Qué cambié |
|---|---|
| `Conexionado_Nivel2.docx` | cuatro juegos de relé, cuatro pines de salida (18, 19, 21 y 22; el 23 y el 4 quedan libres, como en `config_nivel2.h`), tabla "Bobinas de selección instaladas: 4", "las 4 instaladas", "comprar las cuatro" |
| `Guia_Bloques_C_y_D.docx` | cuatro relés PhotoMOS, cuatro resistencias de 330 Ω, "los tres restantes", pines 18/19/21/22, cuatro GPIO |
| `Estado_Completo_del_Proyecto.docx` | bobinas: cuatro; cuatro unidades de PhotoMOS; "con cuatro canales"; "las tres restantes" |
| `Documentación_de_Proyecto.docx` (las dos copias) | "4 bobinas" (3 lugares) y "con 4 canales" |
| `Arbol de problemas y soluciones.docx` | "con cuatro canales" |
| `Estimacion_Costos_Ganancia_Contrato_v4.docx` | "Módulo de relés (3 canales: uno de 2 y uno individual)" (decía 6 canales, que no coincide con el Bloque A) |
| `Lista_de_componentes_Control_Trama.xlsx` | dos notas que decían "6" (las cantidades y los precios ya eran 4: no cambió el presupuesto) |
| `diagrama_nivel2_marcos.svg/.png` (3 copias) | cuatro bobinas (antes 3), PhotoMOS en vez de SSR, 5 conmutaciones por segundo (300 pasadas/min) en vez de ~3, y lo pendiente de medir |

Los Word se editaron sin tocar formato; pasan la validación salvo por errores de marcas de comentarios que ya traía el original.

Otros ajustes de esta pasada: el historial (`GET /api/historial` y `/telares/:id/historial`) ahora devuelve `pasadas_conteo` y `origen_conteo`: con el sensor instalado, `pasadas_totales` es solo la estimación por reloj y mostrarla como cifra de la producción habría sido engañoso. Y corregí un comentario desactualizado del Nivel 2.

## Quinta pasada

- **Web:** faltaba el botón para validar el conteo del sensor (el endpoint existía pero nadie podía usarlo). Ahora, con el sensor reportando, aparece "Conteo del sensor sin validar" con un botón **Validar**, y pasa a "validado" al confirmar. Probado con la web ejecutada sin navegador.
- **Nuevo `PUESTA_EN_MARCHA.md`:** cómo cargar `SESSION_SECRET` y `ESP32_DEVICE_KEY`, cómo medir con osciloscopio, cómo validar el conteo y una lista de primera puesta en marcha en el C 401.
- **Máquina de destino:** el hardware se instala en el **C 401 (cuatro bobinas)**; el código y los `.md` ya lo dicen así. Los `.docx` siguen describiendo al telar relevado como C 201 (propósito, placa de datos): habría que decidir si se reescribe el propósito del proyecto en función del C 401.

## Los dos huecos de concepto

**1. Saber si la máquina realmente arrancó / se frenó.** Se implementó tu idea: el sensor como detector de parada. Si con el telar en "tejiendo" no llegan pulsos, el Nivel 2 apaga los canales y avisa (`evento-fisico` `sin_senal`); la web pasa a "Pausado: sin señal del sensor", muestra una alerta y queda un registro en el log de errores. Como el Nivel 1 ve el cambio de estado, pulsa Pausa: ante una parada inesperada el sistema termina con la máquina detenida. Sin el Nivel 2 instalado, la web ahora dice "Tejiendo (sin confirmar por sensor)", porque solo sensa botones, no el estado de la máquina.

**2. Instante de lectura de la selección.** Hay que medirlo con osciloscopio (pulso del sensor → ventana del lector óptico). Se agregaron los dos ajustes que ese resultado puede pedir: `DESPLAZAMIENTO_FILAS = 1` aplica en el pulso N la fila N+1 (ya existía), y `RETARDO_APLICACION_US` espera unos microsegundos entre el pulso y la aplicación. Ambos en 0 hasta medir.

## Para confirmar / hacer antes de desplegar

1. **Bobinas: 4 (confirmado).** Todo quedó en cuatro: firmware, base, backend, documentos de texto, planillas, simulaciones y diagrama. Lo único que sigue diciendo seis a propósito son los registros históricos de lo que se dijo en cada fecha (Bitácora y Registro de Entrevistas, p. ej. la reunión del 06/09 donde se anotó "son seis"), y las 6 resistencias de polarización del Bloque A (3 de relés + 3 de sensado), que son otra cosa. Los `.docx` siguen nombrando al telar relevado como Vamatex C 201 y el firmware/la lista de componentes hablan de un C 401: si el telar de destino es otro, conviene unificar el nombre del modelo.
2. **Variables en Render, ANTES de desplegar:** `SESSION_SECRET` y `ESP32_DEVICE_KEY` (y `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`). Sin `ESP32_DEVICE_KEY` los ESP32 reciben 401. Después, poner el mismo valor en `DEVICE_KEY` de los dos `config`.
3. **Sesión en el navegador:** si ya había usuarios registrados, deberían poder entrar como siempre (huella o código); el registro nuevo ahora pide invitación desde el 4.º usuario.
4. **HTTPS del ESP32:** sin `API_CA_CERT` cifra pero no verifica el servidor. Conviene pegar el certificado raíz del dominio.
5. Render en capa gratuita se "duerme": la primera consulta puede tardar decenas de segundos y el ESP32 la trata como fallo (no acciona nada).
6. Probar en una base de prueba las migraciones 009, 012 y 013 antes que en Neon.

## Sexta pasada: modo invitado, base completa y ajustes visuales

**"Continuar sin iniciar sesión" volvió, con permisos limitados.** La revisión anterior lo
había quitado porque, con la API protegida, el invitado solo veía errores 401. Ahora el
servidor le emite una **sesión de invitado** (`POST /api/auth/invitado`): puede recorrer la
aplicación, ver la biblioteca y las estadísticas y diseñar dibujos, pero **no comandar el
telar**. Las diez acciones que mueven la máquina (marcha, pausa, avanzar, retroceder,
asignar, detener, validar el conteo...) y generar invitaciones pasan por `requerirOperario`,
que al invitado le responde 403 `SOLO_OPERARIO`. La web muestra el aviso y lo deja adentro,
sin mandarlo al ingreso. La sesión se reconoce al recargar. El nombre de usuario "invitado"
queda reservado, y una sesión de invitado nunca cuenta como dueña de una cuenta para sumar
huellas. Pruebas en `tests/invitado.test.mjs`.

**`database/01_base_de_datos_completa.sql` estaba desactualizado:** era una versión vieja
del script, con una nota sobre las migraciones 012 y 013 pero sin el contenido de varias
migraciones (por ejemplo, no creaba `metros_por_pasada`). Se regeneró desde `schema.sql` más
las trece migraciones, y registra al final las migraciones aplicadas. Verificado contra
PostgreSQL real: la base armada con el script y la armada con `init-db` + `migrate` quedan
idénticas (80 columnas, 29 restricciones, 21 índices). Si se agrega una migración nueva, el
script hay que regenerarlo.

**Ajustes visuales:** el selector del color del hilo mostraba un recuadro blanco en modo
oscuro; el botón Guardar de la ficha del dibujo usaba una clase que no existe en la app; el
botón principal en modo oscuro conservaba un texto bordó de la paleta vieja. Además, cada
tarjeta de la biblioteca tiene ahora un botón **Estadísticas** que despliega el resumen de
producción del dibujo.

## Séptima pasada: revisión completa y preparación del despliegue

- **Reproducir como invitado disparaba un bucle.** El rechazo de asignar el dibujo se registraba
  pero la animación arrancaba igual: cada medio segundo pedía avanzar, era rechazado, mostraba el
  aviso y guardaba un error en la base. Ahora ▶ le responde al invitado con un aviso único, sin
  ninguna llamada, haya o no un telar cargado.
- **El registro de errores aceptaba escrituras de invitados** (`requerirOperarioODispositivo`
  en `POST /api/errores`), y la web ya no las intenta.
- **En una base vacía, el invitado veía el aviso de "no podés controlar el telar" sin tocar
  nada**, porque la web intentaba dar de alta el telar. Ahora no lo intenta.
- **`TELAR_ID`**: la guía daba por hecho que era 8. La web usa el primer telar ordenado por
  código, así que se reemplazó por una verificación.
- `engines` en `package.json`, para que Render no elija otra versión de Node.
- Probada la migración 013 con dos producciones abiertas en el mismo telar: cierra la más vieja
  como detenida, sin borrar nada, y crea el índice.
- Nuevo `DESPLIEGUE_RENDER.md` con el paso a paso.

## Revisión de la aplicación: pantallas, botones y buscador

Se recorrieron las tres pantallas como operario y como invitado, en claro y oscuro, en escritorio
y celular, y se ejecutaron los cien manejadores de clic distintos de la página contra una base real.

- **Una variable de estilo inexistente** (`--panel`, copiada de la documentación web): los campos de la
  ficha y de las repeticiones quedaban sin fondo definido. Ahora usan `--bg`.
- **El buscador de la biblioteca usaba `onkeyup`**: al pegar texto, con el autocompletado del teclado del
  celular o al dictar, no filtraba. Pasó a `oninput`. Además ignora tildes y mayúsculas ("tafetan"
  encuentra "Tafetán"), muestra un aviso cuando no hay coincidencias en vez de dejar la lista en blanco,
  y se vuelve a aplicar si la lista se redibuja.
- **`filterByTag` era código muerto** que solo mostraba un aviso: eliminada.
- **El simulador de color** no se cerraba tocando el fondo ni con Escape, y quedaba abierto si se cambiaba
  de pantalla. El primer intento de enganchar el cierre corría antes de que la ventana existiera en la
  página, lo que habría roto el resto del script; se resolvió escuchando en el documento.
- **`tapCell` aceptaba coordenadas fuera de la grilla.** Un toque de una grilla vieja estiraba la fila y
  desde ahí cada guardado era rechazado por el backend. Ahora se ignoran, y al guardar la matriz se ajusta
  siempre a filas × columnas declaradas.

## Robustez de la aplicación: datos malformados, inyección, red y ficha PDF

- **Datos malformados devolvían error 500.** Se mandaron 3.481 pedidos con datos inválidos a todas las
  rutas: 1.110 terminaban en 500 porque un id no numérico o fuera de rango llegaba crudo a PostgreSQL.
  Ahora los ids se validan en la entrada de cada ruta (`router.param`) y los errores de datos de la base
  (formato, rango, largo, obligatorio, restricciones) se responden como 400 con un mensaje propio, sin
  exponer el texto interno de la base. Resultado: cero errores 500.
- **Inyección de código:** se guardaron nombres de dibujo, de telar y de usuario con HTML y código. En
  ninguna pantalla se ejecuta: se muestran como texto.
- **Doble clic en Guardar:** tres toques seguidos crean un solo dibujo.
- **Ficha PDF:** decía "cada celda indica el número de pasadas del hilo", el modelo viejo. No incluía las
  repeticiones de cada fila, así que un dibujo con 100 pasadas en una fila salía como si fuera una. Las
  celdas activas sin color asignado salían en blanco, y en dibujos grandes (donde no se imprime el número)
  el patrón quedaba invisible. El nombre del archivo usaba el del dibujo tal cual, y "Sarga 2/2" tiene una
  barra. Ahora incluye repeticiones y total por vuelta, instrucciones correctas, celdas en azul y un nombre
  de archivo válido.
- **Sin conexión o con Render despertando** se mostraba "Failed to fetch" o "Error (502)". Ahora dice qué
  pasa y qué hacer, en el ingreso y dentro de la aplicación.

## Validación del HTML, accesibilidad, temporizadores y cabeceras

- **HTML inválido:** las dos tarjetas de Inicio tenían `<div>` dentro de `<button>`, lo que el estándar
  no permite. Pasaron a `<span>` con un estilo de especificidad mínima; se verificó que se ven idénticas
  al píxel. Además, 53 botones sin `type="button"`, un campo sin tipo y dos botones de solo ícono sin nombre
  accesible. El HTML valida sin errores con html-validate.
- **Accesibilidad (axe-core, WCAG 2 A y AA):** tres problemas, corregidos. El gris de texto secundario
  daba 4,06:1 en el tema claro y 3,9:1 en el oscuro, debajo del mínimo de 4,5:1. En el tema oscuro, el texto
  sobre el color de acento (botones "Aplicar" y "Nuevo") daba 1,88:1, casi ilegible: se definió un color de
  texto oscuro para ese caso. La página bloqueaba el zoom en el celular (`user-scalable=no`), lo que impide
  agrandar a quien tenga la vista cansada; se habilitó, evitando que un doble toque sobre las celdas amplíe.
  Los campos de filas y columnas no tenían etiqueta. Resultado: cero problemas en el ingreso y las tres
  pantallas, en los dos temas.
- **Temporizadores:** ir y volver del editor quince veces no multiplica las consultas de estado (siguen
  siendo tres cada doce segundos, y ninguna fuera del editor).
- **Cabeceras de seguridad:** completas (CSP, HSTS, nosniff, marco, referrer); la cookie de sesión es
  HttpOnly y SameSite.

## Relé verificado contra la hoja de datos y dependencias actualizadas

- **LCA110 contra la hoja de datos oficial (IXYS, DS-LCA110-R12):** el conexionado de patas documentado es
  correcto (1 y 2 el LED, 4 y 6 la carga, 3 sin conexión y 5 «no usar» en la configuración para alterna y
  continua). El LED se activa con 2 mA como máximo: con 330 Ω desde 3,3 V recibe unos 6,4 mA. Conduce con
  23 Ω típicos y 35 Ω máximos, fuga como máximo 1 µA y conmuta en 3 ms como máximo. Se actualizó la
  referencia bibliográfica con la revisión y el año de la hoja de datos.
- **Dependencias:** `npm audit` encontró cinco vulnerabilidades conocidas (una alta, en `ip-address`, que usa
  el limitador de peticiones). Como el proyecto fija versiones con `package-lock.json`, Render las habría
  instalado. Se corrigieron con actualizaciones de parche, sin cambiar ningún rango de `package.json`:
  express 4.22.3, body-parser 1.20.8, qs 6.16.0, morgan 1.12.1, ip-address 10.7.2. Resultado: cero
  vulnerabilidades, y todas las pruebas y el límite por operario siguen funcionando.

## Login con huella probado de punta a punta, e invitaciones

- **Huella:** con el autenticador virtual de Chrome (que simula el sensor del teléfono) se recorrió el registro,
  el código de recuperación, el cierre de sesión, el reingreso con la huella, un usuario inexistente, un código
  de recuperación falso, un nombre duplicado y el nombre reservado "invitado". Todo funciona.
- **Faltaba el botón para generar invitaciones.** El servidor las generaba, pero ningún botón de la aplicación lo
  hacía: con tres usuarios registrados, nadie más podía crear una cuenta, y el manual pedía un código que no había
  forma de obtener. Se agregó **Invitar a alguien (generar código)** en Inicio, visible solo para usuarios
  registrados, con el código destacado y la opción de copiarlo. Se probó el ciclo completo: el cuarto usuario sin
  código es rechazado, con el código entra, el mismo código no sirve dos veces, uno falso se rechaza y un invitado
  no puede generarlos. El manual explica ahora dónde se genera.
- **Mensajes:** el cuarto usuario sin código recibe una explicación de cómo conseguirlo, y un invitado que intenta
  invitar ya no recibe el mensaje de "controlar el telar".

## Guardados en fila y edición simultánea

- **Los guardados automáticos no iban en fila.** La web guarda en cada toque, y dos toques rápidos mandaban dos
  pedidos a la vez que podían llegar al servidor en desorden: el viejo pisaba al nuevo y se perdía un cambio, aun
  con una sola persona usando la aplicación. Ahora, si hay un guardado en curso, se espera y se manda uno solo con
  el estado más reciente. Veinte toques seguidos generan dos pedidos, y el servidor queda idéntico a la pantalla.
- **Dos personas editando el mismo dibujo:** gana el último que guardaba y el cambio del otro se perdía sin aviso.
  Ahora la web manda la fecha de modificación que conoce (`version_esperada`); si no coincide con la del servidor,
  se responde 409 `DIBUJO_MODIFICADO`, se carga la versión más reciente y se avisa. El campo es opcional: un pedido
  sin él se comporta como antes. Guardar los metros por pasada también cambia esa fecha, así que la web toma la
  versión nueva para no dar un falso conflicto en el próximo toque.
- **El botón Guardar decía "ya existe un dibujo con ese nombre" ante cualquier 409**, incluso cuando el motivo era
  que el dibujo se estaba tejiendo. Ahora distingue los tres casos.
- **Probado además:** recuperación de la cuenta desde la pantalla, activación de la huella en un celular nuevo y
  posterior ingreso con ella, "Ver mi código de recuperación", sesión vencida en uso, y la cadena del Nivel 2 con
  repeticiones contra el servidor real (incluido el reinicio del nodo, que retoma en la pasada exacta, y el
  retroceso desde la botonera).
