// ============================================================================
//  Nivel 2, rutas
//  EN DESARROLLO: no montadas en el servidor de producción.
//  Para habilitarlas, ver backend/src/nivel2/README.md
// ============================================================================

import { Router } from 'express';
import { obtenerPatronActual, reportarPasadas } from './nivel2.controller.js';

const router = Router();

router.get('/:id/patron-actual', obtenerPatronActual);
router.post('/:id/pasadas', reportarPasadas);

export default router;
