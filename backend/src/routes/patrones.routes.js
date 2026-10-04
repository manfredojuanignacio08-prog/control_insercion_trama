import express from 'express';
import * as patronesController from '../controllers/patrones.controller.js';

const router = express.Router();

// Los ids de la URL tienen que ser enteros positivos que entren en un INTEGER de
// PostgreSQL. Así un /patrones/abc responde 400 con un mensaje claro en vez de
// llegar a la base y volver como error del servidor.
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,9}$/.test(id) || Number(id) < 1) {
    return res.status(400).json({ error: 'El id debe ser un número entero positivo.' });
  }
  next();
});

router.get('/', patronesController.listarPatrones);
router.get('/:id', patronesController.obtenerPatron);
router.post('/', patronesController.crearPatron);
router.put('/:id', patronesController.actualizarPatron);
router.put('/:id/metros-por-pasada', patronesController.actualizarMetrosPorPasada);
router.get('/:id/estadisticas', patronesController.estadisticasPatron);
router.delete('/:id', patronesController.eliminarPatron);

export default router;
