// Ejecuta las migraciones pendientes (migracion_*.sql) contra la base configurada
// en .env. Cada una se aplica una sola vez: el registro está en la tabla
// migraciones_aplicadas. Pensado para correr contra la base de Neon del equipo
// cada vez que se agrega algo nuevo al backend.
// Uso: npm run migrate
import dotenv from 'dotenv';
import { pool } from '../db.js';
import { aplicarMigraciones } from './migrator.js';

dotenv.config();

async function migrate() {
  try {
    const { fallidas } = await aplicarMigraciones();
    if (fallidas.length) process.exitCode = 1;

    const { rows } = await pool.query(
      `SELECT count(*) AS total, count(matriz_ligamento) AS con_ligamento FROM patrones`
    );
    console.log(`\nResumen: ${rows[0].total} patrones en total, ${rows[0].con_ligamento} con matriz_ligamento.`);
  } catch (err) {
    console.error('❌ Error al migrar:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
