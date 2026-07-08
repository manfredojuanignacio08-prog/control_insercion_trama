// ============================================================
//  Herramienta de administración: generar / reponer el código
//  de recuperación de un usuario DESDE EL SERVIDOR.
//
//  ¿Para qué sirve?
//  El código de recuperación se guarda hasheado en la base (no en texto
//  plano), así que NO se puede "consultar" uno que ya existe. Si alguien
//  perdió su código y además no puede entrar con la huella, esta es la
//  única forma de darle uno nuevo: la corre el administrador en el servidor.
//
//  Uso:
//    node src/scripts/codigo_recuperacion.js <usuario>
//
//  Ejemplos:
//    node src/scripts/codigo_recuperacion.js jferrando
//    node src/scripts/codigo_recuperacion.js "maria"
//
//  Imprime el código UNA vez por pantalla: anotalo y pasáselo a la persona.
//  Después esa persona lo escribe en "No puedo entrar con mi huella".
// ============================================================

import crypto from 'crypto';
import { pool } from '../db.js';

// Mismo hash y formato que usa el backend (SHA-256, mayúsculas)
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

  const { rows } = await pool.query('SELECT id, usuario, nombre FROM usuarios WHERE usuario = $1', [usuario]);
  const user = rows[0];
  if (!user) {
    console.error(`\n  No existe ningún usuario llamado "${usuario}".`);
    console.error('  Revisá cómo está escrito (respeta mayúsculas/minúsculas).\n');
    process.exit(1);
  }

  const codigo = generarCodigo('TRAMA');
  await pool.query(
    'UPDATE usuarios SET recovery_hash = $1, recovery_usado = false WHERE id = $2',
    [hashCodigo(codigo), user.id]
  );

  console.log('\n  ────────────────────────────────────────────');
  console.log(`  Usuario:  ${user.usuario}${user.nombre ? ' (' + user.nombre + ')' : ''}`);
  console.log(`  Código de recuperación NUEVO:  ${codigo}`);
  console.log('  ────────────────────────────────────────────');
  console.log('  Pasáselo a la persona. Lo usa en "No puedo entrar con mi huella".');
  console.log('  (Reemplaza cualquier código anterior. Se usa una sola vez.)\n');

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n  Ocurrió un error:', e.message, '\n');
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
