import { pool } from '../db.js';
import { notFound, badRequest, conflict } from '../middleware/errorHandler.js';
import { avanzarPosicionTejido, retrocederPosicionTejido } from '../utils/posicion.js';

// ─── Conteo de pasadas: estimado vs. medido ───────────────────────────
// Mientras el sensor inductivo (Nivel 2) no esté instalado, pasadas_totales sale
// del reloj de la web (una pasada cada 500 ms), no de la máquina: es una ESTIMACIÓN.
// Si el sensor está reportando (ultimo_reporte_sensor reciente) la posición y el
// conteo los lleva él, y la web no debe seguir avanzándolos por su cuenta.
//
// origen_conteo:
//   'estimado'         → reloj de la web (Nivel 1)
//   'sensor'           → medido por el sensor, todavía sin comparar contra el contador mecánico
//   'sensor_validado'  → medido y validado contra el contador mecánico
const SENSOR_VIGENTE_SEG = 30;

const COLUMNAS_TELAR = `
  t.*, p.nombre AS patron_actual_nombre,
  h.id AS historial_actual_id, h.fila_actual, h.columna_actual,
  h.pasada_actual, h.vueltas_completadas, h.pasadas_totales AS pasadas_actuales,
  h.pasadas_sensor, h.conteo_validado,
  (t.ultimo_reporte_sensor IS NOT NULL
     AND t.ultimo_reporte_sensor > now() - interval '${SENSOR_VIGENTE_SEG} seconds') AS sensor_activo`;

function conOrigenDeConteo(fila) {
  if (!fila) return fila;
  let origen = 'estimado';
  if (fila.sensor_activo || Number(fila.pasadas_sensor) > 0) {
    origen = fila.conteo_validado ? 'sensor_validado' : 'sensor';
  }
  return { ...fila, origen_conteo: origen };
}

// GET /api/telares
export async function listarTelares(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_TELAR}
       FROM telares t
       LEFT JOIN patrones p ON p.id = t.patron_actual_id
       LEFT JOIN historial_produccion h ON h.telar_id = t.id AND h.estado = 'en_curso'
       ORDER BY t.codigo`
    );
    res.json(rows.map(conOrigenDeConteo));
  } catch (err) {
    next(err);
  }
}

// GET /api/telares/:id
// El ESP32 (Nivel 1) llama este mismo endpoint cada ~2,5s para sondear el estado
// deseado, agregando ?origen=esp32. Eso, MÁS la clave de dispositivo válida
// (X-Device-Key), es lo que deja un "heartbeat" real del dispositivo. Antes alcanzaba
// con el parámetro en la URL, y cualquiera podía falsear el "ESP32 conectado".
export async function obtenerTelar(req, res, next) {
  try {
    if (req.esDispositivo && req.query.origen === 'esp32') {
      await pool.query(
        `UPDATE telares SET ultimo_ping_esp32 = now() WHERE id = $1`,
        [req.params.id]
      );
    }

    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_TELAR}
       FROM telares t
       LEFT JOIN patrones p ON p.id = t.patron_actual_id
       LEFT JOIN historial_produccion h ON h.telar_id = t.id AND h.estado = 'en_curso'
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${req.params.id}.`);
    res.json(conOrigenDeConteo(rows[0]));
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

