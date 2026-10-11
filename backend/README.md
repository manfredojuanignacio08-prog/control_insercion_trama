# Backend, Control de Inserción de Trama

Backend en **Node.js + Express + PostgreSQL** para el sistema de control de inserción
de trama. Implementa la Fase 1 y 2 del plan (ver `Analisis_Frontend_y_Plan_Backend.md`):
biblioteca de patrones, telares (esquema multi-telar) e historial de producción.

> ✅ Este scaffold fue probado de punta a punta (17 casos: CRUD, transacciones,
> validaciones, restricciones de FK, trigger de `modificado_at`) contra un
> PostgreSQL real antes de entregarlo.

## 1. Instalación

```bash
npm install
cp .env.example .env
# editá .env con los datos de tu PostgreSQL (local o de un proveedor)
```

## 2. Crear el esquema en la base

Con la base ya creada en Postgres (`CREATE DATABASE control_trama;`) y el `.env` configurado:

```bash
npm run init-db
```

Esto ejecuta `backend/src/db/schema.sql`: crea las tablas del telar (`patrones`, `telares`,
`historial_produccion`, `errores_log`), las del ingreso (`usuarios`, `credenciales_biometricas`,
`desafios_webauthn`, `invitaciones`), los índices y el trigger de `modificado_at`. Es seguro
correrlo de nuevo: usa `CREATE TABLE IF NOT EXISTS`. Las migraciones (`npm run migrate`) las
aplica además el servidor solo al arrancar.

## 3. Levantar el servidor

```bash
npm run dev      # con autoreload (node --watch)
npm start        # modo normal
```

Por defecto en `http://localhost:3000`. El backend expone la **API REST** y
además **sirve la página web** desde `public/`, esa web (diseñada para el
celular) es la interfaz de uso real del proyecto y ya está conectada a esta
misma API. Al abrir `http://localhost:3000` en el navegador, la web carga
completa.

## 4. Despliegue en un servidor real

El backend ya incluye lo necesario para correr en producción: cabeceras de
seguridad (`helmet`, con CSP ajustado para no romper el `<script>` inline
de la página web; HSTS solo cuando la conexión es HTTPS, así la web también funciona por
`http://` en la red local), compresión `gzip`, *rate limiting* por usuario (por IP antes de iniciar sesión), CORS configurable,
logs en formato `combined` cuando `NODE_ENV=production`, validación estricta
de los datos que llegan, y apagado prolijo (cierra el pool de Postgres antes
de salir cuando el proceso recibe `SIGTERM`/`SIGINT`).

### Opción A, Docker (recomendado, todo incluido)

```bash
docker compose up -d --build
```

Esto levanta PostgreSQL y la API juntos, corre `init-db` y las migraciones automáticamente y
deja todo escuchando en `http://localhost:3000`. Antes, crear `backend/.env` con
`POSTGRES_PASSWORD`, `SESSION_SECRET`, `RECOVERY_SECRET` y `ESP32_DEVICE_KEY`: el
`docker-compose.yml` no trae claves por defecto y, si falta alguna, se niega a arrancar y dice cuál.

### Opción B, PM2 en un servidor propio (VPS, on-premise en planta)

