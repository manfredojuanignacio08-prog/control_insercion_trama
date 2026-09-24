import { pool } from '../db.js';
import { derivarLigamentoDesdePasadas } from '../utils/ligamento.js';
import { validarPatron } from '../utils/validacion.js';
import { notFound, badRequest, conflict } from '../middleware/errorHandler.js';


// GET /api/patrones?buscar=texto&limit=500&offset=0
// Con límite (por defecto 500, máximo 1000) para que la respuesta no crezca sin tope
// a medida que se guardan dibujos.
export async function listarPatrones(req, res, next) {
  try {
    const { buscar } = req.query;
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
    const desplazamiento = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const params = [];
    let query = 'SELECT * FROM patrones';
    if (buscar) {
      query += ' WHERE nombre ILIKE $1';
      params.push(`%${buscar}%`);
    }
    params.push(limite, desplazamiento);
    query += ` ORDER BY modificado_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
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
    const { nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata, repeticiones_por_fila } = req.body;

    const errores = validarPatron(req.body);
    if (errores.length) throw badRequest(errores.join(' '));

    const ligamento = matriz_ligamento ?? derivarLigamentoDesdePasadas(matriz_pasadas);

    const { rows } = await pool.query(
      `INSERT INTO patrones (nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata, repeticiones_por_fila)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        nombre,
        filas,
        columnas,
        JSON.stringify(matriz_pasadas),
        ligamento ? JSON.stringify(ligamento) : null,
        colores_filas ? JSON.stringify(colores_filas) : null,
        metadata ? JSON.stringify(metadata) : null,
        // En null, el telar teje una pasada por fila: el comportamiento de siempre.
        repeticiones_por_fila ?? null,
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
    const { nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata, repeticiones_por_fila } = req.body;

    const errores = validarPatron(req.body);
    if (errores.length) throw badRequest(errores.join(' '));

    // Un dibujo que se está tejiendo (o quedó pausado con la producción abierta) no
    // puede cambiar de forma ni de contenido: fila_actual quedaría fuera de rango, y
    // con el Nivel 2 instalado la tela saldría con un dibujo distinto al pedido, sin
    // aviso. Nombre, colores y metadatos sí se pueden cambiar. Para modificar la
    // matriz hay que detener el trabajo primero (eso libera el dibujo).
    const actual = await pool.query(
      `SELECT filas, columnas, matriz_pasadas,
              date_trunc('milliseconds', modificado_at) AS version
         FROM patrones WHERE id = $1`, [id]);
    if (actual.rows.length === 0) throw notFound(`No existe el patrón con id ${id}.`);

    // Control de versión optimista. La web manda la fecha de modificación que tenía
    // cuando cargó (o guardó por última vez) el dibujo. Si no coincide, otra persona
    // lo cambió mientras tanto, y guardar pisaría ese cambio sin aviso. El campo es
    // opcional: un pedido que no lo trae se comporta como antes.
    const { version_esperada } = req.body;
    if (version_esperada) {
      const esperada = new Date(version_esperada).getTime();
      if (!Number.isFinite(esperada)) throw badRequest('version_esperada no es una fecha válida.');
      if (new Date(actual.rows[0].version).getTime() !== esperada) {
        throw conflict(
          'Otra persona modificó este dibujo mientras lo editabas. Se cargó la versión más reciente.',
          'DIBUJO_MODIFICADO'
        );
      }
    }
    const previo = actual.rows[0];
    const cambiaForma =
      previo.filas !== filas ||
      previo.columnas !== columnas ||
      JSON.stringify(previo.matriz_pasadas) !== JSON.stringify(matriz_pasadas);
    if (cambiaForma) {
      const enUso = await pool.query(
        `SELECT t.codigo
           FROM telares t
           JOIN historial_produccion h ON h.telar_id = t.id AND h.estado = 'en_curso'
          WHERE t.patron_actual_id = $1 AND h.patron_id = $1`,
        [id]
      );
      if (enUso.rows.length > 0) {
        throw conflict(
          `Este dibujo se está tejiendo en ${enUso.rows.map((r) => r.codigo).join(', ')}: no se puede modificar su matriz mientras la producción esté abierta. Detené el trabajo primero.`,
          'PATRON_EN_PRODUCCION'
        );
      }
    }

    const ligamento = matriz_ligamento ?? derivarLigamentoDesdePasadas(matriz_pasadas);

    const { rows } = await pool.query(
      `UPDATE patrones
         SET nombre = $1, filas = $2, columnas = $3, matriz_pasadas = $4,
             matriz_ligamento = $5, colores_filas = $6, metadata = $7,
             repeticiones_por_fila = $9
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
        repeticiones_por_fila ?? null,
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
      RETURNING id, nombre, metros_por_pasada, modificado_at`,
      [metros_por_pasada, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: `No existe el patrón con id ${id}.` });
    res.json(r.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Estadísticas de producción de un dibujo, calculadas sobre el historial.
 *
 * OJO con qué significa cada número. Hasta que el sensor de pasada (Nivel 2) esté
 * instalado, las pasadas de cada producción salen del reloj de la web, no de la
 * máquina: son una ESTIMACIÓN. Convertirlas en "metros tejidos" sin decirlo daría
 * una falsa sensación de exactitud. Por eso:
 *
 *   - pasadas_estimadas → producciones sin sensor (conteo por reloj)
 *   - pasadas_medidas   → producciones con sensor (pasadas_sensor)
 *   - pasadas_validadas → las medidas cuyo conteo se validó contra el contador mecánico
 *   - pasadas_totales   → la mejor cifra disponible de cada producción (sensor si hay, si no reloj)
 *   - precision_conteo  → 'estimado' | 'sensor' | 'sensor_validado' | 'mixto'
 *
 * Los metros solo se informan si el dibujo tiene cargado metros_por_pasada, y llevan
 * metros_son_estimados = true salvo que TODO el conteo esté validado.
 */
export async function estadisticasPatron(req, res, next) {
  try {
    const { id } = req.params;
    const p = await pool.query('SELECT id, nombre, filas, columnas, metros_por_pasada FROM patrones WHERE id = $1', [id]);
    if (p.rows.length === 0) return res.status(404).json({ error: `No existe el patrón con id ${id}.` });

    const h = await pool.query(
      `SELECT COUNT(*)::int                                            AS producciones,
              COUNT(*) FILTER (WHERE pasadas_sensor > 0)::int          AS producciones_con_sensor,
              COUNT(*) FILTER (WHERE pasadas_sensor > 0 AND conteo_validado)::int AS producciones_validadas,
              COALESCE(SUM(pasadas_totales) FILTER (WHERE pasadas_sensor = 0), 0)::int AS pasadas_estimadas,
              COALESCE(SUM(pasadas_sensor), 0)::int                    AS pasadas_medidas,
              COALESCE(SUM(pasadas_sensor) FILTER (WHERE conteo_validado), 0)::int AS pasadas_validadas,
              COALESCE(SUM(CASE WHEN pasadas_sensor > 0 THEN pasadas_sensor ELSE pasadas_totales END), 0)::int AS pasadas_totales,
              COALESCE(MAX(CASE WHEN pasadas_sensor > 0 THEN pasadas_sensor ELSE pasadas_totales END), 0)::int AS pasadas_mayor_produccion,
              COALESCE(SUM(vueltas_completadas), 0)::int               AS repeticiones,
              MIN(fecha_inicio)                                        AS primera_vez,
              MAX(COALESCE(fecha_fin, fecha_inicio))                   AS ultima_vez,
              COALESCE(SUM(
                EXTRACT(EPOCH FROM (COALESCE(fecha_fin, now()) - fecha_inicio))
              ), 0)::bigint                                            AS segundos_de_maquina
         FROM historial_produccion
        WHERE patron_id = $1`,
      [id]
    );
    const s = h.rows[0];
    const mpp = p.rows[0].metros_por_pasada === null ? null : Number(p.rows[0].metros_por_pasada);

    let precision = 'estimado';
    if (s.producciones_con_sensor > 0) {
      if (s.producciones_con_sensor === s.producciones) {
        precision = s.producciones_validadas === s.producciones_con_sensor ? 'sensor_validado' : 'sensor';
      } else {
        precision = 'mixto';
      }
    }

    const out = {
      patron: { id: p.rows[0].id, nombre: p.rows[0].nombre, filas: p.rows[0].filas, columnas: p.rows[0].columnas },
      metros_por_pasada: mpp,
      producciones: s.producciones,
      pasadas_totales: s.pasadas_totales,
      pasadas_estimadas: s.pasadas_estimadas,
      pasadas_medidas: s.pasadas_medidas,
      pasadas_validadas: s.pasadas_validadas,
      precision_conteo: precision,
      repeticiones_del_dibujo: s.repeticiones,
      pasadas_mayor_produccion: s.pasadas_mayor_produccion,
      primera_vez: s.primera_vez,
      ultima_vez: s.ultima_vez,
      horas_de_maquina: Math.round((Number(s.segundos_de_maquina) / 3600) * 100) / 100,
    };

    if (precision !== 'sensor_validado') {
      out.aviso_precision = precision === 'estimado'
        ? 'Estas pasadas se estiman por el reloj de la aplicación, no las mide la máquina. Hasta que el sensor de pasada esté instalado y validado, los números (y los metros) son aproximados.'
        : 'El conteo del sensor todavía no se validó contra el contador mecánico del telar (o hay producciones sin sensor). Los números son aproximados.';
    }

    if (mpp !== null) {
      out.metros_tejidos = Math.round(s.pasadas_totales * mpp * 100) / 100;
      out.metros_mayor_produccion = Math.round(s.pasadas_mayor_produccion * mpp * 100) / 100;
      out.metros_son_estimados = precision !== 'sensor_validado';
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
