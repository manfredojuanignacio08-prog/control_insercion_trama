import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Con PGSSL=true la conexión va cifrada Y se verifica el certificado del servidor (que de verdad
// sea la base y no alguien en el medio). Antes se cifraba sin verificar (rejectUnauthorized: false).
// Neon usa certificados de autoridades públicas, así que la verificación funciona sin configurar
// nada más. Si alguna base usara un certificado propio que no se pueda verificar, PGSSL_VERIFICAR=false
// vuelve al comportamiento anterior (solo como salida de emergencia).
//
// OJO: si DATABASE_URL trae ?sslmode=..., la librería pg usa ESO y no esta opción (la URL manda).
// Para Neon conviene ?sslmode=verify-full: verifica hoy y lo va a seguir haciendo en la próxima
// versión de pg, en la que sslmode=require dejará de verificar el certificado.
const sslConfig = process.env.PGSSL === 'true'
  ? { rejectUnauthorized: process.env.PGSSL_VERIFICAR !== 'false' }
  : false;

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'control_trama',
      ssl: sslConfig,
    };

// max: tope de conexiones simultáneas del pool (Neon free tier comparte
// un límite bajo de conexiones directas entre todo el equipo).
// connectionTimeoutMillis: evita que una request se quede colgada para
// siempre si la base no responde (importante para una base en la nube).
connectionConfig.max = Number(process.env.PG_POOL_MAX) || 10;
connectionConfig.connectionTimeoutMillis = 10_000;
connectionConfig.idleTimeoutMillis = 30_000;

// statement_timeout: si una consulta individual (incluido esperar un
// bloqueo FOR UPDATE) tarda más de esto, Postgres la cancela con un error
// claro en vez de dejarla esperando para siempre. Sin esto, una transacción
// que por algún motivo no llegó a hacer COMMIT/ROLLBACK puede dejar
// bloqueadas a todas las siguientes que toquen la misma fila (asignar,
// detener, avanzar, retroceder usan FOR UPDATE).
connectionConfig.statement_timeout = 15_000;
// idle_in_transaction_session_timeout: si una transacción se queda "a
// mitad de camino" (BEGIN sin COMMIT/ROLLBACK) sin hacer nada, Postgres la
// mata sola después de este tiempo, evita que una conexión rota deje un
// bloqueo colgado para siempre.
connectionConfig.idle_in_transaction_session_timeout = 10_000;
connectionConfig.query_timeout = 15_000;

export const pool = new Pool(connectionConfig);

pool.on('error', (err) => {
  // Errores de conexiones ociosas del pool (no rompe el server)
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});
