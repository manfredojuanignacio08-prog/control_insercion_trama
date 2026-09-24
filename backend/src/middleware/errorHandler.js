// Middleware centralizado de manejo de errores.
// Cualquier controller que llame a next(err) termina acá.
export function errorHandler(err, req, res, next) {
  if (!err.status || err.status >= 500) console.error(err);

  // Datos mal formados que llegan hasta PostgreSQL: un id que no es número, un número
  // fuera de rango, un campo obligatorio vacío o un valor que viola una restricción.
  // Son errores del pedido, no del servidor: se responde 400 con un mensaje propio y
  // nunca el texto interno de la base, que expondría nombres de tipos y columnas.
  const DATOS_INVALIDOS = {
    '22P02': 'Algún dato del pedido no tiene el formato esperado (por ejemplo, un número escrito como texto).',
    '22003': 'Algún número del pedido está fuera del rango permitido.',
    '22001': 'Algún texto del pedido es demasiado largo.',
    '22007': 'Alguna fecha del pedido no tiene un formato válido.',
    '22008': 'Alguna fecha del pedido está fuera de rango.',
    '23502': 'Falta un dato obligatorio.',
    '23514': 'Algún valor está fuera de los límites permitidos.',
  };
  if (DATOS_INVALIDOS[err.code]) {
    return res.status(400).json({ error: DATOS_INVALIDOS[err.code] });
  }

  // Violación de UNIQUE (ej: nombre de patrón o código de telar repetido)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único.' });
  }

  // Violación de FOREIGN KEY (ej: borrar un patrón con historial asociado)
  if (err.code === '23503') {
    return res.status(409).json({
      error: 'No se puede completar la operación: hay registros relacionados que dependen de este dato.',
    });
  }

  // Una consulta (o una espera de bloqueo FOR UPDATE) superó el
  // statement_timeout configurado en db.js. En vez de un 500 genérico,
  // devolvemos un 503 claro: "probá de nuevo", porque normalmente se
  // resuelve solo apenas se libera lo que estaba bloqueando.
  if (err.code === '57014') {
    return res.status(503).json({
      error: 'El telar está ocupado en este momento (timeout). Probá de nuevo en unos segundos.',
    });
  }

  // La transacción quedó "a mitad de camino" demasiado tiempo y Postgres
  // la cerró sola (idle_in_transaction_session_timeout).
  if (err.code === '25P03') {
    return res.status(503).json({
      error: 'La operación anterior quedó inconclusa y se canceló sola. Probá de nuevo.',
    });
  }

  // Para errores con status conocido (404/400/409 que lanzamos nosotros),
  // el mensaje es seguro y útil. Para un 500 inesperado en producción, no
  // exponemos el mensaje interno (podría filtrar nombres de tablas, rutas,
  // etc.) (se loguea completo arriba, pero al cliente le va un texto genérico).
  const status = err.status || 500;
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    return res.status(status).json({ error: 'Error interno del servidor' });
  }
  // Si el error trae un `codigo` propio (ej: PATRON_EN_PRODUCCION), se pasa al cliente:
  // la web lo usa para distinguir un 409 de otro sin depender del texto del mensaje.
  const cuerpo = { error: err.message || 'Error interno del servidor' };
  if (err.codigo) cuerpo.codigo = err.codigo;
  res.status(status).json(cuerpo);
}

export function notFound(mensaje = 'Recurso no encontrado') {
  const err = new Error(mensaje);
  err.status = 404;
  return err;
}

export function badRequest(mensaje = 'Solicitud inválida') {
  const err = new Error(mensaje);
  err.status = 400;
  return err;
}

export function conflict(mensaje = 'Conflicto con el estado actual', codigo = null) {
  const err = new Error(mensaje);
  err.status = 409;
  if (codigo) err.codigo = codigo;
  return err;
}
