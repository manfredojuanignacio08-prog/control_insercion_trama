// Regenera database/01_base_de_datos_completa.sql: el esquema base (db/schema.sql) más TODAS
// las migraciones en orden, y al final las registra en migraciones_aplicadas para que el
// servidor no las vuelva a correr. Hay que correrlo cada vez que se agrega una migración.
// Uso: npm run generar-sql
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirDb = path.join(__dirname, '..', 'db');
const salida = path.join(__dirname, '..', '..', '..', 'database', '01_base_de_datos_completa.sql');

const SEP = '-- ============================================================';
const cabecera = `-- ============================================================================
--  Control de Inserción de Trama · Base de datos completa
--
--  Se genera a partir de la fuente de verdad del esquema (backend/src/db/schema.sql)
--  más TODAS las migraciones, en orden, y al final las registra en la tabla que usa
--  el migrador del backend.
--
--  En el día a día conviene usar los scripts del backend:
--      npm run init-db     crea las tablas
--      npm run migrate     aplica las migraciones pendientes
--  El servidor además aplica solo las pendientes en cada arranque.
--
--  IMPORTANTE: si se agrega una migración nueva, hay que regenerar este archivo
--  (desde backend/: npm run generar-sql). No editarlo a mano.
-- ============================================================================
`;

const migraciones = fs.readdirSync(dirDb).filter((f) => /^migracion_\d+.*\.sql$/.test(f)).sort();
const partes = [cabecera, fs.readFileSync(path.join(dirDb, 'schema.sql'), 'utf-8').trim(), ''];
for (const m of migraciones) {
  partes.push('', SEP, `-- ${m}`, SEP, fs.readFileSync(path.join(dirDb, m), 'utf-8').trim(), '');
}
partes.push(
  '', SEP, '-- Registro de migraciones', SEP,
  'CREATE TABLE IF NOT EXISTS migraciones_aplicadas (',
  '  archivo     TEXT PRIMARY KEY,',
  '  aplicada_at TIMESTAMPTZ NOT NULL DEFAULT now()',
  ');', '',
  'INSERT INTO migraciones_aplicadas (archivo) VALUES',
  migraciones.map((m) => `  ('${m}')`).join(',\n'),
  'ON CONFLICT (archivo) DO NOTHING;', '',
  SEP,
  '-- Verificación final: lista las tablas creadas (deben ser nueve).',
  '-- Es el resultado que se ve al terminar de correr este script.',
  SEP,
  'SELECT table_name AS tablas_creadas',
  '  FROM information_schema.tables',
  " WHERE table_schema = 'public'",
  ' ORDER BY table_name;',
  ''
);
fs.writeFileSync(salida, partes.join('\n'));
console.log(`Generado ${path.relative(process.cwd(), salida)} (${migraciones.length} migraciones).`);
