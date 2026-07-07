# Login biométrico (huella / rostro) — WebAuthn

El sistema incluye un login biométrico: el operario entra con su **huella
digital** o su **rostro**, en vez de una contraseña. Está implementado con el
estándar **WebAuthn / FIDO2**, que es la forma segura y estándar de hacer
login biométrico en la web (la misma tecnología que usan bancos y grandes
servicios).

## El punto de seguridad más importante

**La huella y el rostro NUNCA se guardan en la base de datos ni viajan al
servidor.** Esto suele sorprender, así que vale explicarlo bien:

- El sensor biométrico (el lector de huella o la cámara de Face ID) lo tiene
  el **dispositivo del usuario** (su celular o notebook), y la lectura se
  procesa **ahí**, localmente.
- El dispositivo genera un par de llaves criptográficas: una **privada** (que
  queda encerrada en el hardware del teléfono y nunca sale) y una **pública**
  (que se manda al servidor).
- Para entrar, el dispositivo **firma** un desafío aleatorio con su llave
  privada — y para desbloquear esa llave, el usuario pone su huella o su
  cara. El servidor verifica la firma con la llave pública que ya tenía.
- Resultado: el servidor confirma que es el usuario correcto **sin ver jamás
  su huella ni su rostro**. Lo único que guarda son llaves públicas, que no
  sirven para reconstruir ningún dato biométrico.

Por eso, en la base de datos no hay ninguna columna con huellas ni caras:
solo usuarios y las llaves públicas de sus dispositivos.

## Qué se agregó

### Base de datos (3 tablas nuevas)
- **`usuarios`** — los usuarios del sistema (usuario, nombre, un id interno
  para WebAuthn).
- **`credenciales_biometricas`** — las llaves públicas de cada dispositivo
  que un usuario registró (su huella en el celular, el Face ID de otro…). Un
  usuario puede tener varias.
- **`desafios_webauthn`** — los desafíos temporales de un solo uso que se
  emiten en cada registro/login y vencen a los 5 minutos (para evitar que se
  reutilicen).

Ver `src/db/migracion_003_login_biometrico.sql` (y las mismas tablas están en
`src/db/schema.sql`, así que `npm run init-db` ya las crea).

### Backend (4 endpoints)
Bajo `/api/auth`, en dos pasos cada operación (así funciona WebAuthn):

| Endpoint | Para qué |
|---|---|
| `POST /api/auth/registro/iniciar` | Empieza el registro de una huella/rostro; crea el usuario si no existe y devuelve las "opciones" para el navegador. |
| `POST /api/auth/registro/verificar` | Recibe la respuesta firmada del dispositivo y guarda su llave pública. |
| `POST /api/auth/login/iniciar` | Empieza el login; devuelve el desafío para que el navegador pida la huella/rostro. |
| `POST /api/auth/login/verificar` | Verifica la firma. Si es válida, el login es correcto. |

Código en `src/controllers/auth.controller.js` y `src/routes/auth.routes.js`.

## Configuración

En el `.env` del backend (ver `.env.example`) hay dos variables nuevas:

```
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

- `WEBAUTHN_RP_ID`: el dominio del sitio, **sin** protocolo ni puerto. En
  desarrollo es `localhost`; en producción sería el dominio real, ej
  `trama.miempresa.com`.
- `WEBAUTHN_ORIGIN`: la URL completa desde donde se sirve la web, ej
  `https://trama.miempresa.com`.

> ⚠️ **WebAuthn exige HTTPS en producción** (en `localhost` funciona con HTTP
> para desarrollo). Cuando el sistema se publique con un dominio real, tiene
> que estar servido por HTTPS, o el navegador no va a permitir usar la
> biometría. No es una limitación del proyecto, es una regla del estándar por
> seguridad.

## Cómo lo usa la web (flujo)

1. **Registrarse una vez:** el usuario pone su nombre y toca "Registrar
   huella/rostro". El navegador le pide la biometría; si acepta, su
   dispositivo queda registrado.
2. **Entrar después:** toca "Entrar con huella/rostro", pone su huella o mira
   la cámara, y entra.

El navegador se encarga de hablar con el sensor mediante la API estándar
`navigator.credentials`; el backend solo emite desafíos y verifica firmas.

## Aclaración de alcance

Esta implementación cubre el **registro y la verificación biométrica** de
punta a punta (backend + base de datos + los endpoints que la web consume).
La gestión de sesión posterior al login (por ejemplo, emitir un token para
mantener la sesión abierta, o proteger cada endpoint exigiendo estar logueado)
es un paso adicional que se puede sumar según cómo el equipo quiera manejar
los permisos — la base para hacerlo ya está puesta.
