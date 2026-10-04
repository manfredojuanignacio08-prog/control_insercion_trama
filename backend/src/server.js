import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import dotenv from 'dotenv';

import patronesRouter from './routes/patrones.routes.js';
import telaresRouter from './routes/telares.routes.js';
import historialRouter from './routes/historial.routes.js';
import erroresRouter from './routes/errores.routes.js';
import authRouter from './routes/auth.routes.js';
import nivel2Router from './nivel2/nivel2.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requerirSesion, requerirSesionODispositivo, esDispositivoValido, leerSesion } from './middleware/auth.js';
import { aplicarMigraciones } from './db/migrator.js';
import { pool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';

const app = express();

// Si el servidor corre detrás de un reverse proxy (Nginx, load balancer, Render,
// etc.) hay que avisarle a Express para que tome la IP real del cliente (afecta el
// rate limiting y los logs) y sepa que la conexión original era HTTPS (afecta la
// cookie de sesión). Activar con TRUST_PROXY=true en .env. En Render se activa solo
// (Render define la variable RENDER).
if (process.env.TRUST_PROXY === 'true' || process.env.RENDER) {
  app.set('trust proxy', 1);
}

// Cabeceras de seguridad HTTP. CSP configurado a mano porque index.html
// todavía usa <script> inline, onclick="..." inline, y carga Google Fonts.
//
// IMPORTANTE: helmet, si no se le dice explícitamente lo contrario, pone
// "script-src-attr: 'none'" por defecto (parte de su set de directivas
// recomendadas) (eso bloquea TODOS los onclick=")..." escritos en el HTML,
// aunque scriptSrc sí permita 'unsafe-inline'. Por eso hace falta declarar
// scriptSrcAttr explícitamente acá.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(compression());

// CORS: la web se sirve desde este mismo servidor (mismo origen), así que no
// necesita CORS. En desarrollo se permite cualquier origen; en producción, si no se
// define CORS_ORIGIN, no se habilita ninguno. Para permitir otros dominios, poner en
// .env los dominios reales separados por coma
// (ej: "https://control-trama.miempresa.com,https://app.miempresa.com").
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : (isProd ? false : '*'),
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '5mb' })); // las matrices grandes pueden pesar; damos margen
app.use(morgan(isProd ? 'combined' : 'dev'));

// Limita abuso de la API (ajustable por .env). No aplica a los archivos estáticos
// ni a avanzar/retroceder (esas dos tienen su propio límite, mucho más
// generoso, en telares.routes.js (se llaman en cada paso de la animación)).
//
// Tampoco aplica a los ESP32: el firmware consulta cada 2,5s, o sea ~360 pedidos
// cada 15 minutos, por encima del límite general. Sin esta excepción el propio ESP32
// se auto-bloqueaba a los ~12 minutos de encendido y dejaba de recibir órdenes (el
// telar quedaba sin responder a Marcha/Pausa desde la web).
//
// La excepción se concede SOLO con la clave de dispositivo válida (header
// X-Device-Key). Antes bastaba con agregar ?origen=esp32 a la URL, o sea que cualquiera
// se salteaba el límite.
//
// El límite es de 900 (no 300) porque la web refresca el estado del telar
// cada 4s = 225 pedidos cada 15 min POR PESTAÑA ABIERTA. Con dos personas
// mirando a la vez (el operario en el celular y alguien en la PC, o durante
// una presentación) ya se pasaban los 300 sin que nadie hiciera nada, y la
// app empezaba a devolver errores sola. 900 deja lugar para ~3 pestañas
// más el uso normal.
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 900,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    /\/telares\/[^/]+\/(avanzar|retroceder)$/.test(req.path) ||
    esDispositivoValido(req),
  // El cupo se cuenta por operario, no por IP. En la fábrica todos los celulares y la PC
  // salen a Internet por el mismo router: contado por IP, cuatro pestañas abiertas (cada
  // una consulta el estado del telar cada 4 s) agotaban el cupo de la planta entera y
  // nadie podía usar la aplicación, ni siquiera para tocar Pausa. Los invitados y los
  // pedidos sin sesión se siguen contando por IP.
  keyGenerator: (req) => {
    const s = leerSesion(req);
    if (s && !s.invitado) return 'usuario:' + s.usuario;
    return 'ip:' + ipKeyGenerator(req.ip);
  },
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ─── Rutas ───────────────────────────────────────────────────────────
// /api/health y /api/auth/* son públicas (hay que poder entrar para tener sesión).
// Todo lo demás exige sesión de operario o clave de dispositivo; cada ruta de
// escritura aclara además quién puede llamarla (ver routes/*.js).
app.use('/api/auth', authRouter);
app.use('/api/patrones', requerirSesion, patronesRouter);
app.use('/api/telares', requerirSesionODispositivo, telaresRouter);
app.use('/api/telares', requerirSesionODispositivo, nivel2Router);   // Nivel 2: patron-actual y pasadas
app.use('/api/historial', requerirSesion, historialRouter);
app.use('/api/errores', requerirSesionODispositivo, erroresRouter);

// Cualquier ruta /api/* no manejada arriba -> 404 limpio en JSON
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

// ─── Frontend web (el producto) ──────────────────────────────────────
// El backend sirve la página web desde /public. La web está diseñada para
// verse en el celular (mobile-first) y ya está conectada a esta misma API
// (no usa localStorage). Al abrir la URL del servidor en el navegador del
// teléfono, la interfaz carga completa y guarda todo en la base de datos.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(errorHandler);

// ─── Migraciones automáticas al arrancar ─────────────────────────────
// Aplica las migraciones pendientes (db/migracion_*.sql) al iniciar el servidor.
// Cada una se aplica UNA sola vez (tabla migraciones_aplicadas) y dentro de una
// transacción. Ver db/migrator.js. Si alguna falla, el servidor arranca igual pero
// deja el error bien visible en el log.
async function correrMigraciones() {
  try {
    await aplicarMigraciones();
  } catch (err) {
    console.error('No se pudieron aplicar las migraciones:', err.message);
    console.error('Podés correrlas a mano con: npm run migrate');
  }
}

if (isProd) {
  if (!process.env.ESP32_DEVICE_KEY) {
    console.warn('⚠ ESP32_DEVICE_KEY no está definida: los ESP32 no van a poder conectarse (la API los rechaza).');
  }
  if (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN) {
    console.warn('⚠ WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN no están definidas: el login por huella toma el dominio del pedido, ' +
                 'lo que debilita la protección anti-phishing de WebAuthn. Definirlas en producción.');
  }
}

const PORT = process.env.PORT || 3000;
let server;
correrMigraciones().finally(() => {
  server = app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });
});

// ─── Apagado prolijo ────────────────────────────────────────────────
// Importante en un servidor real: si el proceso recibe SIGTERM (lo manda
// Docker, systemd, PM2 o el orquestador al desplegar/reiniciar) hay que
// dejar de aceptar conexiones nuevas y cerrar el pool de Postgres antes
// de salir, para no cortar queries a la mitad ni dejar conexiones colgadas.
function shutdown(signal) {
  console.log(`\nRecibida señal ${signal}, cerrando servidor...`);
  if (!server) { pool.end().finally(() => process.exit(0)); return; }
  server.close(async () => {
    try {
      await pool.end();
      console.log('Conexiones a PostgreSQL cerradas correctamente.');
      process.exit(0);
    } catch (err) {
      console.error('Error cerrando el pool de PostgreSQL:', err);
      process.exit(1);
    }
  });
  // Si algo se cuelga, forzamos la salida a los 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin manejar:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
  process.exit(1);
});

