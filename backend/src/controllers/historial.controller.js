import { pool } from '../db.js';

// GET /api/historial?telar_id=&desde=&hasta=&limit=100&offset=0
// Cada fila trae pasadas_conteo (la mejor cifra: la del sensor si hay, si no la estimada por reloj)
// y origen_conteo ('estimado' | 'sensor' | 'sensor_validado'), para no mostrar como medido lo estimado.
export async function listarHistorialGlobal(req, res, next) {
  try {
    const { telar_id, desde, hasta } = req.query;
    const condiciones = [];
    const params = [];

    if (telar_id) {
      params.push(telar_id);
      condiciones.push(`h.telar_id = $${params.length}`);
    }
    if (desde) {
      params.push(desde);
      condiciones.push(`h.fecha_inicio >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      condiciones.push(`h.fecha_inicio <= $${params.length}`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    // Paginación: sin tope, el historial completo viajaba en cada pedido y crece con
    // cada producción. Por defecto 100 filas, máximo 500.
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const desplazamiento = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    params.push(limite, desplazamiento);

    const { rows } = await pool.query(
      `SELECT h.*, t.codigo AS telar_codigo, p.nombre AS patron_nombre,
              CASE WHEN h.pasadas_sensor > 0 THEN h.pasadas_sensor ELSE h.pasadas_totales END AS pasadas_conteo,
              CASE WHEN h.pasadas_sensor > 0 THEN (CASE WHEN h.conteo_validado THEN 'sensor_validado' ELSE 'sensor' END) ELSE 'estimado' END AS origen_conteo
       FROM historial_produccion h
       JOIN telares t ON t.id = h.telar_id
       JOIN patrones p ON p.id = h.patron_id
       ${where}
       ORDER BY h.fecha_inicio DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
