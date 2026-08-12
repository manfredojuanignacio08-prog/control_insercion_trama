import express from 'express';
import * as erroresController from '../controllers/errores.controller.js';

const router = express.Router();

router.get('/', erroresController.listarErrores);
router.post('/', erroresController.crearError);

export default router;