```bash
npm install --omit=dev
npm run init-db
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### Nginx como reverse proxy (HTTPS, dominio propio)

Si lo exponés con un dominio, lo normal es poner Nginx delante y certificados
con Let's Encrypt. Ejemplo mínimo de `server` block:

```nginx
server {
    listen 80;
    server_name control-trama.miempresa.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Si usás un reverse proxy como este, poné `TRUST_PROXY=true` en el `.env` del
backend para que el rate limiting y los logs tomen la IP real del cliente
en vez de la del proxy.

### Variables de entorno importantes en producción

| Variable | Para qué sirve |
|---|---|
| `NODE_ENV=production` | Logs en formato `combined`, optimizaciones de Express |
| `PGSSL=true` | **Dejarla siempre con Neon.** Cifra la conexión y verifica el certificado del servidor. Si `DATABASE_URL` trae `?sslmode=...`, la librería `pg` usa eso (la URL manda): para Neon, `?sslmode=verify-full` |
| `PGSSL_VERIFICAR=false` | Solo como salida de emergencia, para una base con certificado propio que no se pueda verificar: cifra sin comprobar con quién habla. Con Neon no hace falta |
| `SESSION_SECRET` | **Obligatoria.** Firma las cookies de sesión (mínimo 32 caracteres). En producción sin ella el servidor no arranca; en desarrollo se usa clave temporal y las sesiones se pierden en cada reinicio |
| `RECOVERY_SECRET` | **Obligatoria en producción.** Cifra los códigos de recuperación en la base (mínimo 16 caracteres). Si cambia, los códigos viejos dejan de leerse: rotarlos con `npm run codigo -- <usuario> --rotar` (los dos guiones hacen falta: sin ellos npm se queda con `--rotar` y el código no se rota) |
| `ESP32_DEVICE_KEY` | **Obligatoria.** Clave que manda el ESP32 en `X-Device-Key` (la misma que `DEVICE_KEY` en `esp32/control_trama_esp32/config.h`). Sin ella el ESP32 recibe 401 |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | Dominio real para el login por huella (requiere HTTPS) |
| `REGISTRO_LIBRE_MAX` | Usuarios que se registran libres (defecto 3); después hace falta invitación |
| `CORS_ORIGIN` | Dominios que pueden llamar a la API desde otro origen. Vacío en producción = ninguno (la web se sirve desde el mismo servidor y no lo necesita) |
| `TRUST_PROXY` | Poner en `true` si hay Nginx/load balancer delante (en Render se activa solo) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Límite de pedidos por usuario (por IP para quien no inició sesión o entra como invitado): en la fábrica todos salen por la misma IP, y un límite por IP haría que un operario bloquee a los demás |

## 5. Endpoints

### Patrones (biblioteca)
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/patrones?buscar=texto` | sin cuerpo | Lista (filtra por nombre, ILIKE) |
| GET | `/api/patrones/:id` | sin cuerpo | Detalle |
| POST | `/api/patrones` | `{nombre, filas, columnas, matriz_pasadas, repeticiones_por_fila?, grupos_intercalados?, matriz_ligamento?, colores_filas?, metadata?}` | Crea. Si no mandás `matriz_ligamento`, se deriva automáticamente (`pasadas>0 → 1`). Cada fila de `matriz_pasadas` puede tener **una sola** bobina activa (una trama por pasada): con dos responde **400**. Para alternar bobinas está `grupos_intercalados` (opcional): `[{desde, hasta, pasadas}]` con índices de fila desde 0; las filas del grupo se recorren en orden, cada una sus repeticiones, hasta completar `pasadas`. Los grupos no se superponen, tienen al menos dos filas y una vuelta de hasta 32 pasadas |
| PUT | `/api/patrones/:id` | igual que POST, más `version_esperada?` | Reemplaza el patrón. Si se manda `version_esperada` (el `modificado_at` que tenía la pantalla) y otra persona lo guardó después, responde **409** `DIBUJO_MODIFICADO` en vez de pisar sus cambios |
| DELETE | `/api/patrones/:id` | sin cuerpo | Borra (falla con 409 si tiene historial asociado) |
| PUT | `/api/patrones/:id/metros-por-pasada` | `{metros_por_pasada}` (número mayor que 0 y hasta 1, o `null`) | Cuánto avanza la tela por pasada: con este dato las estadísticas pasan pasadas a metros. `null` lo deja sin definir |
| PUT | `/api/patrones/:id/hilado` | `{peso_kg, metros_max, reiniciar}` (números mayores que 0 o `null`; `reiniciar` true/false) | Hilado disponible: peso en kg y metros de tela que alcanza a tejer. Las estadísticas devuelven `hilado` con lo usado, lo restante y los metros que faltan, contados desde que se cargó (`reiniciar: true` = hilado nuevo, vuelve a contar desde cero). Los dos en `null` borran el dato |
| GET | `/api/patrones/:id/estadisticas` | sin cuerpo | Producción acumulada del dibujo: veces tejido, pasadas, vueltas, horas de máquina, primera y última vez, y metros si tiene `metros_por_pasada`. Indica si el conteo es estimado o del sensor (`precision_conteo`) |

Una sesión de **invitado** puede crear dibujos y cambiar o borrar solo los que creó como invitado; en los de los operarios, `PUT`, `DELETE`, `metros-por-pasada` e `hilado` responden **403** `SOLO_OPERARIO`. Cuando un operario guarda un dibujo hecho por un invitado, pasa a ser de los operarios.

`GET /api/patrones` y `GET /api/historial` aceptan `limit` (defecto 500 / 100) y `offset`. `PUT /api/patrones/:id` responde **409** (`codigo: PATRON_EN_PRODUCCION`) si se intenta cambiar la matriz o las dimensiones de un dibujo que se está tejiendo (producción abierta): hay que detener el trabajo primero. Nombre, colores y metadatos sí se pueden editar.

### Telares
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/telares` | sin cuerpo | Lista con nombre del patrón actual |
| GET | `/api/telares/:id` | sin cuerpo | Detalle. Con la clave de dispositivo, `?origen=esp32` (Nivel 1) renueva `ultimo_ping_esp32` y `?origen=nivel2` renueva `ultimo_reporte_sensor` (el nodo del Nivel 2 conectado lleva la posición). Incluye `segundos_desde_ping` (calculado con el reloj del servidor: la web lo usa para el indicador "ESP32 conectado" sin depender de la hora de la PC) |
| POST | `/api/telares` | `{codigo, nombre?}` | Crea un telar nuevo |
| POST | `/api/telares/:id/asignar-patron` | `{patron_id, reiniciar?}` | Asigna patrón y abre una producción nueva en la fila 0. Si el telar **ya tiene abierta una producción de ese mismo dibujo**, la **reanuda** (`200`, `reanudado: true`) en vez de reiniciarla, salvo que se mande `reiniciar: true`. Si tenía una de otro dibujo, la cierra como `detenido_manual` |
| POST | `/api/telares/:id/detener` | `{pasadas_totales?, alertas_disparadas?}` | Cierra la producción en curso (409 si no había ninguna). Si no se manda `pasadas_totales`, conserva el contador ya acumulado por `/avanzar` |
| POST | `/api/telares/:id/pausar` | sin cuerpo | Pausa sin cerrar nada: deja la producción abierta y el dibujo asignado, y el telar pasa a `pausado` (el ESP32 pulsa Pausa). Si no hay ninguna producción abierta (telar apagado, o arrancado a mano con Marcha sin trabajo) queda `apagado`: no hay nada que retomar |
| POST | `/api/telares/:id/reanudar` | sin cuerpo | Vuelve a `tejiendo` en la misma posición. **409** si no hay una producción en curso: en ese caso corresponde asignar el dibujo |
| POST | `/api/telares/:id/avanzar` | `{pasos?, cliente?}` (`pasos` de 1 a 10000, default 1) | Avanza N pasadas **por reloj** (lo llama la web en cada paso de su animación; **es una estimación**). Cada fila se teje tantas pasadas como diga `repeticiones_por_fila`; al terminar el dibujo vuelve a la fila 0 (suma a `vueltas_completadas`). Si el nodo del Nivel 2 está conectado, o la producción ya tiene pasadas medidas por el sensor, responde **409 `SENSOR_ACTIVO`** y no toca nada: la posición y el conteo los lleva el sensor. `cliente` identifica la pestaña: si otra pestaña avanzó ese telar hace menos de 1,5 s responde **409 `OTRO_CONDUCTOR`** y la web pasa a solo mostrar la posición (así dos pestañas abiertas no cuentan el doble). Si el telar no está `tejiendo` responde **409 `TELAR_NO_TEJIENDO`** (con `estado`, `motivo_pausa` y la posición) y, sin trabajo abierto, **409 `SIN_TRABAJO`**: la web deja de avanzar |
| POST | `/api/telares/:id/retroceder` | `{pasos?}` (de 1 a 10000, default 1) | Espejo exacto de `/avanzar`: deshace N pasadas (si la fila tiene repeticiones, primero descuenta las de esa fila). Desde la fila 0 vuelve a la última (el dibujo es un lazo; `al_inicio: true`). Descuenta la pasada del conteo |
| POST | `/api/telares/:id/retroceder-fisico` | sin cuerpo | Pulsa el relé del botón **físico** Retroceder del telar (mueve la máquina de verdad). No confundir con `/retroceder`, que solo mueve el cursor del patrón en la web. Incrementa `retroceder_seq` (orden para el Nivel 1: el ESP32 detecta el cambio al sondear y da el pulso) y `retrocesos_contados` (hecho, que lee el Nivel 2) |
| POST | `/api/telares/:id/evento-fisico` | `{tipo: 'marcha'\|'pausa'\|'retroceder'\|'sin_senal'\|'reinicio'}` | **Solo con clave de dispositivo.** Lo llama el ESP32 cuando **sensa** (no acciona) algo en la máquina. Actualiza el estado real: `marcha`→`tejiendo`, `pausa`→`pausado` (o `apagado` si no hay trabajo abierto, igual que `/pausar`), `retroceder`→ una pasada atrás (si el sensor del Nivel 2 lleva la posición, solo suma a `retrocesos_contados`: el nodo descuenta la pasada y la informa en su próximo reporte; moverla también acá la restaría dos veces), `sin_senal` (el sensor dejó de recibir pulsos con el telar en marcha)→`pausado` con `motivo_pausa='sin_senal'` y un registro en el log de errores. `reinicio` (el ESP32 arrancó en frío: corte de luz o traslado)→ si figuraba `tejiendo`, pasa a `pausado` con `motivo_pausa='reinicio'` **conservando producción, dibujo y posición**, y marca la posición como incierta. Sin esto, alguien podía arrancar el telar a mano y la web seguía mostrando "detenido" |
| POST | `/api/telares/:id/confirmar-posicion` | `{visto_hasta?}` | El operario ya revisó el telar y confirma la posición: limpia `posicion_incierta`. Si se manda `visto_hasta` (timestamp del evento que la web mostró) y llegó otro evento después, responde **409** en vez de tapar el aviso nuevo |
| POST | `/api/telares/:id/validar-conteo` | `{confirmo: true}` | El operario da por bueno el conteo del sensor tras compararlo con el contador mecánico del telar |
| GET | `/api/telares/:id/historial` | sin cuerpo | Historial de ese telar (`limit`, `offset`) |

### Nivel 2 (los usa el firmware con el sensor)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/telares/:id/patron-actual` | El dibujo asignado (matriz y repeticiones) y la posición de la producción en curso, para que el nodo retome donde quedó |
| POST | `/api/telares/:id/pasadas` | **Solo con clave de dispositivo.** `{pasadas_sensor, fila_actual, repeticion_en_fila}`: el conteo acumulado del sensor y la posición del nodo. Detalle en `src/nivel2/README.md` |

### Historial global y errores
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/historial?telar_id=&desde=&hasta=` | Dashboard / consulta global |
| GET | `/api/errores?telar_id=&limit=` | Lista de errores (reemplaza el `localStorage telar_errors`) |
| POST | `/api/errores` | `{telar_id?, titulo, mensaje?, codigo?}` |
| GET | `/api/health` | Chequeo de salud |

## 6. Estructura

```
src/
├── server.js              Punto de entrada Express
├── db.js                  Pool de conexión a PostgreSQL
├── db/
│   ├── schema.sql                              DDL completo
│   ├── init.js                                  Script que ejecuta el schema.sql
│   ├── migracion_001_matriz_ligamento.sql       Migración: agrega matriz_ligamento
│   ├── migracion_002_repeticiones_y_posicion.sql Migración: agrega fila_actual, columna_actual, pasada_actual, vueltas_completadas
│   ├── migracion_003_login_biometrico.sql       Migración: tablas de credenciales y desafíos WebAuthn
│   ├── migracion_004_recupero_usuarios.sql      Migración: recuperación de cuenta e invitaciones
│   ├── migracion_005_codigo_recuperacion_fijo.sql Migración: código de recuperación fijo por usuario
│   ├── migracion_006_ping_esp32.sql             Migración: ultimo_ping_esp32 (heartbeat del ESP32)
│   ├── migracion_007_retroceder_fisico.sql      Migración: retroceder_seq (botón físico Retroceder)
│   ├── migracion_008_evento_fisico.sql          Migración: posicion_incierta + ultimo_evento_manual (sensado de los botones)
│   ├── migracion_009_rango_dimensiones.sql  Migración: acotó filas y columnas al rango de 2 a 32 (la 014 lo reemplazó, y la 017 amplió las filas).
│   ├── migracion_010_elementos_seleccion.sql  Migración: guarda cuántos elementos de selección (bobinas) tiene cada telar, para avisar cuando un dibujo tiene más columnas de las que la máquina puede accionar. Documenta además que `columna_actual` es vestigial y queda siempre en cero.
│   ├── migracion_011_metros_por_pasada.sql  Migración: guarda cuántos metros avanza la tela en una pasada, para convertir el conteo en metros reales y calcular estadísticas de producción.
│   ├── migracion_012_conteo_sensor_y_retrocesos.sql  Migración: separa el conteo estimado del medido por el sensor (`pasadas_sensor`, `conteo_validado`), agrega `retrocesos_contados`, `ultimo_reporte_sensor` y `motivo_pausa`.
│   ├── migracion_013_indice_unico_en_curso.sql  Migración: una sola producción `en_curso` por telar (índice único).
│   ├── migracion_014_repeticiones_por_fila.sql  Migración: agrega las repeticiones de cada fila y fija los rangos de 1 a 100 filas y de 1 a 8 columnas.
│   ├── migracion_015_repeticion_en_fila.sql  Migración: guarda cuántas pasadas de la fila actual ya se tejieron.
│   ├── migracion_016_recovery_cifrado.sql  Migración: documenta el cifrado del código de recuperación (sin cambios de esquema).
│   ├── migracion_017_filas_hasta_300.sql  Migración: el máximo de filas de un dibujo pasa de 100 a 300.
│   ├── migracion_018_senal_nivel2.sql  Migración: solo actualiza la descripción de `ultimo_reporte_sensor`, que ahora también renueva la consulta periódica del nodo del Nivel 2.
│   ├── migracion_019_dibujos_de_invitado.sql  Migración: marca los dibujos creados por un invitado (`creado_por_invitado`): el invitado solo puede cambiar o borrar esos. Índice para buscar el usuario sin distinguir mayúsculas.
│   ├── migracion_020_hilado.sql  Migración: hilado del dibujo (`hilado_peso_kg`, `hilado_metros_max`, `hilado_pasadas_base`) para la ficha y el PDF.
│   ├── migracion_021_secuencias_por_fila.sql  Migración: primera versión de los intercalados (el orden dentro de una fila); la reemplaza la 022.
│   ├── migracion_022_grupos_intercalados.sql  Migración: intercalados por grupos de filas (`grupos_intercalados`) y borra `secuencias_por_fila`.
│   ├── migrator.js                               Aplica cada migración UNA vez (tabla migraciones_aplicadas)
│   └── migrate.js                                Corre las migraciones pendientes (npm run migrate)
├── scripts/
│   ├── codigo_recuperacion.js   Muestra o rota el código de recuperación de un usuario (npm run codigo)
│   └── generar_base_completa.js Regenera database/01_base_de_datos_completa.sql (npm run generar-sql)
├── utils/
│   ├── ligamento.js        Deriva matriz_ligamento desde matriz_pasadas
│   ├── posicion.js         Lógica pura de avanzar/retroceder (espejo 1:1 de doTick()/rollback() del frontend)
│   └── validacion.js       Validación de patrones
├── middleware/errorHandler.js  Manejo centralizado de errores (404/400/409/500)
├── controllers/             Lógica de negocio por entidad
└── routes/                  Definición de rutas Express
```

## 7. Decisiones de diseño aplicadas (ver documento de análisis)

- `matriz_pasadas` (enteros) y `matriz_ligamento` (binario) son **campos separados**.
- **Una FILA es una COMBINACIÓN de bobinas**, que se teje tantas pasadas seguidas como indiquen sus repeticiones. En cada pasada, la fila del patrón define qué
  marcos suben: cada columna es una bobina/electroimán del dobby. Las
  columnas NO se recorren una por una, son simultáneas dentro de la misma
  pasada. Lo que avanza es la fila.
- La repetición es **de fila entera** y va en `repeticiones_por_fila` (migración 014): un
  número por fila, cuántas pasadas seguidas se teje esa fila antes de pasar a la
  siguiente. Las celdas de `matriz_pasadas` dicen si la bobina se activa (mayor que cero) o
  no; la web guarda solo ceros y unos.
- `historial_produccion.fila_actual` y `repeticion_en_fila` guardan la posición de la
  producción en curso (la fila y cuántas pasadas de esa fila ya se tejieron), y soportan
  "retroceder una pasada" sin reconstruir nada. `pasada_actual` queda siempre en 0.
  `columna_actual` se conserva por compatibilidad pero ya no marca posición:
  siempre vale 0. `vueltas_completadas` cuenta cuántas veces se
  tejió el patrón entero (no hay "final": es un bucle infinito, igual que
  un telar real, hasta que se detiene manualmente).
- Esquema **multi-telar desde el día 1**; el piloto puede arrancar con un solo
  registro en `telares` sin que eso implique ninguna migración después.
- **Autenticación**: ingreso con huella (WebAuthn), código de recuperación, invitaciones y
  modo invitado (ver "Seguridad de la API" más abajo y `AUTENTICACION_BIOMETRICA.md`).
- `asignar-patron`, `detener`, `avanzar` y `retroceder` corren dentro de una
  **transacción** con `FOR UPDATE` para evitar condiciones de carrera si dos
  requests llegan casi al mismo tiempo.

## 8. Pendientes / próximos pasos sugeridos

1. **Selector visual de telar/máquina**: hoy se usa automáticamente el único
   telar que existe (creado solo si no hay ninguno). El día que haya más de
   uno, agregar el selector en la web, la lógica de conexión
   (`asignar-patron`, `avanzar`, `retroceder`) ya está lista para trabajar
   con cualquier id de telar, no hay que tocar el backend para eso.
2. **Pantalla de historial de producción**: la base ya tiene los datos
   (`historial_produccion` con posición, vueltas completadas, etc.) pero no
   hay ninguna pantalla en la web que los muestre todavía.
3. Instalar el Nivel 2: el firmware ya reporta las pasadas medidas por el sensor inductivo
   (`POST /pasadas`, que se guardan en `pasadas_sensor`, aparte de la estimación por reloj) y
   la web deja de estimar mientras el sensor esté conectado. Falta el hardware y validar el
   conteo contra el contador mecánico (`PUESTA_EN_MARCHA.md`).

## Seguridad de la API

**Toda la API exige autenticación**, salvo `GET /api/health` y `/api/auth/*` (hay que poder entrar para tener sesión). Hay dos formas de autenticarse:

| Quién | Cómo | Qué puede |
|---|---|---|
| Operario (web) | Cookie de sesión firmada (`HttpOnly`, `SameSite=Lax`, `Secure` con HTTPS), que el servidor entrega tras el login por huella o con el código de recuperación | Todo lo de la web: dibujos, asignar/pausar/reanudar, avanzar, retroceder, historial |
| Invitado (web) | La misma cookie, marcada como invitado ("Continuar sin iniciar sesión") | Mirar todo y diseñar dibujos nuevos (cambiar o borrar solo los suyos). Comandar el telar, validar el conteo o invitar responde **403** `SOLO_OPERARIO` |
| Dispositivo (ESP32) | Header `X-Device-Key` con el valor de `ESP32_DEVICE_KEY` | Sondear `GET /telares/:id`, avisar `evento-fisico`, reportar `pasadas`, `POST /errores`, descargar `patron-actual` |

Sin ninguna de las dos, la API responde **401**. Las acciones de la web (asignar dibujo, pausar, etc.) las rechaza si vienen con clave de dispositivo, y los avisos del hardware (`evento-fisico`, `pasadas`) los rechaza si vienen de una sesión: una persona no puede falsear lo que "sensó" el telar.

Variables de entorno obligatorias en producción (ver `.env.example`): `DATABASE_URL` y `PGSSL=true` (con Neon), `SESSION_SECRET` (mínimo 32 caracteres), `RECOVERY_SECRET` (mínimo 16 caracteres), `ESP32_DEVICE_KEY` (la misma en `DEVICE_KEY` del firmware, `esp32/control_trama_esp32/config.h`), y `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` con el dominio real. El login por huella exige HTTPS (o `localhost`): por `http://192.168.x.x` el navegador lo bloquea, así que en la red local hay que servir por HTTPS o entrar con el código de recuperación.

Además: el registro es libre solo para los primeros `REGISTRO_LIBRE_MAX` usuarios (defecto 3); después hace falta un código de invitación. Sumar una huella a un usuario existente exige haber iniciado sesión como ese usuario. La recuperación con código tiene un límite estricto de intentos por IP (`AUTH_INTENTOS_MAX`, 20 cada 15 minutos); el ingreso con huella, uno amplio (`AUTH_HUELLA_MAX`, 300), porque no se puede adivinar y en la fábrica todos los celulares comparten la IP del router.

## Migraciones

Cada `db/migracion_NNN_*.sql` se aplica **una sola vez**, dentro de una transacción; el registro está en la tabla `migraciones_aplicadas`. Corre sola al arrancar el servidor o a mano con `npm run migrate`. Si una falla, queda un error visible en el log y se reintenta en el próximo arranque. La 009 ya no borra dibujos.

## Pruebas

`npm test` corre seis pruebas: la lógica de posición (avanzar/retroceder son espejos, y el cálculo directo coincide con el paso a paso en 400.000 casos al azar), la autenticación (cookie firmada, clave de dispositivo), el modo invitado, los **controladores con una base simulada** (retomar/reanudar, `reinicio`, `sin_senal`, retrocesos, bloqueo de edición, estadísticas, registro e invitaciones, conductor único, límite de `pasos`), la **lógica de la web ejecutada sin navegador** (recuperar el trabajo al abrir, reanudar sin reiniciar, 401, terminar trabajo, etiquetas de "estimado", pausa, retroceso, segunda pestaña) y los códigos de recuperación. No necesita base de datos.

`tests/integracion.pg.mjs` es una prueba aparte, **contra el servidor real y un PostgreSQL real**: telar, dibujos, conductor del reloj, eventos de los ESP32, reportes del sensor, retrocesos con sensor, estadísticas, invitaciones, dos registros simultáneos con la misma invitación, ocho guardados simultáneos del mismo dibujo (se guarda uno solo), la pausa sin trabajo abierto, los permisos del invitado sobre los dibujos, el usuario sin distinguir mayúsculas y las vueltas que cuenta el sensor del Nivel 2. Crea y borra datos, así que se corre **solo contra una base de prueba vacía**; los pasos están al principio del archivo. Ninguna de las dos reemplaza probar en un navegador real.

## Retomar un trabajo (pausa, cierre de la página, corte de luz, traslado)

Todo lo que define un trabajo vive en la base, no en la pantalla ni en el ESP32: el dibujo asignado
(`telares.patron_actual_id`), la producción abierta (`historial_produccion` en `en_curso`) y su
`fila_actual` y conteo. Por eso:

- **Pausar** deja la producción abierta. **Cerrar la página** o apagar la PC no toca nada: al volver
  a entrar, la web recupera sola el trabajo (mismo dibujo, misma fila) y ▶ lo retoma.
- **Un corte de luz o llevar el telar a la fábrica** reinicia el ESP32. Al arrancar en frío avisa
  `evento-fisico: reinicio`: el estado pasa a `pausado` (no a "tejiendo" con la máquina apagada) y se
  marca la posición como incierta, para que el operario la verifique. Con el Nivel 2 instalado,
  además retoma la fila y el conteo desde el backend (`patron-actual`).
- Asignar de nuevo el mismo dibujo **no reinicia** el trabajo (ver `asignar-patron`).
- La única forma de empezar de cero un dibujo con trabajo abierto es **terminarlo** (`⏹` en la web,
  `POST /detener`) o `asignar-patron` con `reiniciar: true`. Mientras esté abierto, su matriz no se
  puede modificar.
- Límite honesto: sin el sensor del Nivel 2, si la página se cierra con el telar **en marcha**, el
  conteo por reloj se detiene y la fila puede quedar atrasada; con el sensor, la posición se guarda
  cada segundo y como mucho se pierden ~5 pasadas ante un corte de luz.
