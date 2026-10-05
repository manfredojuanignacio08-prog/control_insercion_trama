// Prueba del código de recuperación CIFRADO (sin base real): stub de pool como
// en controladores.test.mjs. Verifica: login con código cifrado, migración de
// legado en texto plano a cifrado, fila solo-hash, y rechazo de código erróneo.
process.env.SESSION_SECRET = 'z'.repeat(40);
process.env.ESP32_DEVICE_KEY = 'clave-esp32-de-prueba';
process.env.RECOVERY_SECRET = 'secreto-de-prueba-1234';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import assert from 'assert';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trama-test-rec-'));
fs.cpSync(path.join(aqui, '..', 'src'), path.join(tmp, 'src'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
// El controller importa @simplewebauthn/server: enlazar node_modules del backend
try { fs.symlinkSync(path.join(aqui, '..', 'node_modules'), path.join(tmp, 'node_modules'), 'junction'); } catch (_) {}
fs.writeFileSync(path.join(tmp, 'src', 'db.js'), "// Stub\nconst run = async (sql, params) => { globalThis.__log.push({ sql: sql.replace(/\\s+/g,' ').trim(), params }); return globalThis.__q(sql.replace(/\\s+/g,' ').trim(), params) || { rows: [], rowCount: 0 }; };\nexport const pool = { query: run, async connect() { return { query: run, release() {} }; } };\n");
const A = await import(pathToFileURL(path.join(tmp, 'src', 'controllers', 'auth.controller.js')).href);

function res() {
  return {
    code: 200, body: null, cookies: [],
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    append(k, v) { this.cookies.push([k, v]); },
  };
}
async function call(fn, body, userRow) {
  globalThis.__log = [];
  globalThis.__q = (sql) => {
    if (/FROM usuarios WHERE usuario/.test(sql)) return { rows: [userRow] };
    if (/ultimo_acceso/.test(sql)) return { rowCount: 1 };
    if (/UPDATE usuarios SET recovery_code/.test(sql)) {
      globalThis.__saved = { sql, params: null }; // params se capturan en __log
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const r = res(); let err = null;
  await fn({ params: {}, body, query: {} }, r, (e) => { err = e; });
  return { r, err, log: globalThis.__log };
}

const COD = 'TRAMA-ABC123';

// 1) Legado en texto plano: entra y MIGRA a cifrado
let t = await call(A.recuperarUsuario, { usuario: 'u1', codigo: COD },
  { id: 1, usuario: 'u1', nombre: 'U', recovery_code: COD, recovery_hash: null });
assert.equal(t.err, null, 'legado no debe dar error');
assert.equal(t.r.code, 200);
assert.equal(t.r.body.usuario, 'u1');
const upd = t.log.find((l) => /UPDATE usuarios SET recovery_code/.test(l.sql));
assert(upd, 'debe re-guardar cifrado al migrar');
assert(upd.params[0].startsWith('gcm1.'), 'recovery_code debe quedar cifrado, no en plano');
assert(!upd.params[0].includes(COD), 'el cifrado no debe contener el código legible');
const CIFRADO_REAL = upd.params[0];

// 2) Fila ya cifrada: entra sin migrar de más
t = await call(A.recuperarUsuario, { usuario: 'u1', codigo: COD },
  { id: 1, usuario: 'u1', nombre: 'U', recovery_code: CIFRADO_REAL, recovery_hash: 'x' });
assert.equal(t.err, null);
assert.equal(t.r.code, 200);
assert(!t.log.some((l) => /UPDATE usuarios SET recovery_code/.test(l.sql)), 'cifrado válido no se re-escribe');

// 3) Código erróneo con fila cifrada: 401
t = await call(A.recuperarUsuario, { usuario: 'u1', codigo: 'TRAMA-XXXXXX' },
  { id: 1, usuario: 'u1', nombre: 'U', recovery_code: CIFRADO_REAL, recovery_hash: 'x' });
assert.equal(t.r.code, 401);

// 4) Fila solo-hash (vieja): entra y migra (re-cifra lo ingresado)
import crypto from 'crypto';
const h = crypto.createHash('sha256').update(COD).digest('hex');
t = await call(A.recuperarUsuario, { usuario: 'u1', codigo: COD },
  { id: 1, usuario: 'u1', nombre: 'U', recovery_code: null, recovery_hash: h });
assert.equal(t.err, null);
assert.equal(t.r.code, 200);
assert(t.log.some((l) => /UPDATE usuarios SET recovery_code/.test(l.sql)), 'hash-only debe migrar a cifrado');

// 5) Cifrado con OTRA clave (ilegible): se rechaza, nunca se acepta como plano
t = await call(A.recuperarUsuario, { usuario: 'u1', codigo: COD },
  { id: 1, usuario: 'u1', nombre: 'U', recovery_code: 'gcm1.AAAA.BBBB.CCCC', recovery_hash: null });
assert.equal(t.r.code, 401);

// 6) Usuario inexistente: la misma respuesta que un código equivocado (no revela qué usuarios existen)
t = await call(A.recuperarUsuario, { usuario: 'nadie', codigo: COD }, undefined);
assert.equal(t.r.code, 401);
assert.equal(t.r.body.error, 'El usuario o el código de recuperación son incorrectos.');

console.log('recovery OK');
