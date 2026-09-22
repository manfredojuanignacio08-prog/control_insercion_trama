// ============================================================================
//  Nivel 2, rutas
//  Montadas en server.js bajo /api/telares. Las llama el ESP32 del Nivel 2, con
//  la clave de dispositivo (X-Device-Key).
// ============================================================================

import { Router } from 'express';
import { obtenerPatronActual, reportarPasadas } from './nivel2.controller.js';
import { requerirDispositivo } from '../middleware/auth.js';

const router = Router();

router.get('/:id/patron-actual', obtenerPatronActual);
// Solo el hardware reporta pasadas: una persona no debería poder falsear el conteo.
router.post('/:id/pasadas', requerirDispositivo, reportarPasadas);

export default router;
