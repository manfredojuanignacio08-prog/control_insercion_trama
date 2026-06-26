import { pool } from '../db.js';

// GET /api/historial?telar_id=&desde=&hasta=
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

    const { rows } = await pool.query(
      `SELECT h.*, t.codigo AS telar_codigo, p.nombre AS patron_nombre
       FROM historial_produccion h
       JOIN telares t ON t.id = h.telar_id
       JOIN patrones p ON p.id = h.patron_id
       ${where}
       ORDER BY h.fecha_inicio DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
