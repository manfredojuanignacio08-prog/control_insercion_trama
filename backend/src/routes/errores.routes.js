import express from 'express';
import * as erroresController from '../controllers/errores.controller.js';
import { requerirOperarioODispositivo } from '../middleware/auth.js';

const router = express.Router();

router.get('/', erroresController.listarErrores);
// Escriben el registro los ESP32 y los operarios; un invitado solo puede leerlo.
router.post('/', requerirOperarioODispositivo, erroresController.crearError);

export default router;
