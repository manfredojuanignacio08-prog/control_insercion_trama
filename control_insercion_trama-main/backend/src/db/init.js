// Ejecuta schema.sql contra la base configurada en .env
// Uso: npm run init-db
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from '../db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function init() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Ejecutando schema.sql contra la base de datos...');
  try {
    await pool.query(sql);
    console.log('✅ Esquema creado/actualizado correctamente.');
  } catch (err) {
    console.error('❌ Error al crear el esquema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
