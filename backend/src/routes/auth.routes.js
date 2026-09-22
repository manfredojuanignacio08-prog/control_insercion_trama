import { Router } from 'express';
import {
  iniciarRegistro,
  verificarRegistro,
  iniciarLogin,
  verificarLogin,
  recuperarUsuario,
  regenerarCodigoRecuperacion,
  generarInvitacion,
  estadoRegistro,
  estadoSesion,
  logout, entrarComoInvitado,
} from '../controllers/auth.controller.js';
import rateLimit from 'express-rate-limit';
import { requerirOperario } from '../middleware/auth.js';

const router = Router();

// Límite estricto para los endpoints que prueban credenciales. El código de recuperación
// tiene ~10^9 combinaciones: sin un tope de intentos se podía adivinar por fuerza bruta.
const limiteIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_INTENTOS_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.' },
});

// ¿Este navegador ya tiene sesión? / cerrar sesión
router.get('/sesion', estadoSesion);
router.post('/logout', logout);
router.post('/invitado', entrarComoInvitado);

// Estado del registro (¿abierto o requiere invitación?)
router.get('/estado-registro', estadoRegistro);

// Registro de una huella dactilar (dos pasos: iniciar → verificar)
router.post('/registro/iniciar', iniciarRegistro);
router.post('/registro/verificar', verificarRegistro);

// Login con huella dactilar ya registrada (dos pasos: iniciar → verificar)
router.post('/login/iniciar', iniciarLogin);
router.post('/login/verificar', limiteIntentos, verificarLogin);

// Recupero de acceso con código de recuperación
router.post('/recuperar', limiteIntentos, recuperarUsuario);

// Ver el código de recuperación FIJO (estando logueado, verifica huella)
router.post('/recuperacion/ver', limiteIntentos, regenerarCodigoRecuperacion);

// Generar código de invitación para sumar un usuario nuevo (a futuro)
router.post('/invitacion', requerirOperario, generarInvitacion);

export default router;
