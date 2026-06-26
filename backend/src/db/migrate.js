// Ejecuta TODAS las migraciones (migracion_*.sql) en orden contra la base
// configurada en .env. Pensado para correr contra la base de Supabase del
// equipo cada vez que se agrega algo nuevo al backend.
// Uso: npm run migrate
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from '../db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const archivos = fs
    .readdirSync(__dirname)
    .filter((f) => /^migracion_\d+.*\.sql$/.test(f))
    .sort(); // los nombres empiezan con número (001, 002...), el orden alfabético ya es el correcto

  if (archivos.length === 0) {
    console.log('No hay migraciones para correr.');
    await pool.end();
    return;
  }

  console.log(`Encontradas ${archivos.length} migraciones: ${archivos.join(', ')}`);

  try {
    for (const archivo of archivos) {
      console.log(`\n→ Ejecutando ${archivo}...`);
      const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf-8');
      await pool.query(sql);
      console.log(`  ✅ ${archivo} aplicada correctamente.`);
    }

    const { rows } = await pool.query(
      `SELECT count(*) AS total,
              count(matriz_ligamento) AS con_ligamento
       FROM patrones`
    );
    console.log(
      `\nResumen: ${rows[0].total} patrones en total, ${rows[0].con_ligamento} con matriz_ligamento.`
    );
  } catch (err) {
    console.error('❌ Error al migrar:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
