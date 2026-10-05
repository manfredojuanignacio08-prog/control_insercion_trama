import { pool } from '../db.js';
import { badRequest } from '../middleware/errorHandler.js';

// GET /api/errores?telar_id=&limit=
export async function listarErrores(req, res, next) {
  try {
    const { telar_id } = req.query;
    // Number("abc") es NaN y rompía la consulta: se valida y se acota (1 a 500).
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const params = [];
    let query = 'SELECT * FROM errores_log';
    if (telar_id) {
      params.push(telar_id);
      query += ` WHERE telar_id = $${params.length}`;
    }
    params.push(limit);
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
    // Textos acotados: sin tope, un pedido mal armado (o un equipo con un error en bucle) podía
    // guardar un registro de megas en cada aviso.
    const texto = (v, max) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);
    if (typeof titulo !== 'string' || titulo.length > 200) throw badRequest('titulo debe ser texto de hasta 200 caracteres.');
    if (!texto(mensaje, 2000)) throw badRequest('mensaje debe ser texto de hasta 2000 caracteres.');
    if (!texto(codigo, 64)) throw badRequest('codigo debe ser texto de hasta 64 caracteres.');

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
