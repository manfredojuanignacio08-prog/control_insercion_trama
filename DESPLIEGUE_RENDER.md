# Despliegue en Render

Render publica el backend (que también sirve la aplicación web) desde el repositorio de
GitHub. Desplegar es subir el código al repositorio y cargar las variables de entorno.

## 1. Antes de tocar nada: respaldo de la base

En la consola de Neon, crear una **rama** (branch) de la base de producción. Es una copia
instantánea: si algo sale mal, se vuelve a ella. Las migraciones ya se probaron sobre una copia
con datos de producción, pero el respaldo es la red de seguridad.

## 2. Variables de entorno (primero, antes de subir el código)

En Render: el servicio → **Environment** → agregar. Al guardar, Render redespliega el código
que ya está; no pasa nada, el código nuevo todavía no está subido.

| Variable | Valor | Si falta |
|---|---|---|
| `DATABASE_URL` | La de Neon (ya debería estar) | El servidor no arranca |
| `NODE_ENV` | `production` | |
| `SESSION_SECRET` | Clave larga al azar (ver abajo) | Todos pierden la sesión cada vez que Render reinicia el servicio (en el plan gratuito, seguido) |
| `ESP32_DEVICE_KEY` | Otra clave larga al azar, **distinta** | Ningún ESP32 puede conectarse |
| `WEBAUTHN_RP_ID` | `control-trama-backend.onrender.com` | El login por huella queda menos protegido |
| `WEBAUTHN_ORIGIN` | `https://control-trama-backend.onrender.com` | Ídem |

Para generar cada clave (en cualquier computadora con Node):

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`WEBAUTHN_RP_ID` va **sin** `https://` y sin barra final; `WEBAUTHN_ORIGIN`, **con** `https://`.
Si el dominio no coincide exactamente con el de la página, las huellas registradas dejan de
funcionar.

## 3. Configuración del servicio

En Render: el servicio → **Settings**. Verificar:

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

La versión de Node queda fijada por `engines` en `backend/package.json`.

## 4. Subir el código

Reemplazar el contenido del repositorio por el de esta carpeta, hacer commit y push a la rama
que despliega Render. Si el despliegue automático está desactivado: **Manual Deploy → Deploy
latest commit**.

**No subir** el archivo `.env` ni una copia de `config.h` con la clave real del dispositivo: la
clave real va solo en Render y en la copia que se carga a las placas.

## 5. Revisar el arranque

En **Logs**, la primera vez deberían aparecer las trece migraciones aplicadas:

```
✅ migracion_001_... aplicada.
...
Migraciones al día (13 nueva/s).
Servidor escuchando ...
```

Cualquier línea con ❌ indica una migración que falló: no se aplicó, las demás siguen, y se
reintenta en el próximo arranque. Si aparece, no seguir: revisar el mensaje.

Después: abrir `https://control-trama-backend.onrender.com/api/health` (debe responder
`{"ok":true,...}`), entrar con la huella, y probar "Continuar sin iniciar sesión".

Con el cambio al sistema de sesiones nuevo, **todos tienen que volver a iniciar sesión una vez**.
Las huellas y los códigos de recuperación existentes siguen sirviendo.

## 6. Las placas

Hasta que se carguen de nuevo, las placas quedan rechazadas: el servidor exige la clave.

1. Con la sesión iniciada, abrir `https://control-trama-backend.onrender.com/api/telares`. La
   web usa el **primero** de esa lista (ordenada por código). Su `id` va en `TELAR_ID`.
2. En los dos firmwares (`config.h` y `config_nivel2.h`): `DEVICE_KEY` igual a
   `ESP32_DEVICE_KEY` de Render, y `TELAR_ID` igual al id del paso anterior.
3. Cargar los firmwares. En la web, el indicador tiene que dejar de decir "Sin datos del ESP32".
