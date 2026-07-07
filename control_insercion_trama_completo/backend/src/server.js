import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import patronesRouter from './routes/patrones.routes.js';
import telaresRouter from './routes/telares.routes.js';
import historialRouter from './routes/historial.routes.js';
import erroresRouter from './routes/errores.routes.js';
import authRouter from './routes/auth.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { pool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';

const app = express();

// Si el servidor corre detrás de un reverse proxy (Nginx, load balancer, etc.)
// hay que avisarle a Express para que tome la IP real del cliente
// (afecta el rate limiting y los logs). Activar con TRUST_PROXY=true en .env.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Cabeceras de seguridad HTTP. CSP configurado a mano porque index.html
// todavía usa <script> inline, onclick="..." inline, y carga Google Fonts.
//
// IMPORTANTE: helmet, si no se le dice explícitamente lo contrario, pone
// "script-src-attr: 'none'" por defecto (parte de su set de directivas
// recomendadas) — eso bloquea TODOS los onclick="..." escritos en el HTML,
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

// CORS: en desarrollo permite cualquier origen. En producción, configurar
// CORS_ORIGIN en .env con el/los dominios reales separados por coma
// (ej: "https://control-trama.miempresa.com,https://app.miempresa.com").
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : '*',
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '5mb' })); // las matrices grandes pueden pesar; damos margen
app.use(morgan(isProd ? 'combined' : 'dev'));

// Limita abuso de la API (ajustable por .env). No aplica a los archivos estáticos
// ni a avanzar/retroceder (esas dos tienen su propio límite, mucho más
// generoso, en telares.routes.js — se llaman en cada paso de la animación).
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => /\/telares\/[^/]+\/(avanzar|retroceder)$/.test(req.path),
  message: { error: 'Demasiadas solicitudes, intentá de nuevo más tarde.' },
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/patrones', patronesRouter);
app.use('/api/telares', telaresRouter);
app.use('/api/historial', historialRouter);
app.use('/api/errores', erroresRouter);

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

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});

// ─── Apagado prolijo ────────────────────────────────────────────────
// Importante en un servidor real: si el proceso recibe SIGTERM (lo manda
// Docker, systemd, PM2 o el orquestador al desplegar/reiniciar) hay que
// dejar de aceptar conexiones nuevas y cerrar el pool de Postgres antes
// de salir, para no cortar queries a la mitad ni dejar conexiones colgadas.
function shutdown(signal) {
  console.log(`\nRecibida señal ${signal}, cerrando servidor...`);
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