// POST /api/telares/:id/asignar-patron  { patron_id, reiniciar? }
// Si el telar ya tiene una producción abierta de ESTE dibujo, la reanuda (no reinicia).
// Si tenía una de OTRO dibujo, la cierra como "detenido_manual" antes de abrir la nueva.
// Una producción nueva arranca siempre en la fila 0.
export async function asignarPatron(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { patron_id } = req.body;
    if (!patron_id) throw badRequest('Falta el campo requerido: patron_id.');

    await client.query('BEGIN');

    const telar = await client.query('SELECT * FROM telares WHERE id = $1 FOR UPDATE', [id]);
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    const patron = await client.query('SELECT id, nombre, columnas FROM patrones WHERE id = $1', [patron_id]);
    if (patron.rows.length === 0) throw notFound(`No existe el patrón con id ${patron_id}.`);

    // Cada telar tiene una cantidad fija de elementos de selección (bobinas). Está
    // guardada por telar en la columna elementos_seleccion (por defecto 4, las del
    // Vamatex C 401 donde se implementa). Un dibujo con más columnas que eso no se
    // puede ejecutar completo, porque las columnas sobrantes no tienen a qué accionar.
    //
    // No se rechaza la asignación, porque mientras el Nivel 2 no esté instalado el
    // dibujo lo define la cinta de papel y la cantidad de columnas es indistinta.
    // Pero se devuelve el aviso para que la interfaz pueda mostrarlo.
    const elementos = telar.rows[0].elementos_seleccion ?? 4;
    let advertencia = null;
    if (patron.rows[0].columnas > elementos) {
      advertencia = `El dibujo "${patron.rows[0].nombre}" tiene ${patron.rows[0].columnas} columnas y este telar tiene ${elementos} elementos de selección. Al ejecutarlo, las columnas ${elementos + 1} en adelante no van a accionar nada.`;
    }

    // Si el telar YA está tejiendo (o pausado) ESTE mismo dibujo, asignarlo de nuevo NO
    // reinicia el trabajo: se reanuda donde quedó. Sin esto, cualquier cliente que
    // reasignara el dibujo (una pantalla desactualizada, la app, un reintento) cerraba la
    // producción y volvía a empezar desde la fila 0, perdiendo la posición y el conteo.
    // Para empezar de cero a propósito hay que mandar { reiniciar: true }.
    const abierta = await client.query(
      `SELECT * FROM historial_produccion
        WHERE telar_id = $1 AND estado = 'en_curso' AND patron_id = $2
        FOR UPDATE`,
      [id, patron_id]
    );
    if (abierta.rows.length > 0 && req.body.reiniciar !== true) {
      await client.query(
        `UPDATE telares SET patron_actual_id = $1, estado = 'tejiendo', motivo_pausa = NULL WHERE id = $2`,
        [patron_id, id]
      );
      await client.query('COMMIT');
      return res.status(200).json({ ...abierta.rows[0], reanudado: true, ...(advertencia ? { advertencia } : {}) });
    }

    // Cierra cualquier producción en curso previa de este telar
    await client.query(
      `UPDATE historial_produccion
         SET fecha_fin = now(), estado = 'detenido_manual'
       WHERE telar_id = $1 AND estado = 'en_curso'`,
      [id]
    );

    await client.query(
      `UPDATE telares SET patron_actual_id = $1, estado = 'tejiendo', motivo_pausa = NULL WHERE id = $2`,
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
    res.status(201).json(advertencia ? { ...nuevoHistorial.rows[0], advertencia } : nuevoHistorial.rows[0]);
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
      `UPDATE telares SET patron_actual_id = NULL, estado = 'apagado', motivo_pausa = NULL WHERE id = $1`,
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
// Avanza la posición de tejido POR RELOJ: lo llama la web en cada paso de su
// animación. Es una ESTIMACIÓN: mide el reloj del navegador, no la máquina.
//
// Cuando el sensor del Nivel 2 está reportando, el sensor es la fuente de verdad
// de la posición y del conteo. En ese caso esta ruta responde 409 con
// codigo 'SENSOR_ACTIVO' y NO toca nada: la web debe dejar de avanzar por reloj y
// seguir la posición que informa el backend. Si no, dos escritores (el reloj y el
// sensor) se pisarían y el conteo quedaría inflado.
//
// El patrón no tiene "final": al llegar a la última fila, vuelve a la fila 0 y
// sigue (igual que la cinta de papel, que es un lazo). Se informa
// vueltas_completadas si dio una vuelta entera o más.
export async function avanzarTelar(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const pasos = Number.isInteger(req.body.pasos) && req.body.pasos > 0 ? req.body.pasos : 1;

    await client.query('BEGIN');

    const telar = await client.query(
      `SELECT id, (ultimo_reporte_sensor IS NOT NULL
                   AND ultimo_reporte_sensor > now() - interval '${SENSOR_VIGENTE_SEG} seconds') AS sensor_activo
         FROM telares WHERE id = $1`,
      [id]
    );
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    if (telar.rows[0].sensor_activo) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'El conteo y la posición los lleva el sensor de pasada: la web no avanza por reloj.',
        codigo: 'SENSOR_ACTIVO',
      });
    }

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
    const { fila_actual, vueltas_completadas } = avanzarPosicionTejido(row.fila_actual, row.matriz_pasadas, pasos);

    const actualizado = await client.query(
      `UPDATE historial_produccion
         SET fila_actual = $1, columna_actual = 0, pasada_actual = 0,
             vueltas_completadas = vueltas_completadas + $2,
             pasadas_totales = pasadas_totales + $3
       WHERE id = $4
       RETURNING *`,
      [fila_actual, vueltas_completadas, pasos, row.id]
    );

    await client.query('COMMIT');
    res.json({ ...actualizado.rows[0], origen_conteo: 'estimado' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/telares/:id/pausar
// PAUSA de verdad, a diferencia de /detener: deja la producción ABIERTA
// (estado 'en_curso') y CONSERVA el patrón asignado, cambiando solo el
// estado del telar a 'pausado'. Así, al reanudar, el tejido retoma en la
// misma fila en la que quedó.
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
      `UPDATE telares SET estado = 'pausado', motivo_pausa = NULL
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
      `UPDATE telares SET estado = 'tejiendo', motivo_pausa = NULL
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
// cursor de fila del dibujo en la web, sin ningún efecto sobre el telar real.
//
// No guardamos "el pulso" en sí: incrementamos un contador
// (retroceder_seq). El ESP32 del Nivel 1 sondea este valor junto con "estado" cada
// pocos segundos; cuando lo ve distinto al último que conocía, pulsa el
// relé una vez. Este patrón (contador creciente en vez de un flag) evita
// que dos pedidos seguidos "se pisen" entre sí antes de que el ESP32
// llegue a sondear.
//
// Además se suma retrocesos_contados: el contador que lee el Nivel 2 para descontar
// pasadas (ver migración 012). Son dos contadores porque significan cosas distintas:
// retroceder_seq es una ORDEN para el Nivel 1; retrocesos_contados es un HECHO
// (el telar retrocedió), venga de la web o de la botonera.
export async function retrocederFisico(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE telares
          SET retroceder_seq = retroceder_seq + 1,
              retrocesos_contados = retrocesos_contados + 1
       WHERE id = $1
       RETURNING id, retroceder_seq, retrocesos_contados`,
      [id]
    );
    if (rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/evento-fisico  { tipo: 'marcha' | 'pausa' | 'retroceder' | 'sin_senal' }
// Solo con clave de dispositivo. Lo llama el ESP32 cuando SENSA algo que pasó en la
// máquina (no cuando acciona). Sirve para que la web refleje lo que realmente pasa:
// sin esto, alguien podía arrancar el telar con el botón físico y la web seguía
// mostrando "detenido".
//
// Cada tipo tiene su efecto:
//   marcha     → el telar arrancó   → estado 'tejiendo'
//   pausa      → el telar se detuvo → estado 'pausado'
//   retroceder → retrocedió UNA pasada (= una fila) → la posición vuelve una fila atrás
//   reinicio   → el ESP32 arrancó en frío: 'tejiendo' pasa a 'pausado' sin perder la posición
//   sin_senal  → el sensor de pasada dejó de recibir pulsos con el telar "tejiendo":
//                la máquina se frenó (paro de emergencia, hilo cortado, falla) o el
//                sensor falló. Se pasa a 'pausado' con motivo_pausa = 'sin_senal' y se
//                deja un registro en el log de errores. Sin esto la web mostraba
//                "tejiendo" indefinidamente con la máquina parada.
//
// El ESP32 descarta el eco de sus propios pulsos antes de llamar acá, así
// que un evento que llega es siempre una acción humana sobre la máquina.
export async function eventoFisico(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    if (!['marcha', 'pausa', 'retroceder', 'sin_senal', 'reinicio'].includes(tipo)) {
      throw badRequest("El campo tipo debe ser 'marcha', 'pausa', 'retroceder', 'sin_senal' o 'reinicio'.");
    }

    await client.query('BEGIN');

    const telar = await client.query('SELECT id, estado FROM telares WHERE id = $1 FOR UPDATE', [id]);
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${id}.`);

    // Producción abierta (si la hay). Sin ella no se puede ubicar la posición.
    const enCurso = await client.query(
      `SELECT h.*, p.matriz_pasadas
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        FOR UPDATE OF h`,
      [id]
    );

    // sin_senal no es un uso manual de la botonera: no toca ultimo_evento_manual (que
    // alimenta el aviso de "posición incierta"), tiene su propio campo.
    if (tipo === 'sin_senal') {
      // Solo tiene sentido si el sistema creía que estaba tejiendo. Si ya estaba
      // pausado, la parada fue pedida y no hay nada que corregir.
      if (telar.rows[0].estado !== 'tejiendo') {
        await client.query('COMMIT');
        return res.json({ id: Number(id), estado: telar.rows[0].estado, sin_cambios: true });
      }
      const r = await client.query(
        `UPDATE telares SET estado = 'pausado', motivo_pausa = 'sin_senal'
          WHERE id = $1
          RETURNING id, estado, motivo_pausa`,
        [id]
      );
      await client.query(
        `INSERT INTO errores_log (telar_id, titulo, mensaje, codigo)
         VALUES ($1, $2, $3, 'SIN_SENAL')`,
        [
          id,
          'El telar dejó de dar pulsos',
          'El sensor de pasada no recibió pulsos con el telar en marcha: la máquina se frenó (paro, hilo cortado, falla) o el sensor dejó de detectar. Revisar la máquina antes de reanudar.',
        ]
      );
      await client.query('COMMIT');
      return res.json(r.rows[0]);
    }

    // reinicio: el ESP32 arrancó en FRÍO (se cortó y volvió la luz, o el telar volvió de un
    // traslado). No sabe si la máquina está andando; lo seguro es asumir que está DETENIDA. Si
    // el sistema figuraba "tejiendo", pasa a "pausado" CONSERVANDO la producción, el dibujo y
    // la posición: al tocar ▶ el tejido retoma donde quedó, no empieza de nuevo. Como el corte
    // pudo llegar en pleno tejido (la posición guardada puede estar unas pasadas atrás), se marca
    // la posición como incierta para que el operario la confirme antes de seguir.
    if (tipo === 'reinicio') {
      if (telar.rows[0].estado !== 'tejiendo') {
        await client.query('COMMIT');
        return res.json({ id: Number(id), estado: telar.rows[0].estado, sin_cambios: true });
      }
      const r = await client.query(
        `UPDATE telares
            SET estado = 'pausado', motivo_pausa = 'reinicio',
                posicion_incierta = CASE WHEN $2 THEN true ELSE posicion_incierta END,
                ultimo_evento_manual = CASE WHEN $2 THEN now() ELSE ultimo_evento_manual END,
                ultimo_evento_manual_tipo = CASE WHEN $2 THEN 'reinicio' ELSE ultimo_evento_manual_tipo END
          WHERE id = $1
          RETURNING id, estado, motivo_pausa, posicion_incierta`,
        [id, enCurso.rows.length > 0]
      );
      await client.query('COMMIT');
      return res.json(r.rows[0]);
    }

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
        const { fila_actual, vueltas_deshechas } = retrocederPosicionTejido(row.fila_actual, row.matriz_pasadas, 1);
        await client.query(
          `UPDATE historial_produccion
              SET fila_actual = $1, columna_actual = 0, pasada_actual = 0,
                  pasadas_totales = GREATEST(pasadas_totales - 1, 0),
                  vueltas_completadas = GREATEST(vueltas_completadas - $2, 0)
            WHERE id = $3`,
          [fila_actual, vueltas_deshechas, row.id]
        );
      } else {
        // Retrocedieron a mano sin trabajo abierto: no hay posición que mover.
        posicionIncierta = true;
      }
    }

    const { rows } = await client.query(
      `UPDATE telares
          SET estado = COALESCE($2, estado),
              motivo_pausa = CASE WHEN $2 IS NOT NULL THEN NULL ELSE motivo_pausa END,
              posicion_incierta = CASE WHEN $3 THEN true ELSE posicion_incierta END,
              retrocesos_contados = retrocesos_contados + CASE WHEN $4 = 'retroceder' THEN 1 ELSE 0 END,
              ultimo_evento_manual = now(),
              ultimo_evento_manual_tipo = $4
        WHERE id = $1
        RETURNING id, estado, posicion_incierta, ultimo_evento_manual, ultimo_evento_manual_tipo`,
      [id, nuevoEstado, posicionIncierta, tipo]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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

// POST /api/telares/:id/validar-conteo  { confirmo: true }
// El operario da por bueno el conteo del sensor DESPUÉS de compararlo contra el
// contador mecánico del telar durante una jornada completa. Recién ahí los metros
// y los tiempos derivados dejan de mostrarse como aproximados.
export async function validarConteo(req, res, next) {
  try {
    const { id } = req.params;
    if (req.body?.confirmo !== true) {
      throw badRequest('Para validar el conteo hay que mandar { "confirmo": true } tras compararlo con el contador mecánico.');
    }
    const { rows } = await pool.query(
      `UPDATE historial_produccion SET conteo_validado = true
        WHERE telar_id = $1 AND estado = 'en_curso' AND pasadas_sensor > 0
        RETURNING id, pasadas_sensor, conteo_validado`,
      [id]
    );
    if (rows.length === 0) {
      throw conflict('No hay una producción en curso con conteo del sensor para validar.');
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/telares/:id/retroceder  { pasos? }
// El "volver atrás" de la posición: retrocede el cursor de fila del dibujo sin
// reconstruir nada. Es el espejo exacto de /avanzar: una pasada atrás = una fila
// menos (una fila ES una pasada). Desde la fila 0 se vuelve a la última, porque el
// dibujo es un lazo. También descuenta la pasada del conteo y, si cruzó el inicio,
// una vuelta completa.
export async function retrocederTelar(req, res, next) {
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
    const { fila_actual, vueltas_deshechas, al_inicio } = retrocederPosicionTejido(row.fila_actual, row.matriz_pasadas, pasos);

    const actualizado = await client.query(
      `UPDATE historial_produccion
         SET fila_actual = $1, columna_actual = 0, pasada_actual = 0,
             pasadas_totales = GREATEST(pasadas_totales - $2, 0),
             vueltas_completadas = GREATEST(vueltas_completadas - $3, 0)
       WHERE id = $4
       RETURNING *`,
      [fila_actual, pasos, vueltas_deshechas, row.id]
    );

    await client.query('COMMIT');
    res.json({ ...actualizado.rows[0], al_inicio });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/telares/:id/historial
export async function historialPorTelar(req, res, next) {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const desplazamiento = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await pool.query(
      `SELECT h.*, p.nombre AS patron_nombre,
              CASE WHEN h.pasadas_sensor > 0 THEN h.pasadas_sensor ELSE h.pasadas_totales END AS pasadas_conteo,
              CASE WHEN h.pasadas_sensor > 0 THEN (CASE WHEN h.conteo_validado THEN 'sensor_validado' ELSE 'sensor' END) ELSE 'estimado' END AS origen_conteo
       FROM historial_produccion h
       JOIN patrones p ON p.id = h.patron_id
       WHERE h.telar_id = $1
       ORDER BY h.fecha_inicio DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limite, desplazamiento]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
