// Middleware centralizado de manejo de errores.
// Cualquier controller que llame a next(err) termina acá.
export function errorHandler(err, req, res, next) {
  console.error(err);

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

  // Para errores con status conocido (404/400/409 que lanzamos nosotros),
  // el mensaje es seguro y útil. Para un 500 inesperado en producción, no
  // exponemos el mensaje interno (podría filtrar nombres de tablas, rutas,
  // etc.) — se loguea completo arriba, pero al cliente le va un texto genérico.
  const status = err.status || 500;
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    return res.status(status).json({ error: 'Error interno del servidor' });
  }
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
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

export function conflict(mensaje = 'Conflicto con el estado actual') {
  const err = new Error(mensaje);
  err.status = 409;
  return err;
}
