import express from 'express';
import * as historialController from '../controllers/historial.controller.js';

const router = express.Router();

router.get('/', historialController.listarHistorialGlobal);

export default router;
