import express from 'express';
import rateLimit from 'express-rate-limit';
import * as clienteController from '../controllers/cliente.controller.js';

const router = express.Router();

// Las claves de los clientes tienen más de un billón de combinaciones, y además se limita cuántas
// veces se puede probar desde una misma IP. Solo cuentan los intentos fallidos: un cliente que
// entra bien no gasta su cupo.
const limiteClaves = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CLIENTE_INTENTOS_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos con claves que no andan. Esperá unos minutos antes de volver a probar.' },
});

// Rutas públicas: cada una verifica la clave o la cookie del cliente (no hay sesión de operario).
router.post('/entrar', limiteClaves, clienteController.entrarCliente);
router.post('/salir', clienteController.salirCliente);
router.get('/tejido', clienteController.tejidoCliente);

export default router;
