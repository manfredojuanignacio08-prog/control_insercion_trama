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

Esto ejecuta `backend/src/db/schema.sql` (crea las tablas `patrones`, `telares`,
`historial_produccion`, `errores_log`, índices y el trigger de `modificado_at`).
Es seguro correrlo de nuevo: usa `CREATE TABLE IF NOT EXISTS`.

## 3. Levantar el servidor

```bash
npm run dev      # con autoreload (nodemon)
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
de la página web), compresión `gzip`, *rate limiting* por IP, CORS configurable,
logs en formato `combined` cuando `NODE_ENV=production`, validación estricta
de los datos que llegan, y apagado prolijo (cierra el pool de Postgres antes
de salir cuando el proceso recibe `SIGTERM`/`SIGINT`).

### Opción A, Docker (recomendado, todo incluido)

```bash
docker compose up -d --build
```

Esto levanta PostgreSQL y la API juntos, corre `init-db` automáticamente y
deja todo escuchando en `http://localhost:3000`. Para producción real, antes
de este paso cambiá las credenciales de `docker-compose.yml` (o llevalas a
variables de entorno del host) y no las dejes en `postgres/postgres`.

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
| `SESSION_SECRET` | **Obligatoria.** Firma las cookies de sesión (mínimo 32 caracteres). Si falta se usa una clave temporal y las sesiones se pierden en cada reinicio |
| `ESP32_DEVICE_KEY` | **Obligatoria.** Clave que mandan los ESP32 en `X-Device-Key` (la misma en `DEVICE_KEY` de los dos `config`). Sin ella los ESP32 reciben 401 |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | Dominio real para el login por huella (requiere HTTPS) |
| `REGISTRO_LIBRE_MAX` | Usuarios que se registran libres (defecto 3); después hace falta invitación |
| `CORS_ORIGIN` | Dominios que pueden llamar a la API desde otro origen. Vacío en producción = ninguno (la web se sirve desde el mismo servidor y no lo necesita) |
| `TRUST_PROXY` | Poner en `true` si hay Nginx/load balancer delante |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Límite de requests por IP |

## 5. Endpoints

