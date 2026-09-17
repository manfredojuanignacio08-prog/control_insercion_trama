import express from 'express';
import * as patronesController from '../controllers/patrones.controller.js';

const router = express.Router();

router.get('/', patronesController.listarPatrones);
router.get('/:id', patronesController.obtenerPatron);
router.post('/', patronesController.crearPatron);
router.put('/:id', patronesController.actualizarPatron);
router.put('/:id/metros-por-pasada', patronesController.actualizarMetrosPorPasada);
router.get('/:id/estadisticas', patronesController.estadisticasPatron);
router.delete('/:id', patronesController.eliminarPatron);

export default router;
