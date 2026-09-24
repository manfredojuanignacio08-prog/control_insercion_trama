import express from 'express';
import rateLimit from 'express-rate-limit';
import * as telaresController from '../controllers/telares.controller.js';
import { requerirSesion, requerirOperario, requerirDispositivo } from '../middleware/auth.js';

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

// avanzar/retroceder se llaman en CADA paso de la animación de tejido
// (cada 100-500ms mientras Play está activo), el límite general de la API
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

// Quién puede llamar cada ruta (server.js ya exige sesión o clave de dispositivo en todas):
//   - lecturas (GET): operario con sesión o dispositivo. El ESP32 sondea GET /:id.
//   - acciones que dispara una persona desde la web: solo con sesión (requerirSesion).
//   - avisos que solo manda el hardware (evento-fisico): solo con clave de dispositivo.
router.get('/', telaresController.listarTelares);
router.get('/:id', telaresController.obtenerTelar);
router.post('/', requerirOperario, telaresController.crearTelar);
router.post('/:id/asignar-patron', requerirOperario, telaresController.asignarPatron);
router.post('/:id/detener', requerirOperario, telaresController.detenerTelar);
// Pausa/reanudación: conservan la producción y el patrón (a diferencia de
// /detener, que cierra el trabajo y desasigna el patrón).
router.post('/:id/pausar', requerirOperario, telaresController.pausarTelar);
router.post('/:id/reanudar', requerirOperario, telaresController.reanudarTelar);
router.post('/:id/avanzar', requerirOperario, playbackLimiter, telaresController.avanzarTelar);
router.post('/:id/retroceder', requerirOperario, playbackLimiter, telaresController.retrocederTelar);
// Botón físico real del telar (Retroceder). A diferencia de la ruta de
// arriba (llamada en cada paso de la animación), esta es una acción
// puntual que el operador dispara a mano de vez en cuando, no necesita
// el límite generoso de playbackLimiter, con el general de la API alcanza.
router.post('/:id/retroceder-fisico', requerirOperario, telaresController.retrocederFisico);
// Sensado (no control) de los botones y del sensor: el ESP32 avisa un uso manual
// o que la máquina dejó de dar pulsos, y el operario confirma la posición real
// cuando la revisó.
router.post('/:id/evento-fisico', requerirDispositivo, telaresController.eventoFisico);
router.post('/:id/confirmar-posicion', requerirOperario, telaresController.confirmarPosicion);
// El operario da por bueno el conteo del sensor tras compararlo con el contador
// mecánico del telar durante una jornada completa.
router.post('/:id/validar-conteo', requerirOperario, telaresController.validarConteo);
router.get('/:id/historial', requerirSesion, telaresController.historialPorTelar);

export default router;
