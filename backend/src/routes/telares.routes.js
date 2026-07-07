import express from 'express';
import rateLimit from 'express-rate-limit';
import * as telaresController from '../controllers/telares.controller.js';

const router = express.Router();

// avanzar/retroceder se llaman en CADA paso de la animación de tejido
// (cada 100-500ms mientras Play está activo) — el límite general de la API
// (300 cada 15 min, pensado para uso normal) se agota en un par de minutos
// con eso. Estas dos rutas tienen su propio límite, mucho más generoso
// (hasta ~20 solicitudes por segundo sostenidas), pensado específicamente
// para esa frecuencia.
const playbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de avance/retroceso, esperá un momento.' },
});

router.get('/', telaresController.listarTelares);
router.get('/:id', telaresController.obtenerTelar);
router.post('/', telaresController.crearTelar);
router.post('/:id/asignar-patron', telaresController.asignarPatron);
router.post('/:id/detener', telaresController.detenerTelar);
router.post('/:id/avanzar', playbackLimiter, telaresController.avanzarTelar);
router.post('/:id/retroceder', playbackLimiter, telaresController.retrocederTelar);
router.get('/:id/historial', telaresController.historialPorTelar);

export default router;
