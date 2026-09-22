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
| 7 | **Modelo confirmado: una fila = una pasada; para repetir una pasada se dibuja la fila dos veces.** `utils/posicion.js` se simplificó: `avanzar` y `retroceder` son espejos exactos (una prueba lo verifica), sin repeticiones por celda. Retroceder desde la fila 0 va a la última (el dibujo es un lazo) y descuenta una vuelta si cruza el inicio. El comentario "retrocedió una pasada" ahora es cierto. `pasada_actual`/`columna_actual` quedan en 0 por compatibilidad. |
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
