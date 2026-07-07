import { pool } from '../db.js';
import { badRequest } from '../middleware/errorHandler.js';

// GET /api/errores?telar_id=&limit=
export async function listarErrores(req, res, next) {
  try {
    const { telar_id, limit = 50 } = req.query;
    const params = [];
    let query = 'SELECT * FROM errores_log';
    if (telar_id) {
      params.push(telar_id);
      query += ` WHERE telar_id = $${params.length}`;
    }
    params.push(Number(limit));
    query += ` ORDER BY creado_at DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/errores  { telar_id, titulo, mensaje, codigo }
export async function crearError(req, res, next) {
  try {
    const { telar_id, titulo, mensaje, codigo } = req.body;
    if (!titulo) throw badRequest('Falta el campo requerido: titulo.');

    const { rows } = await pool.query(
      `INSERT INTO errores_log (telar_id, titulo, mensaje, codigo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [telar_id || null, titulo, mensaje || null, codigo || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}
