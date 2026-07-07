import { Router } from 'express';
import {
  iniciarRegistro,
  verificarRegistro,
  iniciarLogin,
  verificarLogin,
} from '../controllers/auth.controller.js';

const router = Router();

// Registro de una huella/rostro (dos pasos: iniciar → verificar)
router.post('/registro/iniciar', iniciarRegistro);
router.post('/registro/verificar', verificarRegistro);

// Login con huella/rostro ya registrada (dos pasos: iniciar → verificar)
router.post('/login/iniciar', iniciarLogin);
router.post('/login/verificar', verificarLogin);

export default router;
