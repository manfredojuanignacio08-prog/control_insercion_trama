# Cómo crear la base de datos — paso a paso (100% desde el navegador)

Esta guía no usa la terminal en ningún momento. Todo se hace haciendo click
en páginas web: Supabase para la base de datos, Render para el backend.

El archivo que vas a usar es **`database/01_base_de_datos_completa.sql`**
(está en la carpeta `database/` de este mismo paquete). Es un solo archivo
que sirve tanto si la base es nueva como si ya existe con datos — no hay
que elegir nada, simplemente correrlo.

---

## Paso 1 — Crear una cuenta en Supabase

1. Entrá a [supabase.com](https://supabase.com).
2. Click en **Start your project** → registrate (podés usar GitHub).

> Si el equipo ya tiene un proyecto de Supabase armado y vos ya tenés acceso
> a él (te invitaron como colaborador), salteá este paso y el Paso 2, y vas
> directo al Paso 3 usando ese proyecto existente.

---

## Paso 2 — Crear el proyecto (la base de datos)

1. Dentro de Supabase, click en **New project**.
2. Completá:
   - **Name**: `control-trama` (o el nombre que quieras)
   - **Database Password**: elegí una contraseña fuerte y **guardala** —
     la vas a necesitar después para conectar el backend. Supabase no la
     vuelve a mostrar.
   - **Region**: la más cercana (por ejemplo, `South America (São Paulo)`)
   - **Plan**: el que diga **Free**
3. Click en **Create new project** y esperá un par de minutos mientras
   Supabase prepara todo (vas a ver una barra de progreso).

---

## Paso 3 — Correr el script que crea las tablas

1. En el menú de la izquierda del proyecto, click en el ícono de **SQL Editor**
   (parece una hoja con `</>`).
2. Click en **New query**.
3. Abrí el archivo `database/01_base_de_datos_completa.sql` de este paquete
   con cualquier editor de texto (Notepad, TextEdit, VS Code, lo que tengas),
   seleccioná todo el contenido (Ctrl+A / Cmd+A) y copialo (Ctrl+C / Cmd+C).
4. Pegalo en el SQL Editor de Supabase (Ctrl+V / Cmd+V).
5. Click en **Run** (o `Ctrl+Enter` / `Cmd+Enter`).
6. Al final de la ejecución, en la pestaña de resultados debería aparecer
   una tabla con 4 filas:
   ```
   errores_log
   historial_produccion
   patrones
   telares
   ```
   Eso confirma que las 4 tablas quedaron creadas. Si la base ya tenía
   datos de antes, no se borró nada — el mismo script lo detecta y solo
   completa lo que faltaba.

> Si en algún paso aparece un error, copialo y pegámelo — lo más probable
> es que sea algo chico (por ejemplo, un permiso) y se resuelve rápido.

---

## Paso 4 — Confirmar visualmente que las tablas están bien

1. En el menú de la izquierda, click en **Table Editor**.
2. Deberías ver las 4 tablas: `patrones`, `telares`, `historial_produccion`, `errores_log`.
3. Click en `patrones` y fijate que tenga estas columnas: `id`, `nombre`,
   `filas`, `columnas`, `matriz_pasadas`, `matriz_ligamento`, `colores_filas`,
   `metadata`, `creado_at`, `modificado_at`.

---

## Paso 5 — Conseguir la cadena de conexión

Esto es lo que el backend necesita para hablar con esta base.

1. En el menú de la izquierda, click en el ícono de **engranaje** (Project Settings).
2. Click en **Database**.
3. Buscá la sección **Connection string** y elegí la pestaña **URI**.
4. Copiá esa cadena — tiene esta forma:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Reemplazá `[YOUR-PASSWORD]` por la contraseña que elegiste en el Paso 2.
   Guardá esta cadena completa — es tu `DATABASE_URL`.

---

## Paso 6 — Usar esta base en el backend desplegado en Render

Con la cadena de conexión del Paso 5, seguí la sección **3.5 "Desplegar en
Render"** del manual (`docs/Manual_Instalacion_y_Funcionamiento.md`),
puntualmente el **Paso 3**, y completá estas variables de entorno en Render:

| Key | Value |
|---|---|
| `DATABASE_URL` | la cadena que armaste en el Paso 5 |
| `PGSSL` | `true` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |

Con eso, el backend en Render ya queda conectado a esta base de datos que
acabás de crear, todo hecho desde el navegador, sin usar la terminal en
ningún momento.

---

## ¿Y si en el futuro hay que actualizar la base otra vez?

Si más adelante el backend necesita una columna o tabla nueva, el mismo
procedimiento sirve: te paso el `.sql` actualizado, lo pegás en el SQL
Editor de Supabase, le das **Run**, y listo — no hace falta repetir todo
desde cero, el script siempre detecta qué ya existe y solo agrega lo nuevo.
