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

// Registro ABIERTO y SIN LÍMITE: cualquier persona puede registrar su huella
// sin necesidad de un código de invitación. Se deja en Infinity para que
// nunca se pida invitación. (El sistema de invitaciones sigue existiendo por
// compatibilidad, pero no bloquea el registro.)
const LIMITE_LIBRE = Infinity;

// Vencimiento de un código de invitación (días).
const INVITACION_TTL_DIAS = 7;

// Helpers base64url <-> Buffer
const aB64 = (buf) => Buffer.from(buf).toString('base64url');
const deB64 = (str) => Buffer.from(str, 'base64url');

// Hash SHA-256 (para guardar códigos de recuperación e invitación sin texto plano)
const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo).trim().toUpperCase()).digest('hex');

// Genera un código legible tipo "TRAMA-4K7Q" (fácil de anotar, difícil de adivinar)
function generarCodigo(prefijo) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1 para no confundir
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
  return `${prefijo}-${s.slice(0, 3)}${s.slice(3)}`;
}

// Valida un código de invitación. Devuelve {ok, id?, motivo?}.
async function validarInvitacion(codigo) {
  if (!codigo || typeof codigo !== 'string' || !codigo.trim()) {
    return { ok: false, motivo: 'Falta el código de invitación.' };
  }
  const h = hashCodigo(codigo);
  const { rows } = await pool.query(
    'SELECT * FROM invitaciones WHERE codigo_hash = $1 AND usada = false AND expira_at >= now()',
    [h]
  );
  if (!rows[0]) return { ok: false, motivo: 'El código de invitación es inválido, ya se usó o venció.' };
  return { ok: true, id: rows[0].id };
}

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
    const { usuario, nombre, invitacion } = req.body || {};
    if (!usuario || typeof usuario !== 'string' || usuario.trim().length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
    }
    const nom = usuario.trim();

    // Buscar el usuario
    let { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [nom]);
    let user = rows[0];

    // ── Control de registro ──────────────────────────────────────────
    // Los primeros LIMITE_LIBRE usuarios se registran libres. A partir de
    // ahí (para sumar usuarios en el futuro) hace falta un código de
    // invitación válido, que cualquier usuario ya registrado puede generar.
    // No hay roles: todos los usuarios son iguales.
    if (!user) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
      const totalUsuarios = cnt[0].n;

      if (totalUsuarios >= LIMITE_LIBRE) {
        // Ya se completaron los registros libres: exigir invitación.
        const inv = await validarInvitacion(invitacion);
        if (!inv.ok) {
          return res.status(403).json({
            error: inv.motivo || 'El registro está cerrado. Necesitás un código de invitación de un usuario ya registrado.',
            requiere_invitacion: true,
          });
        }
        // marcar el id de invitación para consumirla al verificar el registro
        req._invitacionId = inv.id;
      }

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

    // ── Código de recuperación ───────────────────────────────────────
    // Si es la PRIMERA credencial de este usuario (recién se registra),
    // se genera un código de recuperación de un solo uso. Se muestra UNA
    // vez y se guarda hasheado. Sirve para entrar si la huella falla o si
    // se cambia de dispositivo.
    let recoveryCode = null;
    if (!user.recovery_hash) {
      recoveryCode = generarCodigo('TRAMA');
      await pool.query(
        'UPDATE usuarios SET recovery_hash = $1, recovery_usado = false WHERE id = $2',
        [hashCodigo(recoveryCode), user.id]
      );
    }

    // Si el registro usó un código de invitación, marcarlo como consumido.
    if (req._invitacionId) {
      await pool.query(
        'UPDATE invitaciones SET usada = true, usada_por = $1 WHERE id = $2',
        [user.id, req._invitacionId]
      );
    }

    res.status(201).json({
      ok: true,
      usuario: user.usuario,
      // El código de recuperación va SOLO en esta respuesta, una única vez.
      // El usuario debe anotarlo; no se puede volver a mostrar.
      recovery_code: recoveryCode,
    });
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

// ══════════════════════════════════════════════════════════════════════
//  RECUPERO Y GESTIÓN DE USUARIOS
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/recuperar   body: { usuario, codigo }
 * Permite volver a habilitar el registro de huella si el usuario perdió el
 * acceso (cambió de dispositivo, la huella no lee, etc.). Valida el código
 * de recuperación; si es correcto, borra las credenciales viejas para que el
 * usuario registre su huella de nuevo (en registro/iniciar + verificar).
 *
 * El código de recuperación es de un solo uso: al usarse se invalida y se
 * genera uno nuevo cuando el usuario vuelve a registrar la huella.
 */
