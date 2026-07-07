# Manual de Instalación y Funcionamiento
## Sistema de Control de Inserción de Trama

---

## 1. Qué es este proyecto

Sistema para diseñar, administrar y controlar los patrones de tejido de los
telares de la planta. El producto tiene cuatro partes:

- **Página web**: la interfaz de uso real, diseñada para verse en el
  celular. Desde el navegador se diseñan los patrones (editor de
  cuadrícula), se administran, y se controla el telar. La sirve el mismo
  backend y tiene modo claro y oscuro.
- **Backend**: una API (Node.js + Express) conectada a una base de datos
  PostgreSQL, que guarda los patrones, registra qué telar está tejiendo qué,
  y mantiene el historial de producción. Además sirve la página web. Es el
  único que habla con la base.
- **Base de datos (PostgreSQL en Supabase)**: donde vive toda la información,
  alojada en la nube.
- **Firmware ESP32**: el puente con el telar físico. Lee del backend si el
  telar debe estar tejiendo y acciona los relés conectados a los botones de
  Marcha/Pausa de la máquina.

La web y el ESP32 hablan con el **mismo backend** por la **misma API**;
nadie toca la base de datos directo. El mismo servidor Express sirve tanto
la API como la web: al abrir `http://localhost:3000` la interfaz ya está
conectada al backend y guarda todo en la base de datos (no usa
`localStorage`).

---

## 2. Qué incluye este paquete

```
control_insercion_trama_completo/
├── backend/                       El núcleo: API REST + PostgreSQL
│   ├── src/
│   │   ├── server.js              Servidor Express (punto de entrada)
│   │   ├── db.js                  Conexión a PostgreSQL/Supabase
│   │   ├── db/schema.sql          Esquema de la base de datos
│   │   ├── db/init.js             Crea las tablas (correr una vez)
│   │   ├── utils/                 Lógica pura (ligamento, posición, validación)
│   │   ├── middleware/            Manejo de errores
│   │   ├── controllers/           Lógica de negocio
│   │   └── routes/                Rutas de la API
│   ├── public/                    La PÁGINA WEB (el producto), servida por el backend
│   │   ├── index.html             la web, ya conectada al backend
│   │   └── styles.css             estilos (modo claro y oscuro)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── ecosystem.config.cjs       Configuración para PM2
│   ├── .env.example
│   └── README.md                  Guía técnica detallada del backend
├── esp32/                         Firmware del microcontrolador + eléctrica
│   ├── control_trama_esp32/       Sketch (.ino) y config.h
│   ├── RECOMENDACIONES_ELECTRICAS.md
│   ├── diagrama_conexion_electrica.svg / .png
│   └── README.md
├── database/                      Script SQL de referencia del esquema
├── diagramas/                     Diagramas lógico, eléctrico y árbol de problemas
├── docs/
│   ├── Manual_Instalacion_y_Funcionamiento.md   ← este documento
│   ├── Como_Crear_La_Base_De_Datos.md
│   └── Analisis_Frontend_y_Plan_Backend.md
└── _referencia_app_android/       ⚠️ Base de app Android — NO funcional, solo referencia
```

---

## 3. Cómo levantar todo

> **Importante sobre la base de datos:** el equipo ya tiene una base compartida
> en **Supabase** con las 4 tablas creadas (ver
> `docs/Documentacion_BaseDeDatos_Telar.docx`). Para usar esa base real, hay
> que pedir la contraseña de conexión y completarla en `DATABASE_URL` (se
> explica en el Paso 2 de la sección 3.5). Las opciones de abajo (Docker o
> manual) también permiten levantar una base **propia, local, solo para
> desarrollo** — útil para probar cambios sin tocar la base compartida del
> equipo, pero esa base local nunca tiene los datos reales.

### 3.1 Opción rápida: Docker (recomendada, todo incluido)

Solo necesitás tener Docker instalado.

```bash
cd backend
docker compose up -d --build
```

Esto:
1. Levanta un PostgreSQL con los datos configurados
2. Crea las tablas automáticamente y aplica la migración (`matriz_ligamento`, índices, trigger)
3. Levanta el servidor Node.js
4. Expone la API en **http://localhost:3000** (`/api/...`)

