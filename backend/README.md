# Backend — Control de Inserción de Trama

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

Esto ejecuta `src/db/schema.sql` (crea las tablas `patrones`, `telares`,
`historial_produccion`, `errores_log`, índices y el trigger de `modificado_at`).
Es seguro correrlo de nuevo: usa `CREATE TABLE IF NOT EXISTS`.

## 3. Levantar el servidor

```bash
npm run dev      # con autoreload (nodemon)
npm start        # modo normal
```

Por defecto en `http://localhost:3000`. También sirve el frontend estático
desde `/public` (ya están copiados `index.html` y `styles.css` limpios, sin los
backups ni el `save_fix.js` huérfano que tenía el paquete original).

> ✅ El frontend en `/public` **ya está conectado a esta API** — cada acción
> del editor (tocar una celda, cambiar color, tamaño, play/pausa/detener/
> retroceder) llega a la base de datos en tiempo real, no solo al apretar
> "Guardar". Usa automáticamente el único telar que exista (se crea uno solo
> si no hay ninguno) — no hay selector visual todavía porque no hace falta
> elegir entre opciones cuando solo hay una.

## 4. Despliegue en un servidor real

El backend ya incluye lo necesario para correr en producción: cabeceras de
seguridad (`helmet`, con CSP ajustado para que no rompa el `<script>` inline
del frontend), compresión `gzip`, *rate limiting* por IP, CORS configurable,
logs en formato `combined` cuando `NODE_ENV=production`, validación estricta
de los datos que llegan, y apagado prolijo (cierra el pool de Postgres antes
de salir cuando el proceso recibe `SIGTERM`/`SIGINT`).

### Opción A — Docker (recomendado, todo incluido)

```bash
docker compose up -d --build
```

Esto levanta PostgreSQL y la API juntos, corre `init-db` automáticamente y
deja todo escuchando en `http://localhost:3000`. Para producción real, antes
de este paso cambiá las credenciales de `docker-compose.yml` (o llevalas a
variables de entorno del host) y no las dejes en `postgres/postgres`.

### Opción B — PM2 en un servidor propio (VPS, on-premise en planta)

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
| `CORS_ORIGIN` | Restringir qué dominios pueden llamar a la API (no dejar vacío en producción) |
| `TRUST_PROXY` | Poner en `true` si hay Nginx/load balancer delante |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Límite de requests por IP |

## 5. Endpoints

### Patrones (biblioteca)
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/patrones?buscar=texto` | — | Lista (filtra por nombre, ILIKE) |
| GET | `/api/patrones/:id` | — | Detalle |
| POST | `/api/patrones` | `{nombre, filas, columnas, matriz_pasadas, matriz_ligamento?, colores_filas?, metadata?}` | Crea. Si no mandás `matriz_ligamento`, se deriva automáticamente (`pasadas>0 → 1`) |
| PUT | `/api/patrones/:id` | igual que POST | Reemplaza el patrón |
| DELETE | `/api/patrones/:id` | — | Borra (falla con 409 si tiene historial asociado) |

### Telares
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/telares` | — | Lista con nombre del patrón actual |
| GET | `/api/telares/:id` | — | Detalle |
| POST | `/api/telares` | `{codigo, nombre?}` | Crea un telar nuevo |
| POST | `/api/telares/:id/asignar-patron` | `{patron_id}` | Asigna patrón, abre fila en `historial_produccion`. Si había una producción en curso, la cierra como `detenido_manual` automáticamente. Arranca en `fila_actual=0, columna_actual=0, pasada_actual=0` |
| POST | `/api/telares/:id/detener` | `{pasadas_totales?, alertas_disparadas?}` | Cierra la producción en curso (409 si no había ninguna). Si no se manda `pasadas_totales`, conserva el contador ya acumulado por `/avanzar` |
| POST | `/api/telares/:id/avanzar` | `{pasos?}` (default 1) | Avanza N pasadas físicas de tejido (pensado para el ESP32) — espejo exacto de `doTick()` del frontend: respeta cuántas pasadas tiene cada celda de `matriz_pasadas`, cruza de fila sola, y al terminar el patrón vuelve a la fila 0 y sigue (bucle infinito, suma a `vueltas_completadas`) |
| POST | `/api/telares/:id/retroceder` | `{pasos?}` (default 1) | Retrocede N pasos sin reconstruir nada — espejo exacto de `rollback()` del frontend, usa `fila_actual`/`columna_actual` ya guardados. No retrocede más allá del inicio (`al_inicio: true`) |
| GET | `/api/telares/:id/historial` | — | Historial de ese telar |

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
│   └── migrate.js                                Corre TODAS las migracion_*.sql en orden
├── utils/
│   ├── ligamento.js        Deriva matriz_ligamento desde matriz_pasadas
│   ├── posicion.js         Lógica pura de avanzar/retroceder — espejo 1:1 de doTick()/rollback() del frontend
│   └── validacion.js       Validación de patrones
├── middleware/errorHandler.js  Manejo centralizado de errores (404/400/409/500)
├── controllers/             Lógica de negocio por entidad
└── routes/                  Definición de rutas Express
```

## 6. Decisiones de diseño aplicadas (ver documento de análisis)

- `matriz_pasadas` (enteros) y `matriz_ligamento` (binario) son **campos separados**.
- La repetición es **a nivel de celda** (ya existía: cada valor de
  `matriz_pasadas` ya es cuántas veces se repite esa celda) — no se agregó
  ningún campo nuevo para esto, ya estaba resuelto desde el principio.
- `historial_produccion.fila_actual` / `columna_actual` / `pasada_actual`
  guardan la posición exacta de la producción en curso (mismo significado
  que `curRow`/`curCol`/`curPass` del frontend) — soportan "retroceder un
  paso" sin reconstruir nada. `vueltas_completadas` cuenta cuántas veces se
  tejió el patrón entero (no hay "final": es un bucle infinito, igual que
  un telar real, hasta que se detiene manualmente).
- Esquema **multi-telar desde el día 1**; el piloto puede arrancar con un solo
  registro en `telares` sin que eso implique ninguna migración después.
- **Sin autenticación** en esta versión — no hay tabla de usuarios.
- `asignar-patron`, `detener`, `avanzar` y `retroceder` corren dentro de una
  **transacción** con `FOR UPDATE` para evitar condiciones de carrera si dos
  requests llegan casi al mismo tiempo.

## 7. Pendientes / próximos pasos sugeridos

1. **Selector visual de telar/máquina**: hoy se usa automáticamente el único
   telar que existe (creado solo si no hay ninguno). El día que haya más de
   uno, agregar el selector en el frontend — la lógica de conexión
   (`asignar-patron`, `avanzar`, `retroceder`) ya está lista para trabajar
   con cualquier id de telar, no hay que tocar el backend para eso.
2. **Pantalla de historial de producción**: la base ya tiene los datos
   (`historial_produccion` con posición, vueltas completadas, etc.) pero no
   hay ninguna pantalla en el frontend que los muestre.
3. A futuro, cuando se integre el ESP32 real: que sea el propio
   microcontrolador el que llame a `/avanzar` reportando pasadas físicas
   reales (en vez de que lo haga la animación del editor en el navegador), y
   que `pasadas_totales`/`alertas_disparadas` lleguen del sensor óptico en
   vez de simularse.
