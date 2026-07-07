import { pool } from '../db.js';
import { notFound, badRequest, conflict } from '../middleware/errorHandler.js';
import { avanzarPosicionTejido, retrocederPosicionTejido } from '../utils/posicion.js';

// GET /api/telares
export async function listarTelares(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.nombre AS patron_actual_nombre,
              h.id AS historial_actual_id, h.fila_actual, h.columna_actual,
              h.pasada_actual, h.vueltas_completadas, h.pasadas_totales AS pasadas_actuales
       FROM telares t
       LEFT JOIN patrones p ON p.id = t.patron_actual_id
       LEFT JOIN historial_produccion h ON h.telar_id = t.id AND h.estado = 'en_curso'
       ORDER BY t.codigo`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/telares/:id
export async function obtenerTelar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.nombre AS patron_actual_nombre,
              h.id AS historial_actual_id, h.fila_actual, h.columna_actual,
              h.pasada_actual, h.vueltas_completadas, h.pasadas_totales AS pasadas_actuales
       FROM telares t
       LEFT JOIN patrones p ON p.id = t.patron_actual_id
       LEFT JOIN historial_produccion h ON h.telar_id = t.id AND h.estado = 'en_curso'
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${req.params.id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares  { codigo, nombre }
export async function crearTelar(req, res, next) {
  try {
    const { codigo, nombre } = req.body;
    if (!codigo) throw badRequest('Falta el campo requerido: codigo.');

    const { rows } = await pool.query(
      `INSERT INTO telares (codigo, nombre) VALUES ($1, $2) RETURNING *`,
      [codigo, nombre || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/asignar-patron  { patron_id }
// Si el telar ya tenía una producción en curso, la cierra como "detenido_manual"
// antes de abrir la nueva. La posición arranca siempre en (fila 0, columna 0, pasada 0).
export async function asignarPatron(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { patron_id } = req.body;
    if (!patron_id) throw badRequest('Falta el campo requerido: patron_id.');

    await client.query('BEGIN');

    const telar = await client.query('SELECT * FROM telares WHERE id = $1 FOR UPDATE', [id]);
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    const patron = await client.query('SELECT id FROM patrones WHERE id = $1', [patron_id]);
    if (patron.rows.length === 0) throw notFound(`No existe el patrón con id ${patron_id}.`);

    // Cierra cualquier producción en curso previa de este telar
    await client.query(
      `UPDATE historial_produccion
         SET fecha_fin = now(), estado = 'detenido_manual'
       WHERE telar_id = $1 AND estado = 'en_curso'`,
      [id]
    );

    await client.query(
      `UPDATE telares SET patron_actual_id = $1, estado = 'tejiendo' WHERE id = $2`,
      [patron_id, id]
    );

    const nuevoHistorial = await client.query(
      `INSERT INTO historial_produccion
         (telar_id, patron_id, estado, fila_actual, columna_actual, pasada_actual)
       VALUES ($1, $2, 'en_curso', 0, 0, 0)
       RETURNING *`,
      [id, patron_id]
    );

    await client.query('COMMIT');
    res.status(201).json(nuevoHistorial.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/telares/:id/detener  { pasadas_totales, alertas_disparadas }
export async function detenerTelar(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { pasadas_totales, alertas_disparadas = 0 } = req.body;

    await client.query('BEGIN');

    const enCurso = await client.query(
      `SELECT * FROM historial_produccion WHERE telar_id = $1 AND estado = 'en_curso' FOR UPDATE`,
      [id]
    );
    if (enCurso.rows.length === 0) {
      throw conflict(`El telar ${id} no tiene una producción en curso.`);
    }

    // Si no se manda pasadas_totales explícito, conserva el contador que ya
    // se fue acumulando con /avanzar (no lo pisa con 0).
    const totalFinal = Number.isInteger(pasadas_totales) ? pasadas_totales : enCurso.rows[0].pasadas_totales;

    const historialActualizado = await client.query(
      `UPDATE historial_produccion
         SET fecha_fin = now(), pasadas_totales = $1, alertas_disparadas = $2, estado = 'finalizado'
       WHERE id = $3
       RETURNING *`,
      [totalFinal, alertas_disparadas, enCurso.rows[0].id]
    );

    await client.query(
      `UPDATE telares SET patron_actual_id = NULL, estado = 'apagado' WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    res.json(historialActualizado.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/telares/:id/avanzar  { pasos? }
// Avanza la posición de tejido (pensado para que lo llame el ESP32 cuando
// reporta pasadas físicas completadas). "pasos" permite reportar varias de
// una sola vez, para no llamar a la base de datos en cada pasada individual.
// El patrón no tiene "final": al llegar a la última celda, vuelve a la fila 0
// y sigue (igual que la simulación del editor) — por eso no hay "completado",
// en cambio se informa vueltas_completadas si dio una vuelta entera o más.
export async function avanzarTelar(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const pasos = Number.isInteger(req.body.pasos) && req.body.pasos > 0 ? req.body.pasos : 1;

    await client.query('BEGIN');

    const existeTelar = await client.query('SELECT id FROM telares WHERE id = $1', [id]);
    if (existeTelar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    const enCurso = await client.query(
      `SELECT h.*, p.matriz_pasadas
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        FOR UPDATE OF h`,
      [id]
    );
    if (enCurso.rows.length === 0) {
      throw conflict(`El telar ${id} no tiene una producción en curso.`);
    }

    const row = enCurso.rows[0];
    const { fila_actual, columna_actual, pasada_actual, vueltas_completadas } = avanzarPosicionTejido(
      row.fila_actual,
      row.columna_actual,
      row.pasada_actual,
      row.matriz_pasadas,
      pasos
    );

    const actualizado = await client.query(
      `UPDATE historial_produccion
         SET fila_actual = $1, columna_actual = $2, pasada_actual = $3,
             vueltas_completadas = vueltas_completadas + $4,
             pasadas_totales = pasadas_totales + $5
       WHERE id = $6
       RETURNING *`,
      [fila_actual, columna_actual, pasada_actual, vueltas_completadas, pasos, row.id]
    );

    await client.query('COMMIT');
    res.json(actualizado.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/telares/:id/retroceder  { pasos? }
// El "volver atrás" pedido por el equipo: retrocede la posición sin
// reconstruir nada, usando fila_actual/columna_actual ya guardados.
// Es un espejo de rollback() en el frontend: retrocede una celda completa
// (no importa en qué pasada estaba), y esa celda se retoma desde 0.
export async function retrocederTelar(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const pasos = Number.isInteger(req.body.pasos) && req.body.pasos > 0 ? req.body.pasos : 1;

    await client.query('BEGIN');

    const existeTelar = await client.query('SELECT id FROM telares WHERE id = $1', [id]);
    if (existeTelar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    const enCurso = await client.query(
      `SELECT h.*, p.columnas
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        FOR UPDATE OF h`,
      [id]
    );
    if (enCurso.rows.length === 0) {
      throw conflict(`El telar ${id} no tiene una producción en curso.`);
    }

    const row = enCurso.rows[0];
    const { fila_actual, columna_actual, pasada_actual, al_inicio } = retrocederPosicionTejido(
      row.fila_actual,
      row.columna_actual,
      row.columnas,
      pasos
    );

    const actualizado = await client.query(
      `UPDATE historial_produccion
         SET fila_actual = $1, columna_actual = $2, pasada_actual = $3,
             pasadas_totales = GREATEST(pasadas_totales - $4, 0)
       WHERE id = $5
       RETURNING *`,
      [fila_actual, columna_actual, pasada_actual, pasos, row.id]
    );

    await client.query('COMMIT');
    res.json({ ...actualizado.rows[0], al_inicio });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/telares/:id/historial
export async function historialPorTelar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, p.nombre AS patron_nombre
       FROM historial_produccion h
       JOIN patrones p ON p.id = h.patron_id
       WHERE h.telar_id = $1
       ORDER BY h.fecha_inicio DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
