import express from 'express';
import * as patronesController from '../controllers/patrones.controller.js';

const router = express.Router();

router.get('/', patronesController.listarPatrones);
router.get('/:id', patronesController.obtenerPatron);
router.post('/', patronesController.crearPatron);
router.put('/:id', patronesController.actualizarPatron);
router.delete('/:id', patronesController.eliminarPatron);

export default router;