Para apagar: `docker compose down`
Para apagar y borrar la base de datos: `docker compose down -v`

---

### 3.2 Opción manual (Node.js + PostgreSQL instalados en el servidor)

**Paso 1 — Instalar dependencias:**
```bash
cd backend
npm install
```

**Paso 2 — Configurar la conexión a PostgreSQL:**
```bash
cp .env.example .env
```
Abrí el `.env` y completá los datos de tu base. Ejemplo para Postgres local con configuración por defecto:
```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=TU_CONTRASEÑA
PGDATABASE=control_trama
PORT=3000
NODE_ENV=production
```

**Paso 3 — Crear la base de datos** (solo si es una base local nueva, no la del equipo):
```sql
CREATE DATABASE control_trama;
```
Si en cambio vas a conectarte a la base real del equipo en Supabase, no creás
nada — solo completá `DATABASE_URL` en el `.env` (ver sección 3.5, Paso 2).

**Paso 4 — Crear o actualizar las tablas:**
```bash
npm run init-db
npm run migrate
```
- `npm run init-db` crea las tablas si no existen (en una base nueva/local, las crea
  completas, con `matriz_ligamento` incluida).
- `npm run migrate` agrega lo que pueda faltar en una base que ya existía antes
  (por ejemplo, la columna `matriz_ligamento` en la base real del equipo, que se
  creó sin ella — ver sección 9).

Correr los dos siempre es seguro, sin importar el estado de la base: si algo
ya existe, cada paso lo detecta y no hace nada. Debería responder
`✅ Esquema creado/actualizado correctamente.` y luego
`✅ Migración aplicada correctamente.` Si falla, revisar que PostgreSQL esté
corriendo y que los datos del `.env` sean correctos.

**Paso 5 — Levantar el servidor:**
```bash
npm start
```

La API queda en **http://localhost:3000/api**. Verificá con `curl http://localhost:3000/api/health`.

---

### 3.3 Opción con PM2 (producción en un servidor propio sin Docker)

PM2 mantiene el proceso corriendo y lo reinicia si se cae:

```bash
npm install -g pm2
npm run init-db
npm run migrate
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # para que arranque automático con el servidor
```

---

### 3.4 Ponerle un dominio y HTTPS (Nginx)

Si el servidor tiene dominio propio, lo ideal es poner Nginx delante con HTTPS.
Ejemplo de configuración de Nginx:

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

Si usás Nginx, poner `TRUST_PROXY=true` en el `.env`.

---

### 3.5 Desplegar en Render (gratis, paso a paso)

