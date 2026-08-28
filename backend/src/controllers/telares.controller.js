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
// El ESP32 (Nivel 1) llama este mismo endpoint cada ~2,5s para sondear
// el estado deseado. Cuando lo hace, agrega ?origen=esp32 a la URL; eso
// es lo que permite distinguir su sondeo del que hace la propia web (que
// también puede consultar este endpoint para mostrar el estado en
// pantalla) y dejar un "heartbeat" real del dispositivo, no de cualquier
// pestaña abierta.
export async function obtenerTelar(req, res, next) {
  try {
    if (req.query.origen === 'esp32') {
      await pool.query(
        `UPDATE telares SET ultimo_ping_esp32 = now() WHERE id = $1`,
        [req.params.id]
      );
    }

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

// POST /api/telares/:id/pausar
// PAUSA de verdad, a diferencia de /detener: deja la producción ABIERTA
// (estado 'en_curso') y CONSERVA el patrón asignado, cambiando solo el
// estado del telar a 'pausado'. Así, al reanudar, el tejido retoma en la
// misma fila/columna/pasada en la que quedó.
//
// /detener, en cambio, cierra la producción y pone patron_actual_id = NULL:
// eso es un fin de trabajo, no una pausa. Usar /detener para pausar hacía
// que al dar Play de nuevo el dibujo arrancara desde cero.
//
// Para el ESP32 no cambia nada: cualquier estado distinto de 'tejiendo'
// se interpreta como "no tejer", así que el relé de Pausa se pulsa igual.
export async function pausarTelar(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE telares SET estado = 'pausado'
       WHERE id = $1
       RETURNING id, estado, patron_actual_id`,
      [id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/reanudar
// Vuelve a poner el telar en 'tejiendo' después de una pausa, sin tocar la
// posición ni reasignar el patrón. Exige que haya una producción en curso:
// si no la hay, lo que corresponde es asignar un patrón, no reanudar.
export async function reanudarTelar(req, res, next) {
  try {
    const { id } = req.params;
    const enCurso = await pool.query(
      `SELECT id FROM historial_produccion
       WHERE telar_id = $1 AND estado = 'en_curso'`,
      [id]
    );
    if (enCurso.rows.length === 0) {
      throw conflict(`El telar ${id} no tiene una producción en curso para reanudar.`);
    }
    const { rows } = await pool.query(
      `UPDATE telares SET estado = 'tejiendo'
       WHERE id = $1
       RETURNING id, estado, patron_actual_id`,
      [id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/retroceder-fisico
// Pulso del botón FÍSICO "Retroceder" del telar (relé en paralelo al
// botón real de la máquina, para corregir tras un corte de hilo).
// OJO: no confundir con /retroceder de acá abajo, que solo mueve el
// cursor de fila/columna del patrón en la web (edición/simulación),
// sin ningún efecto sobre el telar real.
//
// No guardamos "el pulso" en sí: incrementamos un contador
// (retroceder_seq). El ESP32 sondea este valor junto con "estado" cada
// pocos segundos; cuando lo ve distinto al último que conocía, pulsa el
// relé una vez. Este patrón (contador creciente en vez de un flag) evita
// que dos pedidos seguidos "se pisen" entre sí antes de que el ESP32
// llegue a sondear.
export async function retrocederFisico(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE telares SET retroceder_seq = retroceder_seq + 1
       WHERE id = $1
       RETURNING id, retroceder_seq`,
      [id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/evento-fisico  { tipo: 'marcha' | 'pausa' | 'retroceder' }
// Lo llama el ESP32 cuando SENSA (no cuando acciona) que un operario apretó
// a mano uno de los botones del telar. Sirve para que la web refleje lo que
// realmente pasa en la máquina: sin esto, alguien podía arrancar el telar
// con el botón físico y la web seguía mostrando "detenido".
//
// Cada tipo tiene su efecto:
//   marcha     → el telar arrancó   → estado 'tejiendo'
//   pausa      → el telar se detuvo → estado 'pausado'
//   retroceder → retrocedió una pasada → se mueve la posición hacia atrás
//
// El ESP32 descarta el eco de sus propios pulsos antes de llamar acá, así
// que un evento que llega es siempre una acción humana sobre la máquina.
export async function eventoFisico(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    if (!['marcha', 'pausa', 'retroceder'].includes(tipo)) {
      throw badRequest("El campo tipo debe ser 'marcha', 'pausa' o 'retroceder'.");
    }

    await client.query('BEGIN');

    const telar = await client.query('SELECT id FROM telares WHERE id = $1 FOR UPDATE', [id]);
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    // Producción abierta (si la hay). Sin ella no se puede ubicar la posición.
    const enCurso = await client.query(
      `SELECT h.*, p.columnas
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        FOR UPDATE OF h`,
      [id]
    );

    let nuevoEstado = null;
    let posicionIncierta = false;

    if (tipo === 'marcha') {
      nuevoEstado = 'tejiendo';
      // Si arrancaron la máquina a mano sin que haya un trabajo abierto en
      // el sistema, el telar está tejiendo pero nadie sabe en qué punto del
      // dibujo: se marca la posición como incierta.
      if (enCurso.rows.length === 0) posicionIncierta = true;
    } else if (tipo === 'pausa') {
      nuevoEstado = 'pausado';
    } else if (tipo === 'retroceder') {
      if (enCurso.rows.length > 0) {
        const row = enCurso.rows[0];
        const { fila_actual, columna_actual, pasada_actual } = retrocederPosicionTejido(
          row.fila_actual, row.columna_actual, row.columnas, 1
        );
        await client.query(
          `UPDATE historial_produccion
              SET fila_actual = $1, columna_actual = $2, pasada_actual = $3
            WHERE id = $4`,
          [fila_actual, columna_actual, pasada_actual, row.id]
        );
      } else {
        // Retrocedieron a mano sin trabajo abierto: no hay posición que mover.
        posicionIncierta = true;
      }
    }

    const { rows } = await client.query(
      `UPDATE telares
          SET estado = COALESCE($2, estado),
              posicion_incierta = CASE WHEN $3 THEN true ELSE posicion_incierta END,
              ultimo_evento_manual = now(),
              ultimo_evento_manual_tipo = $4
        WHERE id = $1
        RETURNING id, estado, posicion_incierta, ultimo_evento_manual, ultimo_evento_manual_tipo`,
      [id, nuevoEstado, posicionIncierta, tipo]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/telares/:id/confirmar-posicion
// El operario, tras mirar el telar y confirmar dónde está realmente
// parado, limpia la marca de "posición incierta" desde la web.
export async function confirmarPosicion(req, res, next) {
  try {
    const { id } = req.params;
    const { visto_hasta } = req.body || {};

    // Condición de carrera: entre que la web muestra el aviso y el operario
    // toca "Confirmar", el ESP32 puede haber registrado OTRO uso manual. Si
    // limpiáramos a ciegas, ese segundo evento quedaría tapado y la posición
    // volvería a mostrarse como confiable sin serlo.
    //
    // Por eso la web manda el timestamp del evento que efectivamente vio
    // (visto_hasta) y solo se limpia si no llegó nada nuevo después. Si el
    // campo no viene (cliente viejo), se mantiene el comportamiento anterior.
    const { rows } = visto_hasta
      ? await pool.query(
          `UPDATE telares SET posicion_incierta = false
           WHERE id = $1 AND (ultimo_evento_manual IS NULL OR ultimo_evento_manual <= $2)
           RETURNING id, posicion_incierta, ultimo_evento_manual`,
          [id, visto_hasta]
        )
      : await pool.query(
          `UPDATE telares SET posicion_incierta = false WHERE id = $1
           RETURNING id, posicion_incierta, ultimo_evento_manual`,
          [id]
        );

    if (rows.length === 0) {
      // Con visto_hasta, 0 filas puede significar dos cosas distintas.
      const existe = await pool.query('SELECT id FROM telares WHERE id = $1', [id]);
      if (existe.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);
      throw conflict(
        'Se registró un nuevo movimiento manual del telar mientras confirmabas. ' +
        'Revisá la posición otra vez antes de confirmar.'
      );
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/retroceder  { pasos? }
// El "volver atrás" pedido por el equipo: retrocede la posición sin
// reconstruir nada, usando fila_actual/columna_actual ya guardados.
// Es un espejo de rollback() en el frontend: retrocede una celda completa
// (no importa en qué pasada estaba), y esa celda se retoma desde 0.
// NOTA: la web ya no usa esta ruta desde que se sacó el botón ↩ del editor
// (ver commit de eliminación del botón "Retroceder fila"); se mantiene
// porque la app de referencia Android (_referencia_app_android) todavía
// la llama.
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
