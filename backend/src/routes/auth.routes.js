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
} from '../controllers/auth.controller.js';

const router = Router();

// Estado del registro (¿abierto o requiere invitación?)
router.get('/estado-registro', estadoRegistro);

// Registro de una huella dactilar (dos pasos: iniciar → verificar)
router.post('/registro/iniciar', iniciarRegistro);
router.post('/registro/verificar', verificarRegistro);

// Login con huella dactilar ya registrada (dos pasos: iniciar → verificar)
router.post('/login/iniciar', iniciarLogin);
router.post('/login/verificar', verificarLogin);

// Recupero de acceso con código de recuperación
router.post('/recuperar', recuperarUsuario);

// Regenerar un código de recuperación nuevo (estando logueado, verifica huella)
router.post('/recuperacion/regenerar', regenerarCodigoRecuperacion);

// Generar código de invitación para sumar un usuario nuevo (a futuro)
router.post('/invitacion', generarInvitacion);

export default router;