### Patrones (biblioteca)
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/patrones?buscar=texto` |, | Lista (filtra por nombre, ILIKE) |
| GET | `/api/patrones/:id` |, | Detalle |
| POST | `/api/patrones` | `{nombre, filas, columnas, matriz_pasadas, matriz_ligamento?, colores_filas?, metadata?}` | Crea. Si no mandás `matriz_ligamento`, se deriva automáticamente (`pasadas>0 → 1`) |
| PUT | `/api/patrones/:id` | igual que POST | Reemplaza el patrón |
| DELETE | `/api/patrones/:id` |, | Borra (falla con 409 si tiene historial asociado) |

`GET /api/patrones` y `GET /api/historial` aceptan `limit` (defecto 500 / 100) y `offset`. `PUT /api/patrones/:id` responde **409** (`codigo: PATRON_EN_PRODUCCION`) si se intenta cambiar la matriz o las dimensiones de un dibujo que se está tejiendo (producción abierta): hay que detener el trabajo primero. Nombre, colores y metadatos sí se pueden editar.

### Telares
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/telares` |, | Lista con nombre del patrón actual |
| GET | `/api/telares/:id` |, | Detalle |
| POST | `/api/telares` | `{codigo, nombre?}` | Crea un telar nuevo |
| POST | `/api/telares/:id/asignar-patron` | `{patron_id, reiniciar?}` | Asigna patrón y abre una producción nueva en la fila 0. Si el telar **ya tiene abierta una producción de ese mismo dibujo**, la **reanuda** (`200`, `reanudado: true`) en vez de reiniciarla, salvo que se mande `reiniciar: true`. Si tenía una de otro dibujo, la cierra como `detenido_manual` |
| POST | `/api/telares/:id/detener` | `{pasadas_totales?, alertas_disparadas?}` | Cierra la producción en curso (409 si no había ninguna). Si no se manda `pasadas_totales`, conserva el contador ya acumulado por `/avanzar` |
| POST | `/api/telares/:id/avanzar` | `{pasos?}` (default 1) | Avanza N pasadas **por reloj** (lo llama la web en cada paso de su animación; **es una estimación**). Una fila = una pasada: avanza N filas y al terminar el dibujo vuelve a la fila 0 (suma a `vueltas_completadas`). Si el sensor del Nivel 2 está reportando responde **409 `SENSOR_ACTIVO`** y no toca nada: la posición y el conteo los lleva el sensor |
| POST | `/api/telares/:id/retroceder` | `{pasos?}` (default 1) | Espejo exacto de `/avanzar`: una pasada atrás = una fila menos. Desde la fila 0 vuelve a la última (el dibujo es un lazo; `al_inicio: true`). Descuenta la pasada del conteo |
| POST | `/api/telares/:id/retroceder-fisico` |, | Pulsa el relé del botón **físico** Retroceder del telar (mueve la máquina de verdad). No confundir con `/retroceder`, que solo mueve el cursor del patrón en la web. Incrementa `retroceder_seq` (orden para el Nivel 1: el ESP32 detecta el cambio al sondear y da el pulso) y `retrocesos_contados` (hecho, que lee el Nivel 2) |
| POST | `/api/telares/:id/evento-fisico` | `{tipo: 'marcha'\|'pausa'\|'retroceder'\|'sin_senal'}` | **Solo con clave de dispositivo.** Lo llama el ESP32 cuando **sensa** (no acciona) algo en la máquina. Actualiza el estado real: `marcha`→`tejiendo`, `pausa`→`pausado`, `retroceder`→ una fila atrás, `sin_senal` (el sensor dejó de recibir pulsos con el telar en marcha)→`pausado` con `motivo_pausa='sin_senal'` y un registro en el log de errores. `reinicio` (el ESP32 arrancó en frío: corte de luz o traslado)→ si figuraba `tejiendo`, pasa a `pausado` con `motivo_pausa='reinicio'` **conservando producción, dibujo y posición**, y marca la posición como incierta. Sin esto, alguien podía arrancar el telar a mano y la web seguía mostrando "detenido" |
| POST | `/api/telares/:id/confirmar-posicion` | `{visto_hasta?}` | El operario ya revisó el telar y confirma la posición: limpia `posicion_incierta`. Si se manda `visto_hasta` (timestamp del evento que la web mostró) y llegó otro evento después, responde **409** en vez de tapar el aviso nuevo |
| POST | `/api/telares/:id/validar-conteo` | `{confirmo: true}` | El operario da por bueno el conteo del sensor tras compararlo con el contador mecánico del telar |
| GET | `/api/telares/:id/historial` |, | Historial de ese telar (`limit`, `offset`) |

### Historial global y errores
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/historial?telar_id=&desde=&hasta=` | Dashboard / consulta global |
| GET | `/api/errores?telar_id=&limit=` | Lista de errores (reemplaza el `localStorage telar_errors`) |
| POST | `/api/errores` | `{telar_id?, titulo, mensaje?, codigo?}` |
| GET | `/api/health` | Chequeo de salud |

## 5. Estructura

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
- `migracion_009_rango_dimensiones.sql`: acota filas y columnas al rango 1 a 100 (filas) y 1 a 8 (columnas), el mismo que valida el editor y que soporta el firmware.
- `migracion_010_elementos_seleccion.sql`: guarda cuántos elementos de selección (bobinas) tiene cada telar, para avisar cuando un dibujo tiene más columnas de las que la máquina puede accionar. Documenta además que `columna_actual` es vestigial y queda siempre en cero.
- `migracion_011_metros_por_pasada.sql`: guarda cuántos metros avanza la tela en una pasada, para convertir el conteo en metros reales y calcular estadísticas de producción.
- `migracion_012_conteo_sensor_y_retrocesos.sql`: separa el conteo estimado del medido por el sensor (`pasadas_sensor`, `conteo_validado`), agrega `retrocesos_contados`, `ultimo_reporte_sensor` y `motivo_pausa`.
- `migracion_013_indice_unico_en_curso.sql`: una sola producción `en_curso` por telar (índice único).
│   ├── migrator.js                               Aplica cada migración UNA vez (tabla migraciones_aplicadas)
│   └── migrate.js                                Corre las migraciones pendientes (npm run migrate)
├── utils/
│   ├── ligamento.js        Deriva matriz_ligamento desde matriz_pasadas
│   ├── posicion.js         Lógica pura de avanzar/retroceder (espejo 1):1 de doTick()/rollback() del frontend
│   └── validacion.js       Validación de patrones
├── middleware/errorHandler.js  Manejo centralizado de errores (404/400/409/500)
├── controllers/             Lógica de negocio por entidad
└── routes/                  Definición de rutas Express
```