export async function recuperarUsuario(req, res, next) {
  try {
    const { usuario, codigo } = req.body || {};
    if (!usuario || !codigo) {
      return res.status(400).json({ error: 'Faltan datos (usuario y código de recuperación).' });
    }
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (!user.recovery_hash || user.recovery_usado) {
      return res.status(400).json({ error: 'Este usuario no tiene un código de recuperación válido.' });
    }
    if (hashCodigo(codigo) !== user.recovery_hash) {
      return res.status(401).json({ error: 'El código de recuperación es incorrecto.' });
    }

    // Código correcto: borrar credenciales viejas y marcar el código como usado.
    // A partir de acá el usuario puede registrar su huella de nuevo (y recibirá
    // un código de recuperación nuevo).
    await pool.query('DELETE FROM credenciales_biometricas WHERE usuario_id = $1', [user.id]);
    await pool.query('UPDATE usuarios SET recovery_hash = NULL, recovery_usado = true WHERE id = $1', [user.id]);

    res.json({
      ok: true,
      usuario: user.usuario,
      mensaje: 'Código correcto. Ahora registrá de nuevo tu huella en este dispositivo.',
    });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth/recuperacion/regenerar   body: { usuario, respuesta }
 * Genera un NUEVO código de recuperación para un usuario que YA puede entrar
 * con su huella. Por seguridad exige verificar la huella primero (la misma
 * verificación que el login), así solo el dueño de la cuenta puede obtener un
 * código nuevo. Devuelve el código UNA sola vez (se guarda hasheado).
 *
 * Flujo desde la web: login/iniciar → startAuthentication → este endpoint.
 */
export async function regenerarCodigoRecuperacion(req, res, next) {
  try {
    const { rpID, origin } = datosRP(req);
    const { usuario, respuesta } = req.body || {};
    if (!usuario || !respuesta) {
      return res.status(400).json({ error: 'Faltan datos (usuario y verificación de huella).' });
    }

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Verificar la huella (reutiliza el desafío de tipo 'login')
    const challenge = await tomarDesafio('login', user.id);
    if (!challenge) return res.status(400).json({ error: 'El desafío venció o no existe. Reintentá.' });

    const { rows: credRows } = await pool.query(
      'SELECT * FROM credenciales_biometricas WHERE credential_id = $1 AND usuario_id = $2',
      [respuesta.id, user.id]
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
      return res.status(400).json({ error: 'No se pudo verificar la huella: ' + err.message });
    }
    if (!verification.verified) {
      return res.status(401).json({ error: 'La verificación biométrica falló.' });
    }

    // Actualizar el contador anti-clonación
    await pool.query(
      'UPDATE credenciales_biometricas SET counter = $1, ultimo_uso = now() WHERE id = $2',
      [verification.authenticationInfo.newCounter, cred.id]
    );

    // Generar y guardar el código nuevo (reemplaza cualquiera anterior)
    const recoveryCode = generarCodigo('TRAMA');
    await pool.query(
      'UPDATE usuarios SET recovery_hash = $1, recovery_usado = false WHERE id = $2',
      [hashCodigo(recoveryCode), user.id]
    );

    res.json({
      ok: true,
      usuario: user.usuario,
      recovery_code: recoveryCode, // se muestra una sola vez
    });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth/invitacion   body: { usuario }
 * Cualquier usuario ya registrado puede generar un código de invitación para
 * sumar un usuario nuevo en el futuro. Devuelve el código UNA vez (se guarda
 * hasheado). No hay roles: todos pueden invitar.
 */
export async function generarInvitacion(req, res, next) {
  try {
    const { usuario } = req.body || {};
    if (!usuario) return res.status(400).json({ error: 'Falta el usuario que genera la invitación.' });

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Verificar que quien invita tenga al menos una huella registrada (es un
    // usuario real y activo del sistema).
    const { rows: creds } = await pool.query(
      'SELECT 1 FROM credenciales_biometricas WHERE usuario_id = $1 LIMIT 1', [user.id]
    );
    if (creds.length === 0) {
      return res.status(403).json({ error: 'Solo un usuario con huella registrada puede generar invitaciones.' });
    }

    const codigo = generarCodigo('INVITAR');
    const expira = new Date(Date.now() + INVITACION_TTL_DIAS * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO invitaciones (codigo_hash, creada_por, expira_at) VALUES ($1, $2, $3)',
      [hashCodigo(codigo), user.id, expira]
    );

    res.status(201).json({
      ok: true,
      codigo,  // se muestra una sola vez
      vence: expira.toISOString(),
      mensaje: `Pasale este código a la persona nueva. Vence en ${INVITACION_TTL_DIAS} días.`,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/auth/estado-registro
 * Le dice a la web si el registro está abierto (quedan cupos libres) o si ya
 * hace falta código de invitación. Sirve para mostrar u ocultar el campo de
 * invitación en la pantalla de registro.
 */
export async function estadoRegistro(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
    const total = rows[0].n;
    res.json({
      registrados: total,
      limite_libre: null,          // sin límite
      registro_abierto: true,      // el registro siempre está abierto
      requiere_invitacion: false,  // nunca hace falta código de invitación
    });
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