[Render](https://render.com) permite alojar el backend sin pagar nada y sin
necesidad de servidor propio. La base de datos (Supabase) ya existe y se
conecta desde acá, no se crea otra. Esta sección está pensada para alguien
que nunca usó Render.

> ⚠️ Render cambia los nombres de sus menús y las condiciones del plan
> gratuito de vez en cuando. Los pasos de abajo reflejan el flujo general,
> que se mantiene bastante estable, pero si algún botón no aparece exactamente
> igual, buscalo dentro de la misma sección del dashboard — la lógica es la misma.

#### Paso 1 — Subir el proyecto a GitHub

Render necesita leer el código desde un repositorio de Git (no se sube el `.zip` directamente).

1. Creá una cuenta gratis en [github.com](https://github.com) si no tenés.
2. Creá un repositorio nuevo (botón **New repository**), por ejemplo `control-trama`. Dejalo vacío (sin README).
3. En tu computadora, dentro de la carpeta `Proyecto_Control_Insercion_Trama`:
   ```bash
   git init
   git add .
   git commit -m "Proyecto inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/control-trama.git
   git push -u origin main
   ```
   (Reemplazá `TU_USUARIO` por tu usuario de GitHub. Te va a pedir que inicies sesión la primera vez.)

#### Paso 2 — Conectar la base de datos del equipo (Supabase)

El equipo ya tiene una base de datos en **Supabase**, con las 4 tablas creadas
(`patrones`, `telares`, `historial_produccion`, `errores_log`). No hace falta
crear una base nueva en Render — solo conectar el backend a esa.

1. Pedile al responsable de la base de datos del equipo la contraseña de
   conexión de Supabase (no está en este documento por seguridad).
2. Con esos datos, armá la cadena de conexión con este formato:
   ```
   postgresql://postgres:LA_CONTRASEÑA@db.rybhfvnvxpfujpqdlqnk.supabase.co:5432/postgres
   ```
   (Reemplazá `LA_CONTRASEÑA` por la real. El resto — host, puerto, usuario,
   nombre de base — ya está confirmado en la documentación de la base de datos del equipo.)
3. Guardá esa cadena completa — la vas a pegar como variable de entorno en el Paso 3.

> Si en algún momento el equipo decide migrar a otra base (por ejemplo, una
> propia en Render), el procedimiento es el mismo: solo cambia el valor de
> `DATABASE_URL`, no hay que tocar código.

#### Paso 3 — Crear el servicio web (el backend)

1. En el Dashboard de Render, click en **New +** → **Web Service**.
2. Elegí **Build and deploy from a Git repository** y conectá tu cuenta de GitHub si te lo pide.
3. Seleccioná el repositorio `control-trama` que creaste en el Paso 1.
4. Completá la configuración:
   - **Name**: `control-trama` (esto define la URL final, algo como `control-trama.onrender.com`)
   - **Root Directory**: `backend`  ⚠️ **muy importante** — el código está dentro de la carpeta `backend`, no en la raíz del repositorio.
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/db/init.js && node src/db/migrate.js && node src/server.js`
     *(Este comando es seguro de correr contra la base compartida del equipo:
     `init.js` usa `CREATE TABLE IF NOT EXISTS` y `migrate.js` agrega solo lo
     que falte (`matriz_ligamento`, índices, trigger) sin tocar ni borrar
     ningún dato existente. Es justamente lo que hace que la base de Supabase
     quede igual de completa que la que usa el backend en desarrollo.)*
   - **Plan**: el que diga **Free**

5. Antes de crear el servicio, bajá hasta **Environment Variables** y agregá estas:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | la cadena de conexión a Supabase armada en el Paso 2 |
   | `PGSSL` | `true` *(obligatorio — Supabase exige SSL, sin esto la conexión falla)* |
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `true` |
   | `CORS_ORIGIN` | (dejarlo vacío por ahora) |

   No hace falta agregar `PORT` — Render lo asigna automáticamente y el servidor ya está hecho para usarlo.

6. Click en **Create Web Service**. Render va a clonar el repo, instalar dependencias y levantar el servidor. Se puede seguir el proceso en la pestaña **Logs**.

#### Paso 4 — Verificar que funcionó

En los **Logs** deberían aparecer, en este orden:
```
Ejecutando schema.sql contra la base de datos...
✅ Esquema creado/actualizado correctamente.
Servidor escuchando en http://localhost:10000 (NODE_ENV=production)
```

Render te va a dar una URL pública (arriba del dashboard del servicio), algo como:
```
https://control-trama.onrender.com
```

Para confirmar que el backend
responde, abrí en otra pestaña:
```
https://control-trama.onrender.com/api/health
```
Tiene que devolver `{"ok":true,"timestamp":"..."}`.

#### Cosas a tener en cuenta con el plan gratuito de Render

- **Se "duerme" tras 15 minutos sin uso.** La primera visita después de eso tarda
  entre 30 y 50 segundos en responder mientras el servidor arranca de nuevo. Las
  siguientes son normales hasta que vuelva a quedar inactivo.
- **La base de datos es la de Supabase del equipo, no una de Render** — eso es
  bueno: no se borra ni expira si el servicio de Render se reinicia o se duerme,
  ya que vive en otro lugar. Revisar directamente en el dashboard de Supabase
  las condiciones del plan free de esa plataforma (límite de almacenamiento y
  de conexiones simultáneas).
- Cada vez que se actualice el código y se vuelva a desplegar, el `Start Command`
  va a volver a correr `init-db` automáticamente — no rompe nada si las tablas
  ya existen (el script usa `CREATE TABLE IF NOT EXISTS`).
- Esto es válido para la **etapa de pruebas actual** (un solo telar, sin
  hardware real conectado). Cuando se conecte el ESP32 de verdad, conviene
  revisar la recomendación de la sección 8 sobre alojarlo dentro de la red de
  la planta en lugar de depender de un hosting gratuito en internet.

---

## 4. Variables del archivo `.env`

| Variable | Para qué sirve | Ejemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexión completa. **Usar esta para conectar a la base de Supabase del equipo.** Si se completa, ignora las variables `PG*` de abajo. | `postgresql://postgres:CONTRASEÑA@db.rybhfvnvxpfujpqdlqnk.supabase.co:5432/postgres` |
| `PGSSL` | Si la conexión exige SSL. **Obligatorio en `true` para Supabase**, o la conexión falla. | `true` |
| `PG_POOL_MAX` | Máximo de conexiones simultáneas a la base. No conviene subirlo sin necesidad (Supabase free tiene un límite compartido entre todo el equipo). | `10` |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | Datos de conexión sueltos, **solo para una base local de desarrollo** (se ignoran si `DATABASE_URL` tiene un valor) | `localhost` / `5432` / `postgres` / — / `control_trama` |
| `PORT` | Puerto del servidor web | `3000` |
| `NODE_ENV` | Modo de ejecución (`development` o `production`) | `production` |
| `CORS_ORIGIN` | Dominios que pueden llamar a la API. Vacío = cualquiera. | `https://miapp.com` |
| `TRUST_PROXY` | Poner en `true` si hay Nginx u otro proxy delante (incluido Render) | `false` |
| `RATE_LIMIT_MAX` | Máximo de solicitudes por IP por ventana de tiempo | `300` |
| `RATE_LIMIT_WINDOW_MS` | Ventana de tiempo del rate limit en milisegundos | `900000` (15 min) |

---

## 5. Verificar que todo funciona

Después de levantar el servidor, correr:

```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:
```json
{"ok":true,"timestamp":"2026-06-18T..."}
```

Si eso responde, el servidor y la base de datos están bien. Después,
abrir **http://localhost:3000** en el navegador (idealmente el del celular
o el modo responsive del navegador de escritorio): la página web debe
cargar completa.

---

## 6. Cómo se usa el sistema (la página web)

La interfaz de uso real es la **página web** que sirve el backend, diseñada
para verse en el celular. Se abre en `http://localhost:3000` y tiene tres
pantallas (barra inferior): Inicio, Editor y Biblioteca. Arriba a la derecha
hay un botón para alternar **modo claro / oscuro**.

### Editor
Donde se diseña un patrón de tejido. Cada acción se guarda sola en la base
de datos, no hace falta apretar "Guardar" para que quede registrado:

- **Nombre, filas y columnas**: definen el patrón y el tamaño de la
  cuadrícula. Si el nombre ya existe, el sistema lo avisa.
- **Cuadrícula**: tocando una celda se le asigna un número de pasadas; las
  celdas con pasadas se muestran en color.
- **Color por fila**: a cada fila se le puede asignar un color de hilo.
- **Controles de simulación (▶ ⏸ ⏹ ↺)**: animan la grilla y al mismo tiempo
  avisan al telar (por ahora hay un solo telar, se usa automáticamente). ▶
  asigna el patrón y arranca; ↺ retrocede usando la posición real que
  devuelve el servidor; ⏹ cierra esa producción en el historial.
- **Exportar ficha técnica**: descarga un **PDF real** con el nombre, las
  dimensiones y la grilla coloreada, generado en el navegador con `jsPDF`
  (no depende de internet).

### Biblioteca
Lista todos los patrones guardados, con buscador por nombre. Permite cargar
un patrón en el editor o eliminarlo (si tiene historial asociado, no lo deja
borrar, para no perder el historial).

Cada acción llega al backend y se guarda en la base al instante: la posición
no se pierde si se cierra el navegador o se corta la conexión, porque el
estado vive en la base de datos, no en el dispositivo.

---

## 7. Qué está funcionando y qué está pendiente

| Funcionalidad | Estado |
|---|---|
| Backend: API REST completa (patrones, telares, historial, errores) | ✅ Funcionando |
| Guardar / editar / borrar patrones en la base de datos | ✅ Funcionando |
| Cargar patrones desde la base de datos | ✅ Funcionando |
| Historial de producción (tablas de BD) | ✅ Funcionando |
| Telar único automático (sin selector, por ahora hay uno solo) | ✅ Funcionando |
| Avanzar/Retroceder/Detener con posición real en la base | ✅ Funcionando |
| Log de errores en la base de datos | ✅ Funcionando |
| Página web (editor, biblioteca, simulación) para el celular | ✅ Funcionando |
| Modo claro / oscuro de la web | ✅ Funcionando |
| Exportar ficha del patrón a PDF real | ✅ Funcionando |
| Selector visual de telar (para cuando haya más de uno) | ⏳ Pendiente |
| Firmware ESP32 (gateway relés Marcha/Pausa) | ✅ Escrito, listo para armar el hardware |
| Conexión física al telar real | ⏳ Próxima etapa (armar la etapa eléctrica) |
| App Android nativa | ⏳ A futuro (hay una base de referencia, no funcional) |

---

## 8. Cuando se conecte el telar real (ESP32)

Este hosting gratuito en internet (Render, Fly.io, etc.) es una **buena opción
para la etapa actual de pruebas**, sin hardware conectado. Pero una vez que el
ESP32 del telar tenga que hablar con este backend en producción real:

- Si el servidor "duerme" (plan free) o internet de la planta falla un
  segundo, el telar se queda sin backend mientras tanto.
- Lo más seguro para una máquina física en producción es correr este mismo
  proyecto (el mismo `docker-compose.yml` que ya está armado) en una PC chica
  o Raspberry Pi **dentro de la red de la planta**, sin depender de internet
  para que el control funcione.
- El código no cambia para eso — es la misma imagen Docker, solo cambia *dónde*
  se ejecuta.

No es algo para resolver ahora, pero conviene tenerlo en mente para no migrar
todo de apuro cuando llegue ese momento.

### Cómo controla el ESP32 al telar

El firmware (carpeta `esp32/`) hace de **gateway**: no reemplaza la lógica de
la máquina, la comanda. Dos relés van conectados **en paralelo** a los botones
de Marcha y Pausa del telar. El ESP32 consulta al backend el estado del telar
(la misma API que usa la app) y, cuando alguien asigna un patrón desde la app
(el telar pasa a `tejiendo`), pulsa el relé de Marcha; cuando alguien detiene,
pulsa el de Pausa. La botonera física del telar sigue funcionando igual, y si
se cae la red el ESP32 no hace nada (fail-safe). El paso a paso del hardware,
las protecciones eléctricas recomendadas y el diagrama del circuito están en
`esp32/README.md`, `esp32/RECOMENDACIONES_ELECTRICAS.md` y
`esp32/diagrama_conexion_electrica.svg`.

---

## 9. Problemas comunes

| Problema | Causa probable / solución |
|---|---|
| `npm run init-db` falla con "connection refused" | PostgreSQL no está corriendo. Iniciarlo con `service postgresql start` o equivalente. |
| `npm run init-db` falla con "password authentication" | Revisar `PGPASSWORD` (o `DATABASE_URL`) en el `.env`. |
| `npm run migrate` falla con "SSL required" o similar | Falta `PGSSL=true` en el `.env` — Supabase exige SSL. |
| `npm run migrate` no agrega `matriz_ligamento` a patrones viejos | Revisar que el patrón tenga `matriz_pasadas` válida; el backfill solo corre sobre filas con `matriz_ligamento IS NULL`. |
| La biblioteca aparece vacía | Es normal si es la primera vez. Crear un patrón (desde la app o la web de demo). |
| Error al guardar: "Ya existe un dibujo con ese nombre" | Los nombres son únicos en la base. Cambiar el nombre o borrar el anterior. |
| Error al eliminar: "No se puede completar la operación" | El patrón tiene historial de producción. No se puede borrar para preservar el historial. |
| `docker compose up` falla con "port already in use" | El puerto 3000 o 5432 está ocupado. Cambiarlo en `docker-compose.yml` o liberar el puerto. |
| La app no trae datos | Verificar que el backend esté corriendo, que `http://localhost:3000/api/health` responda, y que la `BASE_URL` de la app apunte al backend. |
| No se ve la tipografía Century Gothic (web de demo) | Es una fuente comercial, no se puede empaquetar. Si el equipo no la tiene instalada, cae automáticamente a `Questrial` (Google Fonts), la alternativa más parecida. |
