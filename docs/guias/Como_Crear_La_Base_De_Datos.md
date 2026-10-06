# Cómo crear la base de datos, paso a paso (100% desde el navegador)

Esta guía no usa la terminal en ningún momento. Todo se hace haciendo click
en páginas web: Neon para la base de datos, Render para el backend.

El archivo que vas a usar es **`database/01_base_de_datos_completa.sql`**
(está en la carpeta `database/` de este mismo paquete). Es un solo archivo
que sirve tanto si la base es nueva como si ya existe con datos, no hay
que elegir nada, simplemente correrlo.

---

## Paso 1, Crear una cuenta en Neon

1. Entrá a [neon.com](https://neon.com).
2. Click en **Sign up** → registrate (podés usar GitHub).

> Si el equipo ya tiene un proyecto de Neon armado y vos ya tenés acceso
> a él (te invitaron como colaborador), salteá este paso y el Paso 2, y vas
> directo al Paso 3 usando ese proyecto existente.

---

## Paso 2, Crear el proyecto (la base de datos)

1. Dentro de Neon, click en **New project**.
2. Completá:
   - **Project name**: `control-trama` (o el nombre que quieras)
   - **Postgres version**: la que viene por defecto
   - **Region**: la más cercana (por ejemplo, `AWS South America (São Paulo)`)
   - **Plan**: el que diga **Free**
3. Click en **Create project**. Neon lo prepara en unos segundos.
4. Al terminar te muestra la **connection string** (empieza con
   `postgresql://`). **Copiala y guardala**, es lo que va a necesitar el
   backend para conectarse. La podés volver a ver después en el panel, en
   la sección **Connection Details**.

---

## Paso 3, Correr el script que crea las tablas

1. En el menú de la izquierda del proyecto, click en el ícono de **SQL Editor**
   (parece una hoja con `</>`).
2. Click en **New query**.
3. Abrí el archivo `database/01_base_de_datos_completa.sql` de este paquete
   con cualquier editor de texto (Notepad, TextEdit, VS Code, lo que tengas),
   seleccioná todo el contenido (Ctrl+A / Cmd+A) y copialo (Ctrl+C / Cmd+C).
4. Pegalo en el SQL Editor de Neon (Ctrl+V / Cmd+V).
5. Click en **Run** (o `Ctrl+Enter` / `Cmd+Enter`).
6. Al final de la ejecución, en la pestaña de resultados debería aparecer
   una tabla con 9 filas:
   ```
   credenciales_biometricas
   desafios_webauthn
   errores_log
   historial_produccion
   invitaciones
   migraciones_aplicadas
   patrones
   telares
   usuarios
   ```
   Eso confirma que las 9 tablas quedaron creadas. Si la base ya tenía
   datos de antes, no se borró nada, el mismo script lo detecta y solo
   completa lo que faltaba.

> Si en algún paso aparece un error, copialo y pegámelo, lo más probable
> es que sea algo chico (por ejemplo, un permiso) y se resuelve rápido.

---

## Paso 4, Confirmar visualmente que las tablas están bien

1. En el menú de la izquierda, click en **Table Editor**.
2. Deberías ver las 9 tablas: las cuatro del telar (`patrones`, `telares`, `historial_produccion`,
   `errores_log`), las cuatro del ingreso (`usuarios`, `credenciales_biometricas`, `desafios_webauthn`,
   `invitaciones`) y `migraciones_aplicadas`, que registra qué actualizaciones se aplicaron.
3. Click en `patrones` y fijate que tenga estas columnas: `id`, `nombre`,
   `filas`, `columnas`, `matriz_pasadas`, `matriz_ligamento`, `colores_filas`,
   `metadata`, `creado_at`, `modificado_at`, `repeticiones_por_fila`,
   `metros_por_pasada` y `creado_por_invitado` (trece en total).

---

## Paso 5, Conseguir la cadena de conexión

Esto es lo que el backend necesita para hablar con esta base.

1. En el menú de la izquierda, click en el ícono de **engranaje** (Project Settings).
2. Click en **Database**.
3. Buscá la sección **Connection string** y elegí la pestaña **URI**.
4. Copiá esa cadena (tiene esta forma):
   ```
   postgresql://USUARIO:CONTRASEÑA@ep-xxxx-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=verify-full
   ```
   Neon la da terminada en `?sslmode=require` (a veces con `&channel_binding=require`): cambiá
   solo `sslmode=require` por `sslmode=verify-full`. Así la conexión verifica que del otro lado
   esté de verdad la base de Neon, y lo va a seguir haciendo con las próximas versiones de la librería.
5. Reemplazá `[YOUR-PASSWORD]` por la contraseña que elegiste en el Paso 2.
   Guardá esta cadena completa (es tu `DATABASE_URL`).

---

## Paso 6, Usar esta base en el backend desplegado en Render

Con la cadena de conexión del Paso 5, seguí la sección **3.5 "Desplegar en
Render"** del manual (`docs/guias/Manual_Instalacion_y_Funcionamiento.md`),
puntualmente el **Paso 3**, y completá estas variables de entorno en Render:

| Key | Value |
|---|---|
| `DATABASE_URL` | la cadena que armaste en el Paso 5 |
| `PGSSL` | `true` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `SESSION_SECRET` | una clave larga al azar (64 caracteres) |
| `RECOVERY_SECRET` | otra clave larga al azar, **distinta** |
| `ESP32_DEVICE_KEY` | otra clave larga al azar, **distinta** (la misma va en el firmware) |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | el dominio de Render (ver `DESPLIEGUE_RENDER.md`) |

Sin `SESSION_SECRET` ni `RECOVERY_SECRET` el servidor **no arranca** en producción. Cómo
generar las claves y el detalle de cada variable está en `DESPLIEGUE_RENDER.md`, en la raíz
del proyecto.

Con eso, el backend en Render ya queda conectado a esta base de datos que
acabás de crear, todo hecho desde el navegador.

---

## ¿Y si en el futuro hay que actualizar la base otra vez?

Si más adelante el backend necesita una columna o tabla nueva, el mismo
procedimiento sirve: te paso el `.sql` actualizado, lo pegás en el SQL
Editor de Neon, le das **Run**, y listo, no hace falta repetir todo
desde cero, el script siempre detecta qué ya existe y solo agrega lo nuevo.