## 6. Decisiones de diseño aplicadas (ver documento de análisis)

- `matriz_pasadas` (enteros) y `matriz_ligamento` (binario) son **campos separados**.
- **Una FILA es una PASADA.** En cada pasada, la fila del patrón define qué
  marcos suben: cada columna es una bobina/electroimán del dobby. Las
  columnas NO se recorren una por una, son simultáneas dentro de la misma
  pasada. Lo que avanza es la fila.
- La repetición es **de fila entera**: si una fila tiene números mayores a 1,
  esa pasada se repite esa cantidad de veces antes de pasar a la siguiente
  (se toma el mayor valor de la fila). No se agregó ningún campo nuevo:
  `matriz_pasadas` ya guardaba esos números.
- `historial_produccion.fila_actual` / `pasada_actual` guardan la posición de
  la producción en curso (mismo significado que `curRow`/`curPass` del
  frontend) (soportan "retroceder una pasada" sin reconstruir nada).
  `columna_actual` se conserva por compatibilidad pero ya no marca posición:
  siempre vale 0. `vueltas_completadas` cuenta cuántas veces se
  tejió el patrón entero (no hay "final": es un bucle infinito, igual que
  un telar real, hasta que se detiene manualmente).
- Esquema **multi-telar desde el día 1**; el piloto puede arrancar con un solo
  registro en `telares` sin que eso implique ninguna migración después.
- **Sin autenticación** en esta versión (no hay tabla de usuarios).
- `asignar-patron`, `detener`, `avanzar` y `retroceder` corren dentro de una
  **transacción** con `FOR UPDATE` para evitar condiciones de carrera si dos
  requests llegan casi al mismo tiempo.

## 7. Pendientes / próximos pasos sugeridos

1. **Selector visual de telar/máquina**: hoy se usa automáticamente el único
   telar que existe (creado solo si no hay ninguno). El día que haya más de
   uno, agregar el selector en la web, la lógica de conexión
   (`asignar-patron`, `avanzar`, `retroceder`) ya está lista para trabajar
   con cualquier id de telar, no hay que tocar el backend para eso.
2. **Pantalla de historial de producción**: la base ya tiene los datos
   (`historial_produccion` con posición, vueltas completadas, etc.) pero no
   hay ninguna pantalla en la web que los muestre todavía.
3. A futuro, cuando se integre el ESP32 real: que sea el propio
   microcontrolador el que llame a `/avanzar` reportando pasadas físicas
   reales (en vez de que lo haga la animación del editor en el navegador), y
   que `pasadas_totales`/`alertas_disparadas` lleguen del sensor óptico en
   vez de simularse.

## Seguridad de la API

**Toda la API exige autenticación**, salvo `GET /api/health` y `/api/auth/*` (hay que poder entrar para tener sesión). Hay dos formas de autenticarse:

