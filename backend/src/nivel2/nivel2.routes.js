// ============================================================================
//  Nivel 2, rutas
//  Montadas en server.js bajo /api/telares. Las llama el ESP32 del Nivel 2, con
//  la clave de dispositivo (X-Device-Key).
// ============================================================================

import { Router } from 'express';
import { obtenerPatronActual, reportarPasadas } from './nivel2.controller.js';
import { requerirDispositivo } from '../middleware/auth.js';

const router = Router();

// Los ids de la URL tienen que ser enteros positivos que entren en un INTEGER de
// PostgreSQL. Así un /patrones/abc responde 400 con un mensaje claro en vez de
// llegar a la base y volver como error del servidor.
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,9}$/.test(id) || Number(id) < 1) {
    return res.status(400).json({ error: 'El id debe ser un número entero positivo.' });
  }
  next();
});

router.get('/:id/patron-actual', obtenerPatronActual);
// Solo el hardware reporta pasadas: una persona no debería poder falsear el conteo.
router.post('/:id/pasadas', requerirDispositivo, reportarPasadas);

export default router;
