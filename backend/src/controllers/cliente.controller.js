// ============================================================================
//  Vista para clientes: cada tejido (un dibujo) puede tener una clave
//
//  El operario genera la clave desde la ficha del dibujo y se la pasa al cliente. El cliente la
//  escribe en la página (pestaña "Clientes" del ingreso) y entra a una vista de SOLO LECTURA de ese
//  tejido: cómo se ve la tela, si se está tejiendo, cuánto avanzó, los metros tejidos y, si el
//  operario cargó los metros encargados, cuánto lleva del pedido. No ve otros dibujos, ni los
//  controles del telar, ni los errores, ni quién lo operó.
//
//  Seguridad:
//   - La clave no se guarda en texto plano: un hash para buscarla y una copia cifrada con
//     RECOVERY_SECRET para que el operario la pueda volver a ver (ver utils/codigos.js).
//   - Es una por tejido y única: generar una nueva reemplaza la anterior, que deja de andar
//     también para quien ya había entrado (la cookie del cliente lleva el comienzo del hash).
//   - Los intentos de entrar tienen un límite por IP (cliente.routes.js).
//   - La cookie del cliente (trama_cliente) solo viaja a /api/cliente y no abre ninguna otra ruta.
// ============================================================================
import { pool } from '../db.js';
import { badRequest, notFound } from '../middleware/errorHandler.js';
import { emitirSesionCliente, leerSesionCliente, cerrarSesionCliente } from '../middleware/auth.js';
import { cifrarCodigo, descifrarCodigo, generarClaveCliente, hashClaveCliente, normalizarClaveCliente } from '../utils/codigos.js';
import { largosDeFilas, normalizarGrupos, filaDeIntercalado } from '../utils/posicion.js';
import { calcularEstadisticas } from './patrones.controller.js';

const HUELLA = 20;   // caracteres del hash de la clave que viajan en la cookie

// ─── Lado del operario: generar, ver, cambiar y quitar la clave ──────

function leerNombreCliente(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw badRequest('cliente_nombre debe ser un texto.');
  const t = v.trim();
  if (!t) return null;
  if (t.length > 80 || /[\u0000-\u001f\u007f]/.test(t)) throw badRequest('El nombre del cliente tiene que tener hasta 80 caracteres, sin caracteres de control.');
  return t;
}

function leerMetrosPedidos(v) {
  if (v === undefined || v === null || v === '') return null;
  // Solo un número o un texto con un número (Number([5]) daba 5 y Number(true), 1).
  const n = (typeof v === 'number' || typeof v === 'string') ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 10000000) {
    throw badRequest('Los metros encargados tienen que ser un número mayor que 0 (hasta 10.000.000).');
  }
  return Math.round(n * 100) / 100;
}

function aRespuesta(fila) {
  if (!fila) return null;
  const clave = descifrarCodigo(fila.clave_cifrada);
  return {
    cliente_nombre: fila.cliente_nombre,
    metros_pedidos: fila.metros_pedidos === null ? null : Number(fila.metros_pedidos),
    // Si cambió RECOVERY_SECRET, la copia cifrada ya no se puede leer: la clave sigue andando, pero
    // para volver a mostrarla hay que generar una nueva.
    clave: typeof clave === 'string' ? clave : null,
    creada_at: fila.creada_at,
    creada_por: fila.creada_por,
    ultimo_acceso: fila.ultimo_acceso,
  };
}

