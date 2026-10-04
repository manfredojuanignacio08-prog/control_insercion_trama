// ============================================================
//  Herramienta de administración: VER (o crear si falta) el
//  código de recuperación FIJO de un usuario, DESDE EL SERVIDOR.
//
//  En la base el código se guarda CIFRADO (columna recovery_code) y esta
//  herramienta lo descifra para mostrarlo (requiere RECOVERY_SECRET del
//  .env, la misma del servidor). Si la fila todavía tiene el formato viejo
//  en texto plano, se muestra y se migra a cifrado en el acto.
//
//  Uso:
//    node src/scripts/codigo_recuperacion.js <usuario>
//    node src/scripts/codigo_recuperacion.js <usuario> --rotar
//    npm run codigo -- <usuario> --rotar     (con npm, los dos guiones hacen falta: sin
//                                             ellos npm se queda con --rotar y no se rota)
//
//  Con --rotar se genera un código NUEVO (el anterior deja de funcionar).
//  Úsalo si el código se filtró o si el cifrado no se puede leer porque
//  cambió RECOVERY_SECRET.
//
//  Ejemplos:
//    node src/scripts/codigo_recuperacion.js jferrando
//    node src/scripts/codigo_recuperacion.js "maria" --rotar
//
//  Pasáselo a la persona: lo escribe en "No puedo entrar con mi huella"
//  junto con su usuario, y entra directo a la app.
// ============================================================

import crypto from 'crypto';
import { pool } from '../db.js';

const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo).trim().toUpperCase()).digest('hex');

function claveRecovery() {
  const s = process.env.RECOVERY_SECRET;
  if (s && s.length >= 16) return crypto.createHash('sha256').update(s).digest();
  throw new Error('RECOVERY_SECRET no está definida (mínimo 16 caracteres). Definila en el .env.');
}

function cifrarCodigo(codigo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', claveRecovery(), iv);
  const enc = Buffer.concat([c.update(String(codigo), 'utf8'), c.final()]);
  return `gcm1.${iv.toString('base64url')}.${enc.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}

// Devuelve el código; null si es texto plano legado; undefined si está cifrado con OTRA clave
// (se cambió RECOVERY_SECRET). Antes lanzaba un error en ese caso, y como se llamaba antes de
// mirar --rotar, justo el arreglo que indica la documentación ("regenerarlos con --rotar")
// terminaba en "Ocurrió un error".
function descifrarCodigo(guardado) {
  const partes = String(guardado || '').split('.');
  if (partes.length !== 4 || partes[0] !== 'gcm1') return null; // legado: texto plano
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', claveRecovery(), Buffer.from(partes[1], 'base64url'));
    d.setAuthTag(Buffer.from(partes[3], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(partes[2], 'base64url')), d.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

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

  let codigo = null;
  let creado = false;
  let rotado = process.argv.includes('--rotar');
  const dec = user.recovery_code ? descifrarCodigo(user.recovery_code) : null;
  if (dec === undefined && !rotado) {
    console.error('\n  El código guardado de este usuario está cifrado con otra RECOVERY_SECRET (se cambió la clave),');
    console.error('  así que no se puede mostrar. Para darle uno nuevo:');
    console.error(`    node src/scripts/codigo_recuperacion.js ${usuario} --rotar\n`);
    await pool.end();
    process.exit(1);
  }
  if (typeof dec === 'string' && dec && !rotado) {
    codigo = dec;
  } else if (dec === null && user.recovery_code && !rotado) {
    codigo = String(user.recovery_code); // legado: se muestra y se migra
    await pool.query(
      'UPDATE usuarios SET recovery_code = $1, recovery_hash = $2, recovery_usado = false WHERE id = $3',
      [cifrarCodigo(codigo), hashCodigo(codigo), user.id]
    );
  } else {
    codigo = generarCodigo('TRAMA');
    await pool.query(
      'UPDATE usuarios SET recovery_code = $1, recovery_hash = $2, recovery_usado = false WHERE id = $3',
      [cifrarCodigo(codigo), hashCodigo(codigo), user.id]
    );
    creado = true;
  }

  console.log('\n  ────────────────────────────────────────────');
  console.log(`  Usuario:  ${user.usuario}${user.nombre ? ' (' + user.nombre + ')' : ''}`);
  console.log(`  Código de recuperación (FIJO):  ${codigo}`);
  console.log('  ────────────────────────────────────────────');
  if (rotado) console.log('  (Se rotó: el código anterior ya no funciona.)');
  else if (creado) console.log('  (Se generó ahora y queda fijo desde este momento.)');
  console.log('  Siempre es el mismo. Lo usa en "No puedo entrar con mi huella".\n');

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n  Ocurrió un error:', e.message, '\n');
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
