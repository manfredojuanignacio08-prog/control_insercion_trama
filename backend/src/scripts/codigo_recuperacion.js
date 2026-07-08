// ============================================================
//  Herramienta de administración: VER (o crear si falta) el
//  código de recuperación FIJO de un usuario, DESDE EL SERVIDOR.
//
//  El código de recuperación es fijo por usuario y no cambia. Se guarda en
//  texto plano (columna recovery_code), así que esta herramienta lo muestra
//  tal cual. Si el usuario todavía no tuviera uno, se le genera uno y queda
//  fijo desde ese momento.
//
//  Uso:
//    node src/scripts/codigo_recuperacion.js <usuario>
//
//  Ejemplos:
//    node src/scripts/codigo_recuperacion.js jferrando
//    node src/scripts/codigo_recuperacion.js "maria"
//
//  Pasáselo a la persona: lo escribe en "No puedo entrar con mi huella"
//  junto con su usuario, y entra directo a la app.
// ============================================================

import crypto from 'crypto';
import { pool } from '../db.js';

const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo).trim().toUpperCase()).digest('hex');

function generarCodigo(prefijo) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1 para no confundir
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
  return `${prefijo}-${s.slice(0, 3)}${s.slice(3)}`;
}

async function main() {
  const usuario = (process.argv[2] || '').trim();
  if (!usuario) {
    console.error('\n  Falta el usuario.');
    console.error('  Uso:  node src/scripts/codigo_recuperacion.js <usuario>\n');
    process.exit(1);
  }

  const { rows } = await pool.query(
    'SELECT id, usuario, nombre, recovery_code FROM usuarios WHERE usuario = $1',
    [usuario]
  );
  const user = rows[0];
  if (!user) {
    console.error(`\n  No existe ningún usuario llamado "${usuario}".`);
    console.error('  Revisá cómo está escrito (respeta mayúsculas/minúsculas).\n');
    process.exit(1);
  }

  let codigo = user.recovery_code;
  let creado = false;
  if (!codigo) {
    codigo = generarCodigo('TRAMA');
    await pool.query(
      'UPDATE usuarios SET recovery_code = $1, recovery_hash = $2, recovery_usado = false WHERE id = $3',
      [codigo, hashCodigo(codigo), user.id]
    );
    creado = true;
  }

  console.log('\n  ────────────────────────────────────────────');
  console.log(`  Usuario:  ${user.usuario}${user.nombre ? ' (' + user.nombre + ')' : ''}`);
  console.log(`  Código de recuperación (FIJO):  ${codigo}`);
  console.log('  ────────────────────────────────────────────');
  if (creado) console.log('  (Se generó ahora y queda fijo desde este momento.)');
  console.log('  Siempre es el mismo. Lo usa en "No puedo entrar con mi huella".\n');

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n  Ocurrió un error:', e.message, '\n');
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
