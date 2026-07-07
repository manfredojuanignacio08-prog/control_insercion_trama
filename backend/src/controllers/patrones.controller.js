import { pool } from '../db.js';
import { derivarLigamentoDesdePasadas } from '../utils/ligamento.js';
import { validarPatron } from '../utils/validacion.js';
import { notFound, badRequest } from '../middleware/errorHandler.js';

// GET /api/patrones?buscar=texto
export async function listarPatrones(req, res, next) {
  try {
    const { buscar } = req.query;
    const params = [];
    let query = 'SELECT * FROM patrones';
    if (buscar) {
      query += ' WHERE nombre ILIKE $1';
      params.push(`%${buscar}%`);
    }
    query += ' ORDER BY modificado_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/patrones/:id
export async function obtenerPatron(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM patrones WHERE id = $1', [req.params.id]);
    if (rows.length === 0) throw notFound(`No existe el patrón con id ${req.params.id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/patrones
export async function crearPatron(req, res, next) {
  try {
    const { nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata } = req.body;

    const errores = validarPatron(req.body);
    if (errores.length) throw badRequest(errores.join(' '));

    const ligamento = matriz_ligamento ?? derivarLigamentoDesdePasadas(matriz_pasadas);

    const { rows } = await pool.query(
      `INSERT INTO patrones (nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        nombre,
        filas,
        columnas,
        JSON.stringify(matriz_pasadas),
        ligamento ? JSON.stringify(ligamento) : null,
        colores_filas ? JSON.stringify(colores_filas) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// PUT /api/patrones/:id
export async function actualizarPatron(req, res, next) {
  try {
    const { id } = req.params;
    const { nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata } = req.body;

    const errores = validarPatron(req.body);
    if (errores.length) throw badRequest(errores.join(' '));

    const ligamento = matriz_ligamento ?? derivarLigamentoDesdePasadas(matriz_pasadas);

    const { rows } = await pool.query(
      `UPDATE patrones
         SET nombre = $1, filas = $2, columnas = $3, matriz_pasadas = $4,
             matriz_ligamento = $5, colores_filas = $6, metadata = $7
       WHERE id = $8
       RETURNING *`,
      [
        nombre,
        filas,
        columnas,
        JSON.stringify(matriz_pasadas),
        ligamento ? JSON.stringify(ligamento) : null,
        colores_filas ? JSON.stringify(colores_filas) : null,
        metadata ? JSON.stringify(metadata) : null,
        id,
      ]
    );

    if (rows.length === 0) throw notFound(`No existe el patrón con id ${id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/patrones/:id
export async function eliminarPatron(req, res, next) {
  try {
    const { rows } = await pool.query('DELETE FROM patrones WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) throw notFound(`No existe el patrón con id ${req.params.id}.`);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
