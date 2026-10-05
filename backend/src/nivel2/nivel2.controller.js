// ============================================================================
//  Nivel 2, controlador
//  Endpoints que consume el firmware de selección del dibujo (ESP32 del Nivel 2).
//  Están montados en server.js bajo /api/telares y exigen la clave de dispositivo.
// ============================================================================

import { pool } from '../db.js';
import { badRequest, notFound } from '../middleware/errorHandler.js';
import { avanzarPosicionTejido, retrocederPosicionTejido } from '../utils/posicion.js';

// Cuánto puede bajar el conteo entre dos reportes sin que se considere un error.
// Con Retroceder el telar deshace pasadas y el contador del sensor BAJA de verdad
// (una por retroceso), así que un valor menor no siempre significa "el nodo se
// reinició". Un descenso pequeño se acepta; uno grande casi seguro es un reinicio
// del nodo que volvió a contar desde cero, y se ignora para no borrar tela tejida.
const TOLERANCIA_RETROCESO = 25;

// Cuánto puede diferir la posición (fila_actual / repeticion_en_fila) que informa
// el ESP32 respecto de la que corresponde al conteo pasadas_sensor que trae el
// mismo reporte. Tolerancia explícita: 2 pasadas. Cubre la carrera entre el
// muestreo del contador y el cálculo de la fila dentro del propio firmware (el
// telar teje hasta ~5 pasadas por segundo y ambos valores no se congelan en el
// mismo instante). Un salto mayor es arbitrario: el nodo perdió su posición
// (reinicio parcial, memoria corrupta) y se rechaza con 400 en lugar de
// guardar una posición que dejaría un salto visible en la tela.
const TOLERANCIA_POSICION_PASADAS = 2;

/**
 * Devuelve la matriz del dibujo asignado a un telar.
 *
 * El firmware la descarga una sola vez al arrancar el tejido y la guarda en
 * memoria: pedirla en cada pasada sería imposible, porque a 300 pasadas por
 * minuto hay apenas 200 ms entre una y otra.
 */
