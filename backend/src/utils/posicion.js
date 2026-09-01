/**
 * MODELO DE TEJIDO — una FILA es una PASADA.
 *
 * Así trabaja el dobby del telar: en cada pasada, la fila del patrón define
 * QUÉ MARCOS suben. Cada columna de la fila es una bobina/electroimán:
 *   [1, 1, 1] → suben los tres marcos
 *   [0, 1, 0] → sube solo el del medio
 *
 * Es decir, las columnas NO se recorren una por una: se envían juntas, de
 * una sola vez, porque son simultáneas dentro de la misma pasada. Lo que
 * avanza pasada a pasada es la FILA.
 *
 * Repeticiones: si una fila tiene números mayores a 1, esa pasada se repite
 * esa cantidad de veces antes de pasar a la siguiente fila. Se toma el mayor
 * valor de la fila como cantidad de repeticiones (una fila entera se repite
 * junta, no puede repetirse "media fila"). Una fila sin ningún 1 sigue
 * siendo una pasada válida: simplemente no sube ningún marco.
 */

/** Cuántas veces se repite una fila antes de pasar a la siguiente (mínimo 1). */
export function repeticionesDeFila(fila) {
  if (!Array.isArray(fila) || fila.length === 0) return 1;
  const max = Math.max(...fila.map((v) => Number(v) || 0));
  return max > 0 ? max : 1;
}

/** Qué marcos suben en una fila: devuelve los índices con valor mayor a 0. */
export function marcosActivosDeFila(fila) {
  if (!Array.isArray(fila)) return [];
  return fila.reduce((acc, v, i) => ((Number(v) || 0) > 0 ? [...acc, i] : acc), []);
}

/**
 * Avanza la posición N pasadas. Espejo exacto de doTick() en el frontend.
 * El patrón se teje en bucle: al terminar la última fila vuelve a la
 * primera (no existe un "final", así funciona un telar real).
 *
 * columna_actual se conserva en la firma y en la base por compatibilidad,
 * pero ya no marca posición: dentro de una pasada todas las columnas son
 * simultáneas. Siempre se devuelve 0.
 */
export function avanzarPosicionTejido(filaActual, columnaActual, pasadaActual, matrizPasadas, pasos) {
  const filas = matrizPasadas.length;
  if (filas === 0) return { fila_actual: 0, columna_actual: 0, pasada_actual: 0, vueltas_completadas: 0 };

  let fila = filaActual;
  let pasada = pasadaActual;
  let vueltas = 0;

  for (let i = 0; i < pasos; i++) {
    const repeticiones = repeticionesDeFila(matrizPasadas[fila]);
    pasada++;
    if (pasada >= repeticiones) {
      pasada = 0;
      fila++;
      if (fila >= filas) {
        fila = 0;
        vueltas++; // completó una vuelta entera del patrón
      }
    }
  }

  return { fila_actual: fila, columna_actual: 0, pasada_actual: pasada, vueltas_completadas: vueltas };
}

/**
 * Retrocede N pasadas. Espejo de la función de arriba: si la fila estaba
 * repitiéndose, retrocede una repetición; si estaba en la primera, vuelve
 * a la fila anterior (a su última repetición). No pasa de la fila 0.
 */
export function retrocederPosicionTejido(filaActual, columnaActual, matrizPasadas, pasos) {
  const filas = Array.isArray(matrizPasadas) ? matrizPasadas.length : 0;
  let fila = filaActual;
  let pasada = 0;
  let alInicio = false;

  // Compatibilidad: si llega un número en vez de la matriz (firma vieja),
  // se retrocede fila a fila sin repeticiones.
  const matriz = filas > 0 ? matrizPasadas : null;

  for (let i = 0; i < pasos; i++) {
    if (fila <= 0) {
      fila = 0;
      pasada = 0;
      alInicio = true;
      break;
    }
    fila--;
    pasada = matriz ? repeticionesDeFila(matriz[fila]) - 1 : 0;
  }

  return { fila_actual: fila, columna_actual: 0, pasada_actual: pasada, al_inicio: alInicio };
}
