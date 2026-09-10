// ============================================================================
//  Nivel 2, controlador
//  Endpoints que consume el firmware de selección del dibujo.
//
//  EN DESARROLLO: todavía no está montado en el servidor de producción.
// ============================================================================

import { pool } from '../db.js';
import { badRequest, notFound } from '../middleware/errorHandler.js';

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

    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, p.filas, p.columnas, p.matriz_pasadas
         FROM telares t
         JOIN patrones p ON p.id = t.patron_actual_id
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
 */
export async function reportarPasadas(req, res, next) {
  const cliente = await pool.connect();
  try {
    const telarId = Number(req.params.id);
    const { pasadas_totales, fila_actual } = req.body;

    if (!Number.isInteger(telarId)) throw badRequest('El identificador del telar debe ser un número.');
    if (!Number.isInteger(pasadas_totales) || pasadas_totales < 0) {
      throw badRequest('pasadas_totales debe ser un número entero no negativo.');
    }

    await cliente.query('BEGIN');

    // Se bloquea la fila del historial mientras se actualiza, para que dos
    // reportes seguidos no se pisen entre sí.
    const { rows } = await cliente.query(
      `SELECT id, pasadas_totales
         FROM historial_produccion
        WHERE telar_id = $1 AND estado = 'en_curso'
        ORDER BY fecha_inicio DESC
        LIMIT 1
        FOR UPDATE`,
      [telarId]
    );

    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      throw notFound('El telar no tiene una producción en curso.');
    }

    const actual = rows[0];

    // El conteo solo puede avanzar. Si llega un número menor, es que el nodo se
    // reinició y volvió a contar desde cero: se ignora en lugar de retroceder
    // el historial, que representa tela realmente tejida.
    if (pasadas_totales < actual.pasadas_totales) {
      await cliente.query('ROLLBACK');
      return res.json({
        aplicado: false,
        motivo: 'El conteo recibido es menor que el registrado: probablemente el nodo se reinició.',
        pasadas_totales: actual.pasadas_totales,
      });
    }

    await cliente.query(
      `UPDATE historial_produccion
          SET pasadas_totales = $1,
              fila_actual = COALESCE($2, fila_actual)
        WHERE id = $3`,
      [pasadas_totales, Number.isInteger(fila_actual) ? fila_actual : null, actual.id]
    );

    await cliente.query('COMMIT');
    res.json({ aplicado: true, pasadas_totales });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    cliente.release();
  }
}
