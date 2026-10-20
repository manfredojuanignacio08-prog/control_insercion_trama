// ============================================================================
//  Códigos y claves que se guardan en la base sin texto plano
//
//  - hashCodigo: SHA-256 del código en mayúsculas. Sirve para BUSCAR un código que alguien
//    escribe (recuperación, invitación, clave de un cliente) sin guardarlo legible.
//  - cifrarCodigo / descifrarCodigo: AES-256-GCM con RECOVERY_SECRET del .env. Para los códigos
//    que hay que poder VOLVER A MOSTRAR (el de recuperación de cada operario y la clave de cada
//    cliente). Un volcado de la base no alcanza para leerlos: hace falta además esa variable.
//
//  En producción sin RECOVERY_SECRET el servidor no arranca (lo verifica auth.controller.js);
//  en desarrollo y en las pruebas se usa una clave temporal del proceso, con aviso.
// ============================================================================
import crypto from 'crypto';

export const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo).trim().toUpperCase()).digest('hex');

function claveRecovery() {
  const s = process.env.RECOVERY_SECRET;
  if (s && s.length >= 16) return crypto.createHash('sha256').update(s).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RECOVERY_SECRET no está definida (mínimo 16 caracteres). Definila en el .env.');
  }
  if (!globalThis.__recoveryTmp) {
    globalThis.__recoveryTmp = crypto.randomBytes(32);
    console.warn('⚠ RECOVERY_SECRET no definida: cifrado de recuperación temporal (solo desarrollo/test).');
  }
  return globalThis.__recoveryTmp;
}

export function cifrarCodigo(codigo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', claveRecovery(), iv);
  const enc = Buffer.concat([c.update(String(codigo), 'utf8'), c.final()]);
  return `gcm1.${iv.toString('base64url')}.${enc.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}

// Devuelve: el código (string) si es cifrado válido; null si es texto
// plano legado; undefined si es cifrado pero ilegible (otra clave).
export function descifrarCodigo(guardado) {
  const partes = String(guardado || '').split('.');
  if (partes.length !== 4 || partes[0] !== 'gcm1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', claveRecovery(), Buffer.from(partes[1], 'base64url'));
    d.setAuthTag(Buffer.from(partes[3], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(partes[2], 'base64url')), d.final()]).toString('utf8');
  } catch { return undefined; }
}

// Sin I, O, 0 ni 1: no se confunden al dictarlos o anotarlos.
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function letrasAlAzar(n) {
  // 256 no es múltiplo de 32, pero 32 sí divide 256: el módulo no introduce sesgo.
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += LETRAS[bytes[i] % LETRAS.length];
  return s;
}

// Código legible tipo "TRAMA-K7QX4A": 6 caracteres (recuperación e invitaciones).
export function generarCodigo(prefijo) {
  return `${prefijo}-${letrasAlAzar(6)}`;
}

// Clave de un cliente para ver su tejido: "TEJ-K7QX-4AMP", 8 caracteres al azar (32^8, más de un
// billón de combinaciones). Se escribe una sola vez y queda guardada en el navegador del cliente.
export function generarClaveCliente() {
  const s = letrasAlAzar(8);
  return `TEJ-${s.slice(0, 4)}-${s.slice(4)}`;
}

// La clave que escribe el cliente, sin espacios, guiones ni minúsculas: "tej k7qx 4amp" sirve igual.
export function normalizarClaveCliente(clave) {
  return String(clave ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const hashClaveCliente = (clave) => hashCodigo(normalizarClaveCliente(clave));
