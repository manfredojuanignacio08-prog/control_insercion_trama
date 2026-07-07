import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { pool } from '../db.js';

/**
 * Autenticación biométrica (huella dactilar) mediante WebAuthn / FIDO2.
 *
 * Cómo funciona, en criollo:
 *  - El sensor biométrico (huella o Face ID) lo lee el DISPOSITIVO del
 *    usuario, no el servidor. La biometría nunca sale del teléfono.
 *  - El dispositivo genera un par de claves (pública/privada). La privada
 *    queda protegida en el hardware; la pública se manda al servidor.
 *  - Para entrar, el dispositivo firma un "desafío" aleatorio con su clave
 *    privada (desbloqueándola con la huella dactilar). El servidor verifica esa
 *    firma con la clave pública que tenía guardada.
 *  - Resultado: el servidor confirma que es el usuario correcto SIN ver nunca
 *    su huella.
 *
 * Flujo: registro (registrar el dispositivo una vez) y login (usarlo después).
 */

// ─── Configuración del "Relying Party" (el sitio) ─────────────────────
// WebAuthn exige que el "RP ID" coincida con el dominio DESDE EL QUE SE ABRE
// la página. Si lo dejáramos fijo en "localhost", fallaría apenas se accede
// desde el celular por IP (ej. 192.168.1.50) o desde un dominio real — que
// es justo el error "The RP ID localhost is invalid for this domain".
//
// Por eso lo derivamos del propio pedido (del header Origin/Host que manda
// el navegador). Así funciona igual por localhost, por IP en la red local, o
// por un dominio con HTTPS, sin tener que configurar nada a mano.
//
// Si se quiere forzar un valor fijo (producción con dominio conocido), se
// puede definir WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN en el .env y tienen
// prioridad.
const RP_NAME = 'Control de Inserción de Trama';

function datosRP(req) {
  // 1) Si están seteadas por env, mandan esas (producción con dominio fijo).
  if (process.env.WEBAUTHN_RP_ID && process.env.WEBAUTHN_ORIGIN) {
    return { rpID: process.env.WEBAUTHN_RP_ID, origin: process.env.WEBAUTHN_ORIGIN };
  }
  // 2) Si no, se derivan del pedido. El "Origin" es la URL completa desde la
  //    que el navegador abrió la página (ej "http://192.168.1.50:3000").
  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  let rpID = 'localhost';
  try {
    rpID = new URL(origin).hostname; // el dominio/IP sin protocolo ni puerto
  } catch { /* deja localhost */ }
  return { rpID, origin };
}

const CHALLENGE_TTL_MIN = 5; // los desafíos vencen a los 5 minutos

// Helpers base64url <-> Buffer
const aB64 = (buf) => Buffer.from(buf).toString('base64url');
const deB64 = (str) => Buffer.from(str, 'base64url');

// Limpia desafíos vencidos (se llama de vez en cuando, no en cada request)
async function limpiarDesafiosVencidos() {
  await pool.query('DELETE FROM desafios_webauthn WHERE expira_at < now()');
}

// ══════════════════════════════════════════════════════════════════════
//  REGISTRO — asociar la huella dactilar de un dispositivo a un usuario
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/registro/iniciar   body: { usuario, nombre? }
 * Crea el usuario si no existe y devuelve las "opciones" que el navegador
 * necesita para pedirle la huella dactilar al usuario.
 */
export async function iniciarRegistro(req, res, next) {
  try {
    const { rpID, origin } = datosRP(req);
    const { usuario, nombre } = req.body || {};
    if (!usuario || typeof usuario !== 'string' || usuario.trim().length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
    }
    const nom = usuario.trim();

    // Buscar o crear el usuario
    let { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [nom]);
    let user = rows[0];
    if (!user) {
      const webauthnId = aB64(crypto.randomBytes(32));
      const ins = await pool.query(
        'INSERT INTO usuarios (usuario, nombre, webauthn_id) VALUES ($1, $2, $3) RETURNING *',
        [nom, nombre || null, webauthnId]
      );
      user = ins.rows[0];
    }

    // Credenciales que este usuario ya tiene (para no registrar dos veces la misma)
    const { rows: creds } = await pool.query(
      'SELECT credential_id FROM credenciales_biometricas WHERE usuario_id = $1',
      [user.id]
    );

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: deB64(user.webauthn_id),
      userName: user.usuario,
      userDisplayName: user.nombre || user.usuario,
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        // "platform" = usar el autenticador integrado del dispositivo (el
        // lector de huella dactilar del celular/notebook), no una llave USB
        // externa. El tipo concreto (huella) lo resuelve el sistema operativo;
        // en los dispositivos del proyecto el sensor integrado es de huella.
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required', // exige verificación por huella (o PIN)
      },
    });

    // Guardar el desafío para verificarlo después
    await guardarDesafio(options.challenge, 'registro', user.id);

    res.json(options);
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth/registro/verificar   body: { usuario, respuesta }
 * Recibe la respuesta firmada del dispositivo y, si es válida, guarda la
 * clave pública de esa credencial biométrica.
 */
