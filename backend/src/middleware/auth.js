// ============================================================================
//  Autenticación de la API
//
//  Hay dos tipos de quien llama, y cada uno se autentica distinto:
//
//   1) Un OPERARIO desde la web. Inicia sesión con la huella (WebAuthn) o con su
//      código de recuperación, y el servidor le entrega una cookie firmada
//      (HttpOnly, SameSite=Lax, Secure cuando la conexión es HTTPS). La cookie la
//      manda el navegador solo en cada pedido; el JavaScript de la página no puede leerla.
//
//   2) Un DISPOSITIVO (el ESP32 del Nivel 1 o del Nivel 2). No tiene navegador ni
//      huella: manda una clave compartida en el header X-Device-Key.
//
//  Sin ninguna de las dos, la API responde 401. Antes de esto, cualquier equipo de
//  la red podía hacer un POST y arrancar el telar real.
//
//  Variables de entorno:
//    SESSION_SECRET      clave para firmar las cookies (mínimo 32 caracteres).
//                        Generarla con:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//    ESP32_DEVICE_KEY    clave compartida con los ESP32 (mismo valor que DEVICE_KEY
//                        en config.h de los dos firmwares). Sin ella, los dispositivos
//                        quedan rechazados.
//    SESSION_HORAS       duración de la sesión, por defecto 12 (una jornada).
//
//  No agrega dependencias: usa solo el módulo crypto de Node.
// ============================================================================

// Se carga el .env acá mismo: este módulo lee SESSION_SECRET al importarse, y los imports se
// evalúan antes de que server.js llame a dotenv.config().
import 'dotenv/config';
import crypto from 'crypto';

const COOKIE = 'trama_sesion';
let secreto = process.env.SESSION_SECRET;
if (!secreto || secreto.length < 32) {
  // Si falta, se genera una clave al azar en cada arranque: es seguro (nadie puede
  // falsificar una cookie) pero las sesiones no sobreviven a un reinicio del servidor.
  secreto = crypto.randomBytes(32).toString('hex');
  console.warn(
    '⚠ SESSION_SECRET no está definida (o tiene menos de 32 caracteres). Se usa una clave temporal: ' +
    'los operarios tendrán que volver a iniciar sesión cada vez que se reinicie el servidor.'
  );
}

const HORAS = Number(process.env.SESSION_HORAS) > 0 ? Number(process.env.SESSION_HORAS) : 12;

const firmar = (payload) =>
  crypto.createHmac('sha256', secreto).update(payload).digest('base64url');

// Comparación en tiempo constante (evita filtrar la clave por diferencias de tiempo).
function iguales(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function leerCookie(req, nombre) {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

/** Devuelve { usuario, nombre } si el pedido trae una cookie de sesión válida; si no, null. */
export function leerSesion(req) {
  const valor = leerCookie(req, COOKIE);
  if (!valor) return null;
  const [cuerpo, firma] = valor.split('.');
  if (!cuerpo || !firma || !iguales(firma, firmar(cuerpo))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf-8'));
    if (!datos.u || !datos.exp || Date.now() > datos.exp) return null;
    const sesion = { usuario: datos.u, nombre: datos.n || datos.u };
    if (datos.i === 1) sesion.invitado = true;   // solo las sesiones sin cuenta llevan la marca
    return sesion;
  } catch {
    return null;
  }
}

function conexionSegura(req) {
  // req.secure depende de "trust proxy" (ver server.js): detrás de Render/Nginx el
  // servidor ve HTTP plano y el proxy avisa el protocolo real en X-Forwarded-Proto.
  return Boolean(req.secure) || req.headers?.['x-forwarded-proto'] === 'https';
}

/** Entrega la cookie de sesión al usuario que acaba de autenticarse. */
export function emitirSesion(req, res, { usuario, nombre, invitado = false }) {
  const exp = Date.now() + HORAS * 3600 * 1000;
  const datos = { u: usuario, n: nombre || usuario, exp };
  if (invitado) datos.i = 1;   // sesión de invitado: puede mirar y diseñar, no comandar el telar
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const valor = `${cuerpo}.${firmar(cuerpo)}`;
  const partes = [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${HORAS * 3600}`,
  ];
  // Secure solo si la conexión ES segura. Forzarlo por NODE_ENV=production rompía el uso
  // en una red local por http://: el navegador descarta una cookie Secure recibida por HTTP
  // y nadie podía mantener la sesión (ni siquiera con el código de recuperación).
  if (conexionSegura(req)) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

export function cerrarSesion(req, res) {
  const partes = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (conexionSegura(req)) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

/** true si el pedido trae una clave de dispositivo válida. */
export function esDispositivoValido(req) {
  const esperada = process.env.ESP32_DEVICE_KEY;
  if (!esperada) return false;                 // sin clave configurada, ningún dispositivo entra
  const enviada = req.headers?.['x-device-key'];
  return typeof enviada === 'string' && iguales(enviada, esperada);
}

const noAutenticado = (res, mensaje) =>
  res.status(401).json({ error: mensaje, codigo: 'NO_AUTENTICADO' });

/** Solo operarios con sesión (acciones que dispara una persona desde la web). */
export function requerirSesion(req, res, next) {
  const s = leerSesion(req);
  if (!s) return noAutenticado(res, 'Tenés que iniciar sesión.');
  req.usuario = s;
  next();
}

/**
 * Solo operarios registrados: las acciones que mueven la máquina real (marcha,
 * pausa, avanzar, retroceder, asignar un dibujo, validar el conteo) y dar acceso
 * a otras personas.
 *
 * El modo invitado existe para que alguien pueda recorrer la aplicación y diseñar
 * dibujos sin registrar una huella (por ejemplo en una presentación). Pero un
 * telar industrial no puede quedar comandado por cualquiera que abra la página:
 * el invitado mira y dibuja, y para operar la máquina hay que iniciar sesión.
 */
export function requerirOperario(req, res, next) {
  const s = leerSesion(req);
  if (!s) return noAutenticado(res, 'Tenés que iniciar sesión.');
  if (s.invitado) {
    return res.status(403).json({
      error: 'Estás como invitado: para controlar el telar hay que iniciar sesión con tu huella o tu código.',
      codigo: 'SOLO_OPERARIO',
    });
  }
  req.usuario = s;
  next();
}

/** Solo dispositivos (ESP32): avisos que solo tiene sentido que mande el hardware. */
export function requerirDispositivo(req, res, next) {
  if (!esDispositivoValido(req)) return noAutenticado(res, 'Clave de dispositivo inválida o ausente.');
  req.esDispositivo = true;
  next();
}

/** Operario con sesión O dispositivo con clave (lecturas que hacen los dos). */
export function requerirSesionODispositivo(req, res, next) {
  if (esDispositivoValido(req)) { req.esDispositivo = true; return next(); }
  const s = leerSesion(req);
  if (s) { req.usuario = s; return next(); }
  return noAutenticado(res, 'Tenés que iniciar sesión (o mandar la clave del dispositivo).');
}
