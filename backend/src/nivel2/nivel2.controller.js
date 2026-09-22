// ============================================================================
//  Nivel 2, controlador
//  Endpoints que consume el firmware de selección del dibujo (ESP32 del Nivel 2).
//  Están montados en server.js bajo /api/telares y exigen la clave de dispositivo.
// ============================================================================

import { pool } from '../db.js';
import { badRequest, notFound } from '../middleware/errorHandler.js';

// Cuánto puede bajar el conteo entre dos reportes sin que se considere un error.
// Con Retroceder el telar deshace pasadas y el contador del sensor BAJA de verdad
// (una por retroceso), así que un valor menor no siempre significa "el nodo se
// reinició". Un descenso pequeño se acepta; uno grande casi seguro es un reinicio
// del nodo que volvió a contar desde cero, y se ignora para no borrar tela tejida.
const TOLERANCIA_RETROCESO = 25;

/**
 * Devuelve la matriz del dibujo asignado a un telar.
 *
 * El firmware la descarga una sola vez al arrancar el tejido y la guarda en
 * memoria: pedirla en cada pasada sería imposible, porque a 300 pasadas por
 * minuto hay apenas 200 ms entre una y otra.
 */
export async function obtenerPatronActual(req, res, next) {
  try {
    const telarId = Number(req.params.id);
    if (!Number.isInteger(telarId)) throw badRequest('El identificador del telar debe ser un número.');

    // Se devuelve además la posición de la producción en curso. El nodo la
    // necesita al arrancar: si se reinició por un corte o por el watchdog, su
    // memoria volvió a cero y sin este dato retomaría el dibujo desde la primera
    // fila, dejando un salto visible en la tela a mitad de una pieza.
    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, p.filas, p.columnas, p.matriz_pasadas,
              h.fila_actual, h.pasadas_sensor
         FROM telares t
         JOIN patrones p ON p.id = t.patron_actual_id
         LEFT JOIN historial_produccion h
                ON h.telar_id = t.id AND h.estado = 'en_curso'
        WHERE t.id = $1`,
      [telarId]
    );

    if (rows.length === 0) {
      // No es un error: puede que el telar simplemente no tenga un dibujo
      // asignado todavía. El firmware lo interpreta y no acciona nada.
      return res.json({ asignado: false, matriz_pasadas: [] });
    }

    const p = rows[0];
    res.json({
      asignado: true,
      patron_id: p.id,
      nombre: p.nombre,
      filas: p.filas,
      columnas: p.columnas,
      matriz_pasadas: p.matriz_pasadas,
      // Posición de la producción en curso, para que el nodo retome donde quedó.
      // En null si no hay producción abierta: ahí el nodo arranca desde el principio.
      fila_actual: p.fila_actual ?? null,
      pasadas_sensor: p.pasadas_sensor ?? null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Recibe el conteo de pasadas que reporta el sensor inductivo.
 *
 * El firmware manda el acumulado, no un incremento: si se pierde un reporte por
 * un corte de red, el siguiente trae el número correcto igual. Con incrementos,
 * un reporte perdido quedaría perdido para siempre.
 *
 * Body: { pasadas_sensor, fila_actual }   (se acepta también "pasadas_totales" por
 * compatibilidad con el firmware anterior).
 *
 * Escribe en pasadas_sensor, NO en pasadas_totales: esa columna es la estimación por
 * reloj de la web, y durante la jornada de validación hay que poder comparar las dos.
 */
export async function reportarPasadas(req, res, next) {
  const cliente = await pool.connect();
  try {
    const telarId = Number(req.params.id);
    const pasadasSensor = req.body.pasadas_sensor ?? req.body.pasadas_totales;
    const { fila_actual } = req.body;

    if (!Number.isInteger(telarId)) throw badRequest('El identificador del telar debe ser un número.');
    if (!Number.isInteger(pasadasSensor) || pasadasSensor < 0) {
      throw badRequest('pasadas_sensor debe ser un número entero no negativo.');
    }

    await cliente.query('BEGIN');

    // Se bloquea la fila del historial mientras se actualiza, para que dos
    // reportes seguidos no se pisen entre sí.
    const { rows } = await cliente.query(
      `SELECT h.id, h.pasadas_sensor, p.filas
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        ORDER BY h.fecha_inicio DESC
        LIMIT 1
        FOR UPDATE OF h`,
      [telarId]
    );

    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      throw notFound('El telar no tiene una producción en curso.');
    }

    const actual = rows[0];

    // Un descenso grande casi seguro es un reinicio del nodo que volvió a contar
    // desde cero: se ignora en lugar de retroceder el historial, que representa
    // tela realmente tejida. Se devuelve el valor guardado para que el nodo se
    // reacomode a él.
    if (actual.pasadas_sensor - pasadasSensor > TOLERANCIA_RETROCESO) {
      await cliente.query('ROLLBACK');
      return res.json({
        aplicado: false,
        motivo: 'El conteo recibido es mucho menor que el registrado: probablemente el nodo se reinició.',
        pasadas_sensor: actual.pasadas_sensor,
      });
    }

    const filaValida = Number.isInteger(fila_actual) && fila_actual >= 0 && fila_actual < actual.filas
      ? fila_actual
      : null;

    await cliente.query(
      `UPDATE historial_produccion
          SET pasadas_sensor = $1,
              fila_actual = COALESCE($2, fila_actual),
              columna_actual = 0,
              pasada_actual = 0,
              vueltas_completadas = $4
        WHERE id = $3`,
      [pasadasSensor, filaValida, actual.id, Math.floor(pasadasSensor / actual.filas)]
    );

    // Heartbeat del sensor: mientras sea reciente, la web deja de avanzar por reloj.
    await cliente.query('UPDATE telares SET ultimo_reporte_sensor = now() WHERE id = $1', [telarId]);

    await cliente.query('COMMIT');
    res.json({ aplicado: true, pasadas_sensor: pasadasSensor });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    cliente.release();
  }
}