export async function verificarRegistro(req, res, next) {
  try {
    const { rpID, origin } = datosRP(req);
    const { usuario, respuesta } = req.body || {};
    if (!usuario || !respuesta) {
      return res.status(400).json({ error: 'Faltan datos (usuario y respuesta).' });
    }

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const challenge = await tomarDesafio('registro', user.id);
    if (!challenge) return res.status(400).json({ error: 'El desafío venció o no existe. Reintentá.' });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: respuesta,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (err) {
      return res.status(400).json({ error: 'No se pudo verificar el registro: ' + err.message });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'El registro biométrico no pudo verificarse.' });
    }

    const { credential } = verification.registrationInfo;
    const tipo = verification.registrationInfo.credentialDeviceType;

    // Guardar la credencial (clave pública + contador). NUNCA hay datos
    // biométricos acá: solo la clave pública del dispositivo.
    await pool.query(
      `INSERT INTO credenciales_biometricas
         (usuario_id, credential_id, public_key, counter, tipo_dispositivo)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (credential_id) DO NOTHING`,
      [user.id, credential.id, aB64(credential.publicKey), credential.counter, tipo]
    );

    res.status(201).json({ ok: true, usuario: user.usuario });
  } catch (e) {
    next(e);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  LOGIN — entrar usando la huella dactilar ya registrada
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/login/iniciar   body: { usuario }
 * Devuelve las opciones para que el navegador pida la huella dactilar.
 */
export async function iniciarLogin(req, res, next) {
  try {
    const { rpID, origin } = datosRP(req);
    const { usuario } = req.body || {};
    if (!usuario) return res.status(400).json({ error: 'Falta el usuario.' });

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const { rows: creds } = await pool.query(
      'SELECT credential_id FROM credenciales_biometricas WHERE usuario_id = $1',
      [user.id]
    );
    if (creds.length === 0) {
      return res.status(400).json({ error: 'Este usuario no tiene ninguna huella registrada.' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
      userVerification: 'required',
    });

    await guardarDesafio(options.challenge, 'login', user.id);
    res.json(options);
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth/login/verificar   body: { usuario, respuesta }
 * Verifica la firma. Si es válida, el login es correcto.
 */
export async function verificarLogin(req, res, next) {
  try {
    const { rpID, origin } = datosRP(req);
    const { usuario, respuesta } = req.body || {};
    if (!usuario || !respuesta) {
      return res.status(400).json({ error: 'Faltan datos (usuario y respuesta).' });
    }

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const challenge = await tomarDesafio('login', user.id);
    if (!challenge) return res.status(400).json({ error: 'El desafío venció o no existe. Reintentá.' });

    // Buscar la credencial que usó el navegador
    const credId = respuesta.id;
    const { rows: credRows } = await pool.query(
      'SELECT * FROM credenciales_biometricas WHERE credential_id = $1 AND usuario_id = $2',
      [credId, user.id]
    );
    const cred = credRows[0];
    if (!cred) return res.status(400).json({ error: 'Credencial no reconocida para este usuario.' });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: respuesta,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: cred.credential_id,
          publicKey: deB64(cred.public_key),
          counter: Number(cred.counter),
        },
      });
    } catch (err) {
      return res.status(400).json({ error: 'No se pudo verificar el login: ' + err.message });
    }

    if (!verification.verified) {
      return res.status(401).json({ error: 'La verificación biométrica falló.' });
    }

    // Actualizar el contador anti-clonación y las marcas de tiempo
    await pool.query(
      'UPDATE credenciales_biometricas SET counter = $1, ultimo_uso = now() WHERE id = $2',
      [verification.authenticationInfo.newCounter, cred.id]
    );
    await pool.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [user.id]);

    res.json({ ok: true, usuario: user.usuario, nombre: user.nombre });
  } catch (e) {
    next(e);
  }
}

// ─── Helpers de desafíos ──────────────────────────────────────────────

async function guardarDesafio(challenge, tipo, usuarioId) {
  const expira = new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000);
  await pool.query(
    'INSERT INTO desafios_webauthn (challenge, tipo, usuario_id, expira_at) VALUES ($1, $2, $3, $4)',
    [challenge, tipo, usuarioId, expira]
  );
}

/**
 * Toma (y borra) el desafío más reciente de ese tipo para ese usuario. Es de
 * un solo uso: se borra al leerlo, para que no se pueda reutilizar.
 */
async function tomarDesafio(tipo, usuarioId) {
  await limpiarDesafiosVencidos();
  const { rows } = await pool.query(
    `DELETE FROM desafios_webauthn
       WHERE id = (
         SELECT id FROM desafios_webauthn
         WHERE tipo = $1 AND usuario_id = $2 AND expira_at >= now()
         ORDER BY creado_at DESC
         LIMIT 1
       )
     RETURNING challenge`,
    [tipo, usuarioId]
  );
  return rows[0]?.challenge || null;
}
