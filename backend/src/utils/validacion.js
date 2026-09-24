/**
 * Valida el body de creación/actualización de un patrón.
 * Devuelve un array de strings con los errores encontrados (vacío si está OK).
 */
export function validarPatron(body) {
  const { nombre, filas, columnas, matriz_pasadas, colores_filas, repeticiones_por_fila } = body;
  const errores = [];

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    errores.push('nombre es requerido y debe ser texto.');
  }

  // Las columnas son bobinas de selección: una máquina tiene entre 1 y 8, así que
  // un dibujo más ancho que eso no se podría ejecutar. Las filas van de 1 a 100;
  // para tejer muchas pasadas iguales está repeticiones_por_fila, no filas repetidas.
  const MAX_FILAS = 100;
  const MAX_COLUMNAS = 8;
  const MAX_REPETICIONES = 9999;
  const filasOk = Number.isInteger(filas) && filas >= 1 && filas <= MAX_FILAS;
  const columnasOk = Number.isInteger(columnas) && columnas >= 1 && columnas <= MAX_COLUMNAS;
  if (!filasOk) errores.push(`filas debe ser un entero entre 1 y ${MAX_FILAS}.`);
  if (!columnasOk) errores.push(`columnas debe ser un entero entre 1 y ${MAX_COLUMNAS} (una por bobina de selección).`);

  // repeticiones_por_fila es opcional. Si viene, tiene que traer un número por
  // cada fila: si faltara alguno, el telar no sabría cuántas pasadas tejer.
  if (repeticiones_por_fila !== undefined && repeticiones_por_fila !== null) {
    if (!Array.isArray(repeticiones_por_fila)) {
      errores.push('repeticiones_por_fila debe ser un array de enteros, uno por fila.');
    } else {
      if (filasOk && repeticiones_por_fila.length !== filas) {
        errores.push(`repeticiones_por_fila debe tener ${filas} elementos, uno por fila (llegaron ${repeticiones_por_fila.length}).`);
      }
      const malos = repeticiones_por_fila.filter((r) => !Number.isInteger(r) || r < 1 || r > MAX_REPETICIONES);
      if (malos.length) errores.push(`Cada repetición debe ser un entero entre 1 y ${MAX_REPETICIONES}.`);
    }
  }

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
