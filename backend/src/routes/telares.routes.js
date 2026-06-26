import express from 'express';
import * as telaresController from '../controllers/telares.controller.js';

const router = express.Router();

router.get('/', telaresController.listarTelares);
router.get('/:id', telaresController.obtenerTelar);
router.post('/', telaresController.crearTelar);
router.post('/:id/asignar-patron', telaresController.asignarPatron);
router.post('/:id/detener', telaresController.detenerTelar);
router.post('/:id/avanzar', telaresController.avanzarTelar);
router.post('/:id/retroceder', telaresController.retrocederTelar);
router.get('/:id/historial', telaresController.historialPorTelar);

export default router;