async function existePatron(id) {
  const { rows } = await pool.query('SELECT id FROM patrones WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound(`No existe el dibujo con id ${id}.`);
}

// GET /api/patrones/:id/acceso-cliente
export async function verAccesoCliente(req, res, next) {
  try {
    await existePatron(req.params.id);
    const { rows } = await pool.query('SELECT * FROM accesos_cliente WHERE patron_id = $1', [req.params.id]);
    res.json({ acceso: aRespuesta(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// POST /api/patrones/:id/acceso-cliente  { cliente_nombre?, metros_pedidos? }
// Genera la clave (o una nueva, que reemplaza la anterior). Los datos que no se mandan se conservan.
export async function generarAccesoCliente(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const nombre = 'cliente_nombre' in body ? leerNombreCliente(body.cliente_nombre) : undefined;
    const metros = 'metros_pedidos' in body ? leerMetrosPedidos(body.metros_pedidos) : undefined;
    await existePatron(id);
    // La clave es al azar: un choque con otra existente es casi imposible, pero si pasa (23505) se
    // prueba con otra.
    for (let intento = 0; intento < 5; intento++) {
      const clave = generarClaveCliente();
      try {
        const { rows } = await pool.query(
          `INSERT INTO accesos_cliente (patron_id, cliente_nombre, metros_pedidos, clave_hash, clave_cifrada, creada_por)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (patron_id) DO UPDATE
             SET clave_hash = EXCLUDED.clave_hash, clave_cifrada = EXCLUDED.clave_cifrada,
                 creada_por = EXCLUDED.creada_por, creada_at = now(), ultimo_acceso = NULL,
                 cliente_nombre = CASE WHEN $7 THEN EXCLUDED.cliente_nombre ELSE accesos_cliente.cliente_nombre END,
                 metros_pedidos = CASE WHEN $8 THEN EXCLUDED.metros_pedidos ELSE accesos_cliente.metros_pedidos END
           RETURNING *`,
          [id, nombre ?? null, metros ?? null, hashClaveCliente(clave), cifrarCodigo(clave),
           req.usuario?.usuario || null, nombre !== undefined, metros !== undefined]
        );
        return res.status(201).json({ acceso: aRespuesta(rows[0]) });
      } catch (err) {
        if (err.code !== '23505' || !/clave_hash/.test(String(err.constraint || err.detail || ''))) throw err;
      }
    }
    throw new Error('No se pudo generar una clave única: intentá de nuevo.');
  } catch (err) {
    next(err);
  }
}

// PATCH /api/patrones/:id/acceso-cliente  { cliente_nombre?, metros_pedidos? }
// Cambia el nombre del cliente o los metros encargados sin tocar la clave.
export async function editarAccesoCliente(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const cambiaNombre = 'cliente_nombre' in body, cambiaMetros = 'metros_pedidos' in body;
    if (!cambiaNombre && !cambiaMetros) throw badRequest('Mandá cliente_nombre o metros_pedidos.');
    const nombre = cambiaNombre ? leerNombreCliente(body.cliente_nombre) : null;
    const metros = cambiaMetros ? leerMetrosPedidos(body.metros_pedidos) : null;
    const { rows } = await pool.query(
      `UPDATE accesos_cliente
          SET cliente_nombre = CASE WHEN $2 THEN $3 ELSE cliente_nombre END,
              metros_pedidos = CASE WHEN $4 THEN $5::numeric ELSE metros_pedidos END
        WHERE patron_id = $1
        RETURNING *`,
      [id, cambiaNombre, nombre, cambiaMetros, metros]
    );
    if (rows.length === 0) {
      await existePatron(id);
      throw notFound('Este dibujo todavía no tiene clave para el cliente.');
    }
    res.json({ acceso: aRespuesta(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/patrones/:id/acceso-cliente — la clave deja de andar, también para quien ya entró.
export async function quitarAccesoCliente(req, res, next) {
  try {
    await existePatron(req.params.id);
    await pool.query('DELETE FROM accesos_cliente WHERE patron_id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ─── Lado del cliente ─────────────────────────────────────────────────

const sinAcceso = (res, mensaje) => res.status(401).json({ error: mensaje, codigo: 'CLIENTE_SIN_ACCESO' });

// POST /api/cliente/entrar  { clave }
export async function entrarCliente(req, res, next) {
  try {
    const clave = req.body?.clave;
    if (typeof clave !== 'string' || clave.length > 40 || normalizarClaveCliente(clave).length < 8) {
      return res.status(400).json({ error: 'Escribí la clave que te pasaron (por ejemplo TEJ-K7QX-4AMP).' });
    }
    const hash = hashClaveCliente(clave);
    const { rows } = await pool.query(
      `UPDATE accesos_cliente SET ultimo_acceso = now() WHERE clave_hash = $1
       RETURNING patron_id, cliente_nombre`,
      [hash]
    );
    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Esa clave no es válida (o la cambiaron). Revisala o pedísela de nuevo a la fábrica.',
        codigo: 'CLAVE_INVALIDA',
      });
    }
    emitirSesionCliente(req, res, { patronId: rows[0].patron_id, huella: hash.slice(0, HUELLA) });
    res.json({ ok: true, cliente_nombre: rows[0].cliente_nombre });
  } catch (err) {
    next(err);
  }
}

// POST /api/cliente/salir
export function salirCliente(req, res) {
  cerrarSesionCliente(req, res);
  res.json({ ok: true });
}

// Fila y pasada para mostrarle al cliente, con la misma cuenta que usa el telar (utils/posicion.js).
function posicionParaCliente(p, h) {
  const filas = p.filas;
  const largos = largosDeFilas(p.repeticiones_por_fila, filas, p.grupos_intercalados);
  let fila = Number.isInteger(h.fila_actual) && h.fila_actual >= 0 && h.fila_actual < filas ? h.fila_actual : 0;
  while (fila > 0 && largos[fila] === 0) fila--;
  const largo = largos[fila] || 1;
  const hechas = Math.min(Math.max(0, Number(h.repeticion_en_fila) || 0), largo - 1);
  const grupo = normalizarGrupos(p.grupos_intercalados, filas).find((g) => g.desde === fila) || null;
  const visible = grupo ? filaDeIntercalado(grupo, p.repeticiones_por_fila, hechas) : fila;
  const porVuelta = largos.reduce((a, b) => a + b, 0) || 1;
  let antes = 0;
  for (let i = 0; i < fila; i++) antes += largos[i];
  return {
    fila: visible + 1,
    filas,
    pasada: hechas + 1,
    de: largo,
    intercalado: Boolean(grupo),
    // Cuánto de una vuelta del dibujo ya se tejió (el dibujo se repite en bucle).
    porcentaje_vuelta: Math.round(((antes + hechas) / porVuelta) * 1000) / 10,
  };
}

// GET /api/cliente/tejido — todo lo que ve el cliente, en un solo pedido (la vista lo repite cada
// tanto para mantenerse al día).
export async function tejidoCliente(req, res, next) {
  try {
    const s = leerSesionCliente(req);
    if (!s) return sinAcceso(res, 'Escribí la clave de tu tejido para verlo.');
    const acc = await pool.query('SELECT patron_id, cliente_nombre, metros_pedidos, clave_hash FROM accesos_cliente WHERE patron_id = $1', [s.patronId]);
    if (acc.rows.length === 0 || acc.rows[0].clave_hash.slice(0, HUELLA) !== s.huella) {
      cerrarSesionCliente(req, res);
      return sinAcceso(res, 'La clave de este tejido cambió o ya no está habilitada. Pedile la nueva a la fábrica.');
    }
    const a = acc.rows[0];
    const pr = await pool.query(
      `SELECT id, nombre, filas, columnas, matriz_pasadas, colores_filas, repeticiones_por_fila,
              grupos_intercalados, metadata, metros_por_pasada
         FROM patrones WHERE id = $1`,
      [a.patron_id]
    );
    if (pr.rows.length === 0) { cerrarSesionCliente(req, res); return sinAcceso(res, 'Este tejido ya no está disponible.'); }
    const p = pr.rows[0];
    const est = await calcularEstadisticas(p.id);

    // En qué telares se está tejiendo ahora (una producción abierta), y las últimas producciones.
    const enCurso = await pool.query(
      `SELECT h.fila_actual, h.repeticion_en_fila, h.fecha_inicio, h.pasadas_totales, h.pasadas_sensor,
              t.estado, t.nombre AS telar_nombre, t.codigo AS telar_codigo
         FROM historial_produccion h JOIN telares t ON t.id = h.telar_id
        WHERE h.patron_id = $1 AND h.estado = 'en_curso'
        ORDER BY h.fecha_inicio`,
      [p.id]
    );
    const hist = await pool.query(
      `SELECT fecha_inicio, fecha_fin, estado,
              CASE WHEN pasadas_sensor > 0 THEN pasadas_sensor ELSE pasadas_totales END AS pasadas
         FROM historial_produccion WHERE patron_id = $1
        ORDER BY fecha_inicio DESC LIMIT 20`,
      [p.id]
    );

    const mpp = p.metros_por_pasada === null ? null : Number(p.metros_por_pasada);
    const pedidos = a.metros_pedidos === null ? null : Number(a.metros_pedidos);
    const metros = mpp === null ? null : est.metros_tejidos;
    const pedido = pedidos === null ? null : {
      metros_pedidos: pedidos,
      metros_tejidos: metros,
      porcentaje: metros === null ? null : Math.min(100, Math.round((metros / pedidos) * 1000) / 10),
      metros_que_faltan: metros === null ? null : Math.max(0, Math.round((pedidos - metros) * 100) / 100),
      completo: metros !== null && metros >= pedidos,
    };

    res.json({
      cliente_nombre: a.cliente_nombre,
      tejido: {
        nombre: p.nombre,
        tipo: p.metadata && typeof p.metadata.tipo === 'string' ? p.metadata.tipo : null,
        filas: p.filas,
        columnas: p.columnas,
        matriz_pasadas: p.matriz_pasadas,
        colores_filas: p.colores_filas,
        repeticiones_por_fila: p.repeticiones_por_fila,
        grupos_intercalados: p.grupos_intercalados,
        metros_por_pasada: mpp,
      },
      en_telar: enCurso.rows.map((h) => ({
        telar: h.telar_nombre || h.telar_codigo,
        estado: h.estado === 'tejiendo' ? 'tejiendo' : h.estado === 'pausado' ? 'pausado' : 'detenido',
        desde: h.fecha_inicio,
        pasadas: Number(h.pasadas_sensor) > 0 ? Number(h.pasadas_sensor) : Number(h.pasadas_totales) || 0,
        posicion: posicionParaCliente(p, h),
      })),
      resumen: {
        pasadas_tejidas: est.pasadas_totales,
        metros_tejidos: metros,
        metros_son_estimados: est.metros_son_estimados ?? true,
        precision_conteo: est.precision_conteo,
        aviso_precision: est.aviso_precision || null,
        producciones: est.producciones,
        primera_vez: est.primera_vez,
        ultima_vez: est.ultima_vez,
      },
      pedido,
      historial: hist.rows.map((h) => ({
        desde: h.fecha_inicio,
        hasta: h.fecha_fin,
        estado: h.estado === 'en_curso' ? 'en_curso' : 'terminada',
        pasadas: Number(h.pasadas) || 0,
      })),
      actualizado: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
