/**
 * MODELO DE TEJIDO: una FILA es una COMBINACIÓN de bobinas, que se teje durante
 * tantas pasadas seguidas como indiquen sus repeticiones (ver más abajo).
 *
 * En cada pasada, la fila define QUÉ BOBINAS de selección se activan. Cada columna
 * es una bobina y la celda es binaria (se activa o no):
 *   [1, 0, 1, 0] → se activan las bobinas 1 y 3
 *   [0, 1, 1, 0] → se activan las bobinas 2 y 3
 *
 * Las columnas NO se recorren una por una: se envían juntas, de una sola vez,
 * porque son simultáneas dentro de la misma pasada. Lo que avanza, pasada a
 * pasada, es la FILA.
 *
 * REPETICIONES (migración 014): cada fila lleva cuántas pasadas seguidas se teje.
 * En un tejido real es habitual que la misma combinación se repita cien o mil
 * veces, y dibujar cien filas idénticas era impracticable. Por eso la posición
 * son DOS números: la fila y cuántas pasadas de esa fila ya se tejieron
 * (repeticion_en_fila). Una pasada adelante suma una repetición, y solo cuando se
 * agotan las de esa fila se pasa a la siguiente. Retroceder es el espejo exacto.
 *
 * Sin repeticiones (dibujos viejos, o el array ausente) se asume una por fila y
 * todo se comporta como antes: una pasada = una fila.
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

/**
 * Normaliza las repeticiones a un array de un elemento por fila. Si no vienen, o
 * vienen incompletas, se asume 1: una pasada por fila, el comportamiento anterior.
 */
function normalizarRepeticiones(reps, filas) {
  const out = [];
  for (let i = 0; i < filas; i++) {
    const r = Array.isArray(reps) ? Number(reps[i]) : NaN;
    out.push(Number.isInteger(r) && r >= 1 ? r : 1);
  }
  return out;
}

function contarFilas(matrizOFilas) {
  if (Array.isArray(matrizOFilas)) return matrizOFilas.length;
  const n = Number(matrizOFilas);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * La posición como un solo número: cuántas pasadas hay desde el principio del dibujo
 * hasta (fila, dentro). Con eso avanzar o retroceder es una suma y un módulo, y el costo
 * no depende de cuántas pasadas se muevan. Antes se recorrían de a una: un pedido con
 * `pasos` enorme (o un conteo del sensor gigante) dejaba al servidor ocupado durante
 * segundos o minutos sin atender a nadie más.
 */
function aDesplazamiento(fila, dentro, reps) {
  let acc = 0;
  for (let i = 0; i < fila; i++) acc += reps[i];
  return acc + dentro;
}

function desdeDesplazamiento(desplazamiento, reps) {
  let resto = desplazamiento;
  for (let fila = 0; fila < reps.length; fila++) {
    if (resto < reps[fila]) return { fila, dentro: resto };
    resto -= reps[fila];
  }
  return { fila: 0, dentro: 0 };   // no ocurre: el desplazamiento siempre es menor que una vuelta
}

// Fila y pasada dentro de la fila, normalizadas como siempre: la fila envuelta al rango
// del dibujo y una pasada fuera de rango (dato incoherente) reencuadrada al principio.
function posicionInicial(filaActual, repeticionEnFila, filas, reps) {
  const fila = ((Number(filaActual) || 0) % filas + filas) % filas;
  let dentro = Math.max(0, Math.trunc(Number(repeticionEnFila) || 0));
  if (dentro >= reps[fila]) dentro = 0;
  return { fila, dentro };
}

const pasosValidos = (pasos) => Math.max(0, Math.trunc(Number(pasos) || 0));

/**
 * Avanza la posición `pasos` pasadas.
 * `matrizOFilas` puede ser la matriz del dibujo o directamente su cantidad de filas.
 * Devuelve la nueva fila y cuántas vueltas completas del dibujo se dieron.
 */
export function avanzarPosicionTejido(filaActual, matrizOFilas, pasos = 1, repeticiones = null, repeticionEnFila = 0) {
  const filas = contarFilas(matrizOFilas);
  if (filas === 0) {
    return { fila_actual: 0, columna_actual: 0, pasada_actual: 0, repeticion_en_fila: 0, vueltas_completadas: 0 };
  }
  const reps = normalizarRepeticiones(repeticiones, filas);
  const porVuelta = reps.reduce((a, r) => a + r, 0);
  const { fila, dentro } = posicionInicial(filaActual, repeticionEnFila, filas, reps);

  const total = aDesplazamiento(fila, dentro, reps) + pasosValidos(pasos);
  const vueltas = Math.floor(total / porVuelta);
  const destino = desdeDesplazamiento(total - vueltas * porVuelta, reps);

  return {
    fila_actual: destino.fila,
    columna_actual: 0,
    pasada_actual: 0,
    repeticion_en_fila: destino.dentro,
    vueltas_completadas: vueltas,
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
export function retrocederPosicionTejido(filaActual, matrizOFilas, pasos = 1, repeticiones = null, repeticionEnFila = 0) {
  const filas = contarFilas(matrizOFilas);
  if (filas === 0) {
    return { fila_actual: 0, columna_actual: 0, pasada_actual: 0, repeticion_en_fila: 0, vueltas_deshechas: 0, al_inicio: false };
  }
  const reps = normalizarRepeticiones(repeticiones, filas);
  const porVuelta = reps.reduce((a, r) => a + r, 0);
  const { fila, dentro } = posicionInicial(filaActual, repeticionEnFila, filas, reps);

  const total = aDesplazamiento(fila, dentro, reps) - pasosValidos(pasos);
  const vueltasDeshechas = total < 0 ? -Math.floor(total / porVuelta) : 0;
  const destino = desdeDesplazamiento(total + vueltasDeshechas * porVuelta, reps);

  return {
    fila_actual: destino.fila,
    columna_actual: 0,
    pasada_actual: 0,
    repeticion_en_fila: destino.dentro,
    vueltas_deshechas: vueltasDeshechas,
    al_inicio: vueltasDeshechas > 0,
  };
}
