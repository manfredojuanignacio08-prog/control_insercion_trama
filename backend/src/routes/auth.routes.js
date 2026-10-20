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

// La huella (WebAuthn) no se puede adivinar: cada intento exige el dedo y la llave del
// teléfono. Su límite es amplio. Antes compartía el de 20 cada 15 minutos con el código de
// recuperación, contado por IP: en la fábrica todos los celulares salen por el mismo router,
// y con unos diez ingresos al empezar el turno (dos pedidos cada uno) nadie más podía entrar.
const limiteHuella = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_HUELLA_MAX) || 300,
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
router.post('/registro/iniciar', limiteHuella, iniciarRegistro);
router.post('/registro/verificar', limiteHuella, verificarRegistro);

// Login con huella dactilar ya registrada (dos pasos: iniciar → verificar)
router.post('/login/iniciar', limiteHuella, iniciarLogin);
router.post('/login/verificar', limiteHuella, verificarLogin);

// Recupero de acceso con código de recuperación
router.post('/recuperar', limiteIntentos, recuperarUsuario);

// Ver el código de recuperación FIJO (estando logueado, verifica huella)
router.post('/recuperacion/ver', limiteIntentos, regenerarCodigoRecuperacion);

// Generar código de invitación para sumar un usuario nuevo (a futuro)
router.post('/invitacion', requerirOperario, generarInvitacion);

export default router;
