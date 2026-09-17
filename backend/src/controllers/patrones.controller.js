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

/**
 * Guarda cuántos metros de tela avanza el telar en una pasada, para este dibujo.
 *
 * Es un dato del artículo, no del sistema: depende de la densidad del tejido y lo
 * conoce el operario. Sirve para convertir el conteo de pasadas en metros, que es
 * la unidad con la que se trabaja en la fábrica.
 */
export async function actualizarMetrosPorPasada(req, res, next) {
  try {
    const { id } = req.params;
    const { metros_por_pasada } = req.body ?? {};

    // Se admite null para volver a "sin definir".
    if (metros_por_pasada !== null) {
      const n = Number(metros_por_pasada);
      if (!Number.isFinite(n) || n <= 0 || n > 1) {
        return res.status(400).json({
          error: 'metros_por_pasada debe ser un número mayor que 0 y menor o igual a 1. Una pasada avanza milímetros, no metros: un valor típico está entre 0,0002 y 0,01.',
        });
      }
    }

    const r = await pool.query(
      `UPDATE patrones
          SET metros_por_pasada = $1,
              modificado_at = now()
        WHERE id = $2
      RETURNING id, nombre, metros_por_pasada`,
      [metros_por_pasada, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: `No existe el patrón con id ${id}.` });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Estadísticas de producción de un dibujo, calculadas sobre el historial real.
 *
 * Todo sale de pasadas efectivamente contadas, no de estimaciones. Los metros
 * solo se informan si el dibujo tiene cargado metros_por_pasada; si no, se
 * devuelven las pasadas y se avisa que falta ese dato.
 */
export async function estadisticasPatron(req, res, next) {
  try {
    const { id } = req.params;
    const p = await pool.query('SELECT id, nombre, filas, columnas, metros_por_pasada FROM patrones WHERE id = $1', [id]);
    if (p.rows.length === 0) return res.status(404).json({ error: `No existe el patrón con id ${id}.` });

    const h = await pool.query(
      `SELECT COUNT(*)::int                                   AS producciones,
              COALESCE(SUM(pasadas_totales), 0)::int          AS pasadas_totales,
              COALESCE(SUM(vueltas_completadas), 0)::int      AS repeticiones,
              COALESCE(MAX(pasadas_totales), 0)::int          AS pasadas_mayor_produccion,
              MIN(fecha_inicio)                               AS primera_vez,
              MAX(COALESCE(fecha_fin, fecha_inicio))          AS ultima_vez,
              COALESCE(SUM(
                EXTRACT(EPOCH FROM (COALESCE(fecha_fin, now()) - fecha_inicio))
              ), 0)::bigint                                   AS segundos_de_maquina
         FROM historial_produccion
        WHERE patron_id = $1`,
      [id]
    );
    const s = h.rows[0];
    const mpp = p.rows[0].metros_por_pasada === null ? null : Number(p.rows[0].metros_por_pasada);

    const out = {
      patron: { id: p.rows[0].id, nombre: p.rows[0].nombre, filas: p.rows[0].filas, columnas: p.rows[0].columnas },
      metros_por_pasada: mpp,
      producciones: s.producciones,
      pasadas_totales: s.pasadas_totales,
      repeticiones_del_dibujo: s.repeticiones,
      pasadas_mayor_produccion: s.pasadas_mayor_produccion,
      primera_vez: s.primera_vez,
      ultima_vez: s.ultima_vez,
      horas_de_maquina: Math.round((Number(s.segundos_de_maquina) / 3600) * 100) / 100,
    };

    if (mpp !== null) {
      out.metros_tejidos = Math.round(s.pasadas_totales * mpp * 100) / 100;
      out.metros_mayor_produccion = Math.round(s.pasadas_mayor_produccion * mpp * 100) / 100;
      // Cuántas pasadas entran en un metro, que es como suele pensarlo el operario.
      out.pasadas_por_metro = Math.round(1 / mpp);
    } else {
      out.aviso = 'Este dibujo todavía no tiene cargados los metros por pasada, así que no se pueden calcular los metros tejidos. Se carga desde el ícono de engranaje en el editor.';
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
}