| Quién | Cómo | Qué puede |
|---|---|---|
| Operario (web) | Cookie de sesión firmada (`HttpOnly`, `SameSite=Lax`, `Secure` con HTTPS), que el servidor entrega tras el login por huella o con el código de recuperación | Todo lo de la web: dibujos, asignar/pausar/reanudar, avanzar, retroceder, historial |
| Dispositivo (ESP32) | Header `X-Device-Key` con el valor de `ESP32_DEVICE_KEY` | Sondear `GET /telares/:id`, avisar `evento-fisico`, reportar `pasadas`, `POST /errores`, descargar `patron-actual` |

Sin ninguna de las dos, la API responde **401**. Las acciones de la web (asignar dibujo, pausar, etc.) las rechaza si vienen con clave de dispositivo, y los avisos del hardware (`evento-fisico`, `pasadas`) los rechaza si vienen de una sesión: una persona no puede falsear lo que "sensó" el telar.

Variables de entorno obligatorias en producción (ver `.env.example`): `SESSION_SECRET` (mínimo 32 caracteres), `ESP32_DEVICE_KEY` (la misma en `DEVICE_KEY` de los dos firmwares), y `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` con el dominio real. El login por huella exige HTTPS (o `localhost`): por `http://192.168.x.x` el navegador lo bloquea, así que en la red local hay que servir por HTTPS o entrar con el código de recuperación.

Además: el registro es libre solo para los primeros `REGISTRO_LIBRE_MAX` usuarios (defecto 3); después hace falta un código de invitación. Sumar una huella a un usuario existente exige haber iniciado sesión como ese usuario. El login y la recuperación tienen un límite de intentos por IP (`AUTH_INTENTOS_MAX`).

## Migraciones

Cada `db/migracion_NNN_*.sql` se aplica **una sola vez**, dentro de una transacción; el registro está en la tabla `migraciones_aplicadas`. Corre sola al arrancar el servidor o a mano con `npm run migrate`. Si una falla, queda un error visible en el log y se reintenta en el próximo arranque. La 009 ya no borra dibujos.

## Pruebas

`npm test` corre cuatro pruebas: la lógica de posición (avanzar/retroceder son espejos), la autenticación (cookie firmada, clave de dispositivo), los **controladores con una base simulada** (retomar/reanudar, `reinicio`, `sin_senal`, retrocesos, bloqueo de edición, estadísticas, registro e invitaciones) y la **lógica de la web ejecutada sin navegador** (recuperar el trabajo al abrir, reanudar sin reiniciar, 401, terminar trabajo, etiquetas de "estimado"). Ninguna reemplaza probar contra PostgreSQL y en un navegador real.

## Retomar un trabajo (pausa, cierre de la página, corte de luz, traslado)

Todo lo que define un trabajo vive en la base, no en la pantalla ni en el ESP32: el dibujo asignado
(`telares.patron_actual_id`), la producción abierta (`historial_produccion` en `en_curso`) y su
`fila_actual` y conteo. Por eso:

- **Pausar** deja la producción abierta. **Cerrar la página** o apagar la PC no toca nada: al volver
  a entrar, la web recupera sola el trabajo (mismo dibujo, misma fila) y ▶ lo retoma.
- **Un corte de luz o llevar el telar a la fábrica** reinicia los ESP32. El Nivel 1, al arrancar en
  frío, avisa `evento-fisico: reinicio`: el estado pasa a `pausado` (no a "tejiendo" con la máquina
  apagada) y se marca la posición como incierta, para que el operario la verifique. El Nivel 2 retoma
  la fila y el conteo desde el backend (`patron-actual`).
- Asignar de nuevo el mismo dibujo **no reinicia** el trabajo (ver `asignar-patron`).
- La única forma de empezar de cero un dibujo con trabajo abierto es **terminarlo** (`⏹` en la web,
  `POST /detener`) o `asignar-patron` con `reiniciar: true`. Mientras esté abierto, su matriz no se
  puede modificar.
- Límite honesto: sin el sensor del Nivel 2, si la página se cierra con el telar **en marcha**, el
  conteo por reloj se detiene y la fila puede quedar atrasada; con el sensor, la posición se guarda
  cada segundo y como mucho se pierden ~5 pasadas ante un corte de luz.
