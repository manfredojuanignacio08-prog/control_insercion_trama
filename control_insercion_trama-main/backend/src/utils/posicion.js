/**
 * Avanza la posición de tejido N pasos, usando EXACTAMENTE la misma lógica
 * que doTick() en el frontend (index.html): cada celda (fila, columna) tiene
 * un número de "pasadas" — se repite esa celda esa cantidad de veces antes
 * de pasar a la siguiente columna. Al terminar una fila, pasa a la
 * siguiente. Al terminar todas las filas, vuelve a la fila 0 y sigue —
 * el patrón se teje en bucle infinito hasta que alguien lo detenga
 * (no existe un "final", por diseño: así es como funciona un telar real).
 *
 * matrizPasadas: array de arrays de enteros (igual que patrones.matriz_pasadas).
 */
export function avanzarPosicionTejido(filaActual, columnaActual, pasadaActual, matrizPasadas, pasos) {
  const filas = matrizPasadas.length;
  const columnas = matrizPasadas[0]?.length || 0;

  let fila = filaActual;
  let columna = columnaActual;
  let pasada = pasadaActual;
  let vueltas = 0;

  for (let i = 0; i < pasos; i++) {
    const cellPasadas = (matrizPasadas[fila] && matrizPasadas[fila][columna]) || 0;

    if (cellPasadas === 0) {
      columna++;
    } else {
      pasada++;
      if (pasada >= cellPasadas) {
        pasada = 0;
        columna++;
      }
    }

    if (columna >= columnas) {
      columna = 0;
      fila++;
      if (fila >= filas) {
        fila = 0;
        columna = 0;
        pasada = 0;
        vueltas++; // completó una vuelta entera del patrón
      }
    }
  }

  return { fila_actual: fila, columna_actual: columna, pasada_actual: pasada, vueltas_completadas: vueltas };
}

/**
 * Retrocede la posición N pasos. Espejo exacto de rollback() en el frontend:
 * retrocede una columna (o a la última columna de la fila anterior), sin
 * importar en qué pasada de la celda estaba — al volver, esa celda se
 * retoma desde su pasada 0. No retrocede más allá de fila 0, columna 0.
 */
export function retrocederPosicionTejido(filaActual, columnaActual, columnas, pasos) {
  let fila = filaActual;
  let columna = columnaActual;
  let alInicio = false;

  for (let i = 0; i < pasos; i++) {
    if (fila <= 0 && columna <= 0) {
      alInicio = true;
      break;
    }
    if (columna > 0) {
      columna--;
    } else if (fila > 0) {
      fila--;
      columna = columnas - 1;
    }
  }

  return { fila_actual: fila, columna_actual: columna, pasada_actual: 0, al_inicio: alInicio };
}
