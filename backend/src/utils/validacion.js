/**
 * Valida el body de creación/actualización de un patrón.
 * Devuelve un array de strings con los errores encontrados (vacío si está OK).
 */
export function validarPatron(body) {
  const { nombre, filas, columnas, matriz_pasadas, matriz_ligamento, colores_filas, metadata, repeticiones_por_fila } = body;
  const errores = [];

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    errores.push('nombre es requerido y debe ser texto.');
  } else if (nombre.trim().length > 100) {
    // Sin tope, se podía pegar un texto de miles de caracteres como nombre.
    errores.push('El nombre del dibujo puede tener hasta 100 caracteres.');
  }

  // Las columnas son bobinas de selección: una máquina tiene entre 1 y 8, así que
  // un dibujo más ancho que eso no se podría ejecutar. Las filas van de 1 a 300;
  // para tejer muchas pasadas iguales está repeticiones_por_fila, no filas repetidas.
  const MAX_FILAS = 300;
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
    } else {
      // En cada pasada se inserta una sola trama: una fila lleva como máximo una bobina activa.
      // Dos en la misma fila le pedirían al telar dos tramas a la vez.
      const dobles = [];
      matriz_pasadas.forEach((fila, i) => { if (fila.filter((celda) => celda > 0).length > 1) dobles.push(i + 1); });
      if (dobles.length) {
        const lista = dobles.slice(0, 10).join(', ') + (dobles.length > 10 ? '…' : '');
        errores.push(`Cada fila puede tener una sola bobina (una trama por pasada). Tienen más de una: ${dobles.length === 1 ? 'la fila' : 'las filas'} ${lista}.`);
      }
    }
  }

  // matriz_ligamento es opcional (si no viene, el servidor la deriva de matriz_pasadas). Si
  // viene, tiene que tener la misma forma y solo ceros y unos: antes se guardaba cualquier
  // JSON que llegara, de cualquier tamaño.
  if (matriz_ligamento !== undefined && matriz_ligamento !== null) {
    const malo = !Array.isArray(matriz_ligamento) ||
      (filasOk && matriz_ligamento.length !== filas) ||
      matriz_ligamento.some((fila) => !Array.isArray(fila) ||
        (columnasOk && fila.length !== columnas) ||
        fila.some((c) => c !== 0 && c !== 1));
    if (malo) errores.push('matriz_ligamento debe tener la misma forma que matriz_pasadas, con valores 0 o 1.');
  }

  if (colores_filas !== undefined && colores_filas !== null) {
    if (!Array.isArray(colores_filas) || (filasOk && colores_filas.length !== filas)) {
      errores.push(`colores_filas debe ser un array con ${filasOk ? filas : 'la misma cantidad de'} elementos.`);
    } else {
      // Un color por fila: hex de 6 dígitos (ej. "#1E3A5F") o null si la fila no
      // tiene color. Sin este formato, el firmware y el PDF lo interpretan cada
      // uno a su manera.
      const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
      const colorMalo = colores_filas.some((c) => c !== null && (typeof c !== 'string' || !HEX_COLOR.test(c)));
      if (colorMalo) errores.push('cada color de colores_filas debe ser un hex de 6 dígitos (ej. "#1E3A5F") o null.');
    }
  }

  // metadata es opcional, pero si viene tiene que ser un objeto plano con las
  // claves que usa el sistema (ver schema.sql: ej. {"tipo": "Tafetán"}). Sin
  // lista cerrada, cualquier cliente podría guardar claves arbitrarias que el
  // resto del código no conoce y que después nadie limpia.
  const METADATA_PERMITIDAS = ['tipo', 'nota', 'autor', 'origen'];
  if (metadata !== undefined && metadata !== null) {
    const esObjetoPlano = typeof metadata === 'object' && !Array.isArray(metadata);
    if (!esObjetoPlano) {
      errores.push('metadata debe ser un objeto plano.');
    } else {
      const clavesMalas = Object.keys(metadata).filter((k) => !METADATA_PERMITIDAS.includes(k));
      if (clavesMalas.length) {
        errores.push(`metadata trae claves no permitidas (${clavesMalas.join(', ')}): solo se admite ${METADATA_PERMITIDAS.join(', ')}.`);
      }
      // Cada valor es un dato corto (un tipo de tejido, una nota, un nombre): sin tope,
      // un solo campo podía pesar megas y quedar guardado en cada dibujo.
      const MAX_VALOR_METADATA = 200;
      const valoresMalos = Object.values(metadata).some(
        (v) => !['string', 'number', 'boolean'].includes(typeof v)
          || (typeof v === 'string' && v.length > MAX_VALOR_METADATA)
      );
      if (valoresMalos) errores.push('los valores de metadata deben ser texto (hasta 200 caracteres), número o booleano.');
    }
  }

  return errores;
}