export async function obtenerPatronActual(req, res, next) {
  try {
    const telarId = Number(req.params.id);
    if (!Number.isInteger(telarId)) throw badRequest('El identificador del telar debe ser un número.');

    // Se devuelve además la posición de la producción en curso. El nodo la
    // necesita al arrancar: si se reinició por un corte o por el watchdog, su
    // memoria volvió a cero y sin este dato retomaría el dibujo desde la primera
    // fila, dejando un salto visible en la tela a mitad de una pieza.
    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, p.filas, p.columnas, p.matriz_pasadas, p.repeticiones_por_fila,
              h.id AS historial_id, h.fila_actual, h.repeticion_en_fila, h.pasadas_sensor
         FROM telares t
         JOIN patrones p ON p.id = t.patron_actual_id
         LEFT JOIN historial_produccion h
                ON h.telar_id = t.id AND h.estado = 'en_curso'
        WHERE t.id = $1`,
      [telarId]
    );

    if (rows.length === 0) {
      // No es un error: puede que el telar simplemente no tenga un dibujo
      // asignado todavía. El firmware lo interpreta y no acciona nada.
      return res.json({ asignado: false, matriz_pasadas: [] });
    }

    const p = rows[0];
    res.json({
      asignado: true,
      patron_id: p.id,
      nombre: p.nombre,
      filas: p.filas,
      columnas: p.columnas,
      matriz_pasadas: p.matriz_pasadas,
      // Cuántas pasadas seguidas se teje cada fila. Si el dibujo no lo define, se
      // manda un 1 por fila: el nodo no tiene que interpretar ausencias.
      repeticiones_por_fila: p.repeticiones_por_fila ?? Array.from({ length: p.filas }, () => 1),
      // Posición de la producción en curso, para que el nodo retome donde quedó.
      // En null si no hay producción abierta: ahí el nodo arranca desde el principio.
      fila_actual: p.fila_actual ?? null,
      repeticion_en_fila: p.repeticion_en_fila ?? 0,
      pasadas_sensor: p.pasadas_sensor ?? null,
      // Id de la producción en curso: el nodo lo compara con historial_actual_id de su consulta
      // periódica para notar una producción NUEVA del mismo dibujo (⏹ y ▶ seguidos).
      historial_id: p.historial_id ?? null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Recibe el conteo de pasadas que reporta el sensor inductivo.
 *
 * El firmware manda el acumulado, no un incremento: si se pierde un reporte por
 * un corte de red, el siguiente trae el número correcto igual. Con incrementos,
 * un reporte perdido quedaría perdido para siempre.
 *
 * Body: { pasadas_sensor, fila_actual }   (se acepta también "pasadas_totales" por
 * compatibilidad con el firmware anterior).
 *
 * Escribe en pasadas_sensor, NO en pasadas_totales: esa columna es la estimación por
 * reloj de la web, y durante la jornada de validación hay que poder comparar las dos.
 */
export async function reportarPasadas(req, res, next) {
  const cliente = await pool.connect();
  try {
    const telarId = Number(req.params.id);
    const pasadasSensor = req.body.pasadas_sensor ?? req.body.pasadas_totales;
    const { fila_actual, repeticion_en_fila } = req.body;

    if (!Number.isInteger(telarId)) throw badRequest('El identificador del telar debe ser un número.');
    // La columna es INTEGER: un valor más grande no entra en la base.
    if (!Number.isInteger(pasadasSensor) || pasadasSensor < 0 || pasadasSensor > 2147483647) {
      throw badRequest('pasadas_sensor debe ser un número entero no negativo.');
    }

    await cliente.query('BEGIN');

    // Primero el telar y después la producción, el mismo orden que evento-fisico: con el orden al
    // revés, un retroceso de la botonera (Nivel 1) y este reporte (Nivel 2) en el mismo instante se
    // esperaban mutuamente y PostgreSQL cortaba uno de los dos con error.
    const telar = await cliente.query('SELECT id FROM telares WHERE id = $1 FOR UPDATE', [telarId]);
    if (telar.rows.length === 0) throw notFound(`No existe el telar con id ${telarId}.`);

    // Se bloquea la fila del historial mientras se actualiza, para que dos
    // reportes seguidos no se pisen entre sí.
    const { rows } = await cliente.query(
      `SELECT h.id, h.pasadas_sensor, h.fila_actual, h.repeticion_en_fila, p.filas, p.repeticiones_por_fila
         FROM historial_produccion h
         JOIN patrones p ON p.id = h.patron_id
        WHERE h.telar_id = $1 AND h.estado = 'en_curso'
        ORDER BY h.fecha_inicio DESC
        LIMIT 1
        FOR UPDATE OF h`,
      [telarId]
    );

    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      throw notFound('El telar no tiene una producción en curso.');
    }

    const actual = rows[0];

    // La fila que informa el nodo tiene que ser coherente con el conteo que trae
    // el mismo reporte: pasadas_sensor es la fuente de verdad del avance y la
    // posición se deriva de él. Se proyecta la posición guardada con el delta del
    // conteo (la misma matemática que usan /avanzar y /retroceder) y se compara
    // en "espacio de pasadas" contra la posición informada. Una fila fuera de
    // rango se ignora (no se rechaza). Sin posición guardada previa no hay contra
    // qué cotejar: coherente queda en null.
    const delta = pasadasSensor - actual.pasadas_sensor;
    let coherente = null;
    let esperada = null;
    if (
      Number.isInteger(fila_actual) && fila_actual >= 0 && fila_actual < actual.filas &&
      Number.isInteger(actual.fila_actual) && Number.isInteger(actual.filas) && actual.filas > 0
    ) {
      const repsDeFila = (i) => {
        const r = Array.isArray(actual.repeticiones_por_fila) ? Number(actual.repeticiones_por_fila[i]) : NaN;
        return Number.isInteger(r) && r >= 1 ? r : 1;
      };
      const aPasadas = (fila, rep) => {
        let acc = 0;
        for (let i = 0; i < fila; i++) acc += repsDeFila(i);
        return acc + Math.max(0, Math.trunc(Number(rep) || 0));
      };
      esperada = delta >= 0
        ? avanzarPosicionTejido(actual.fila_actual, actual.filas, delta, actual.repeticiones_por_fila, actual.repeticion_en_fila ?? 0)
        : retrocederPosicionTejido(actual.fila_actual, actual.filas, -delta, actual.repeticiones_por_fila, actual.repeticion_en_fila ?? 0);
      // La distancia se mide sobre el lazo: la última pasada del dibujo y la primera de la vuelta
      // siguiente están a una pasada, no a una vuelta entera. Antes, si el reporte caía justo en
      // el cambio de vuelta (el conteo y la fila se leen con un instante de diferencia), se
      // rechazaba un reporte correcto.
      const porVuelta = aPasadas(actual.filas, 0);
      const lineal = Math.abs(aPasadas(fila_actual, repeticion_en_fila) - aPasadas(esperada.fila_actual, esperada.repeticion_en_fila)) % porVuelta;
      coherente = Math.min(lineal, porVuelta - lineal) <= TOLERANCIA_POSICION_PASADAS;
    }

    // Un descenso grande con una fila que NO acompaña es un nodo que volvió a contar desde cero:
    // se ignora en lugar de retroceder el historial, que representa tela realmente tejida, y se
    // devuelve el valor guardado (el nodo vuelve a bajar posición y conteo). Si la fila sí
    // acompaña la bajada, son retrocesos de verdad (por ejemplo, muchos con la red caída) y se
    // aceptan: antes se rechazaban igual, el nodo corregía solo el conteo y no la fila, y desde
    // ahí el backend rechazaba todos sus reportes.
    if (-delta > TOLERANCIA_RETROCESO && coherente !== true) {
      await cliente.query('ROLLBACK');
      return res.json({
        aplicado: false,
        motivo: 'El conteo recibido es mucho menor que el registrado: probablemente el nodo se reinició.',
        pasadas_sensor: actual.pasadas_sensor,
      });
    }
    if (coherente === false) {
      await cliente.query('ROLLBACK');
      throw badRequest(
        `La posición informada (fila ${fila_actual}) no coincide con el conteo del sensor: ` +
        `para ${pasadasSensor} pasadas se esperaba la fila ${esperada.fila_actual}.`
      );
    }

    const filaValida = Number.isInteger(fila_actual) && fila_actual >= 0 && fila_actual < actual.filas
      ? fila_actual
      : null;

    // Cuántas pasadas de la fila actual ya se tejieron. El nodo la manda para que
    // una reanudación caiga en la pasada exacta y no al principio de la fila. Solo vale junto con
    // una fila válida y por debajo de las repeticiones de esa fila: antes se guardaba cualquier
    // número, también al lado de la fila vieja cuando la informada no servía, y la posición
    // guardada quedaba incoherente. Si no viene (o no sirve) con una fila nueva, la fila arranca
    // en su primera pasada; con la misma fila se conserva la que había.
    const repsFila = filaValida === null ? 0
      : (Array.isArray(actual.repeticiones_por_fila) && Number.isInteger(Number(actual.repeticiones_por_fila[filaValida]))
          && Number(actual.repeticiones_por_fila[filaValida]) >= 1 ? Number(actual.repeticiones_por_fila[filaValida]) : 1);
    const repValida = filaValida === null ? null
      : (Number.isInteger(repeticion_en_fila) && repeticion_en_fila >= 0 && repeticion_en_fila < repsFila)
        ? repeticion_en_fila
        : (filaValida === actual.fila_actual ? null : 0);

    // Una vuelta completa del dibujo son la SUMA de las repeticiones, no la
    // cantidad de filas: una fila con 100 repeticiones son 100 pasadas.
    const reps = Array.isArray(actual.repeticiones_por_fila) ? actual.repeticiones_por_fila : null;
    const pasadasPorVuelta = reps && reps.length
      ? reps.reduce((a, r) => a + (Number(r) || 1), 0)
      : actual.filas;

    await cliente.query(
      `UPDATE historial_produccion
          SET pasadas_sensor = $1,
              fila_actual = COALESCE($2, fila_actual),
              columna_actual = 0,
              pasada_actual = 0,
              repeticion_en_fila = COALESCE($5, repeticion_en_fila),
              vueltas_completadas = $4
        WHERE id = $3`,
      [pasadasSensor, filaValida, actual.id, Math.floor(pasadasSensor / Math.max(1, pasadasPorVuelta)), repValida]
    );

    // Heartbeat del sensor: mientras sea reciente, la web deja de avanzar por reloj.
    await cliente.query('UPDATE telares SET ultimo_reporte_sensor = now() WHERE id = $1', [telarId]);

    await cliente.query('COMMIT');
    res.json({ aplicado: true, pasadas_sensor: pasadasSensor });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    cliente.release();
  }
}
