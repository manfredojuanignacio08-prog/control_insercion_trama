// Aplica las migraciones (db/migracion_NNN_*.sql) UNA sola vez cada una.
//
// Antes, todas se volvían a ejecutar en cada arranque del servidor. Eso tenía dos
// problemas: cada arranque hacía trabajo de más, y una migración con un DELETE (la
// 009 lo tenía) podía borrar datos cada vez que se reiniciaba el servidor. Ahora
// hay una tabla migraciones_aplicadas que recuerda cuáles ya corrieron.
//
// Cada archivo corre dentro de una transacción: o se aplica entera o no se aplica.
// Si una falla, se avisa con un error bien visible y se sigue con las demás (igual
// que antes), pero la que falló NO queda registrada, así que se reintenta en el
// próximo arranque en vez de quedar rota en silencio.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function aplicarMigraciones({ log = console.log } = {}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      archivo     TEXT PRIMARY KEY,
      aplicada_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const archivos = fs
    .readdirSync(__dirname)
    .filter((f) => /^migracion_\d+.*\.sql$/.test(f))
    .sort(); // los nombres empiezan con número (001, 002...): el orden alfabético es el correcto

  const { rows } = await pool.query('SELECT archivo FROM migraciones_aplicadas');
  const hechas = new Set(rows.map((r) => r.archivo));

  let nuevas = 0;
  const fallidas = [];

  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const cliente = await pool.connect();
    try {
      const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf-8');
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO migraciones_aplicadas (archivo) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      nuevas++;
      log(`  ✅ ${archivo} aplicada.`);
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      fallidas.push(archivo);
      console.error(`  ❌ La migración ${archivo} FALLÓ y no se aplicó: ${err.message}`);
    } finally {
      cliente.release();
    }
  }

  if (fallidas.length) {
    console.error(
      `⚠ ${fallidas.length} migración(es) sin aplicar: ${fallidas.join(', ')}. ` +
      'Se reintentan en el próximo arranque, o a mano con: npm run migrate'
    );
  } else {
    log(nuevas ? `Migraciones al día (${nuevas} nueva/s).` : 'Migraciones al día (nada pendiente).');
  }
  return { nuevas, fallidas };
}
