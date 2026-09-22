/**
 * MODELO DE TEJIDO: una FILA es una PASADA.
 *
 * Así trabaja el dobby del telar: en cada pasada, la fila del dibujo define
 * QUÉ MARCOS suben. Cada columna de la fila es una bobina/electroimán y la
 * celda es binaria (se activa o no):
 *   [1, 1, 1] → suben los tres marcos
 *   [0, 1, 0] → sube solo el del medio
 *
 * Las columnas NO se recorren una por una: se envían juntas, de una sola vez,
 * porque son simultáneas dentro de la misma pasada. Lo que avanza, pasada a
 * pasada, es la FILA.
 *
 * Si se quiere repetir una pasada, se dibuja la misma fila dos veces. No existe
 * "repetición por celda": ese era el modelo viejo, que se descartó. Por eso la
 * posición es solo un número (fila_actual) y avanzar/retroceder son espejos
 * exactos: una pasada adelante = una fila más; una pasada atrás = una fila menos.
 *
 * El dibujo se teje en bucle (la cinta de papel del telar es un lazo): pasada la
 * última fila se vuelve a la primera, y retrocediendo desde la primera se llega
 * a la última.
 *
 * Los campos columna_actual y pasada_actual siguen existiendo en la base y en la
 * API por compatibilidad con el historial ya registrado, pero permanecen
 * siempre en 0.
 */

/** Qué marcos suben en una fila: devuelve los índices con valor mayor a 0. */
export function marcosActivosDeFila(fila) {
  if (!Array.isArray(fila)) return [];
  return fila.reduce((acc, v, i) => ((Number(v) || 0) > 0 ? [...acc, i] : acc), []);
}

function contarFilas(matrizOFilas) {
  if (Array.isArray(matrizOFilas)) return matrizOFilas.length;
  const n = Number(matrizOFilas);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Avanza la posición `pasos` pasadas.
 * `matrizOFilas` puede ser la matriz del dibujo o directamente su cantidad de filas.
 * Devuelve la nueva fila y cuántas vueltas completas del dibujo se dieron.
 */
export function avanzarPosicionTejido(filaActual, matrizOFilas, pasos = 1) {
  const filas = contarFilas(matrizOFilas);
  if (filas === 0) return { fila_actual: 0, columna_actual: 0, pasada_actual: 0, vueltas_completadas: 0 };

  const total = (Number(filaActual) || 0) + Math.max(0, Math.trunc(pasos));
  return {
    fila_actual: total % filas,
    columna_actual: 0,
    pasada_actual: 0,
    vueltas_completadas: Math.floor(total / filas),
  };
}

/**
 * Retrocede `pasos` pasadas. Es el espejo exacto de avanzarPosicionTejido:
 * (avanzar n) seguido de (retroceder n) devuelve siempre a la posición original.
 *
 * Retrocediendo desde la fila 0 se llega a la última fila (el dibujo es un lazo).
 * `vueltas_deshechas` cuenta cuántas veces se cruzó el inicio hacia atrás, para
 * que quien llama pueda descontarlas de vueltas_completadas.
 */
export function retrocederPosicionTejido(filaActual, matrizOFilas, pasos = 1) {
  const filas = contarFilas(matrizOFilas);
  if (filas === 0) return { fila_actual: 0, columna_actual: 0, pasada_actual: 0, vueltas_deshechas: 0, al_inicio: false };

  const desde = Number(filaActual) || 0;
  const n = Math.max(0, Math.trunc(pasos));
  const destino = desde - n;
  const vueltasDeshechas = destino >= 0 ? 0 : Math.ceil(-destino / filas);
  const fila = ((destino % filas) + filas) % filas;

  return {
    fila_actual: fila,
    columna_actual: 0,
    pasada_actual: 0,
    vueltas_deshechas: vueltasDeshechas,
    al_inicio: vueltasDeshechas > 0,
  };
}
