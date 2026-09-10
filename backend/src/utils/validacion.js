/**
 * Valida el body de creación/actualización de un patrón.
 * Devuelve un array de strings con los errores encontrados (vacío si está OK).
 */
export function validarPatron(body) {
  const { nombre, filas, columnas, matriz_pasadas, colores_filas } = body;
  const errores = [];

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    errores.push('nombre es requerido y debe ser texto.');
  }

  // El rango 2 a 32 no es arbitrario: es el que valida el editor de la aplicación
  // y el que soporta el firmware, cuyo MAX_FILAS es 32. Aceptar valores fuera de
  // ese rango produciría dibujos que el operario no puede ver ni el telar ejecutar.
  const MIN_DIM = 2;
  const MAX_DIM = 32;
  const filasOk = Number.isInteger(filas) && filas >= MIN_DIM && filas <= MAX_DIM;
  const columnasOk = Number.isInteger(columnas) && columnas >= MIN_DIM && columnas <= MAX_DIM;
  if (!filasOk) errores.push(`filas debe ser un entero entre ${MIN_DIM} y ${MAX_DIM}.`);
  if (!columnasOk) errores.push(`columnas debe ser un entero entre ${MIN_DIM} y ${MAX_DIM}.`);

  if (!Array.isArray(matriz_pasadas)) {
    errores.push('matriz_pasadas debe ser un array de arrays de números.');
  } else {
    if (filasOk && matriz_pasadas.length !== filas) {
      errores.push(`matriz_pasadas debe tener ${filas} filas (tiene ${matriz_pasadas.length}).`);
    }
    const filaInvalida = matriz_pasadas.some(
      (fila) =>
        !Array.isArray(fila) ||
        (columnasOk && fila.length !== columnas) ||
        fila.some((celda) => typeof celda !== 'number' || celda < 0 || !Number.isFinite(celda))
    );
    if (filaInvalida) {
      errores.push(`cada fila de matriz_pasadas debe tener ${columnasOk ? columnas : 'la misma cantidad de'} números >= 0.`);
    }
  }

  if (colores_filas !== undefined && colores_filas !== null) {
    if (!Array.isArray(colores_filas) || (filasOk && colores_filas.length !== filas)) {
      errores.push(`colores_filas debe ser un array con ${filasOk ? filas : 'la misma cantidad de'} elementos.`);
    }
  }

  return errores;
}
