import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const sslConfig = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false;

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

// max: tope de conexiones simultáneas del pool (Supabase free tier comparte
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
// mata sola después de este tiempo — evita que una conexión rota deje un
// bloqueo colgado para siempre.
connectionConfig.idle_in_transaction_session_timeout = 10_000;
connectionConfig.query_timeout = 15_000;

export const pool = new Pool(connectionConfig);

pool.on('error', (err) => {
  // Errores de conexiones ociosas del pool (no rompe el server)
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});
