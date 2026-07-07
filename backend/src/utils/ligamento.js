/**
 * Deriva una matriz de ligamento binaria (0/1) a partir de la matriz de pasadas.
 * Regla por defecto: cualquier celda con pasadas > 0 se considera lizo "arriba" (1).
 * Esto es un valor por defecto provisorio: el editor todavía no tiene una UI para
 * definir el ligamento textil real de forma independiente. Cuando se agregue esa UI,
 * el frontend puede enviar matriz_ligamento explícitamente y este cálculo se ignora.
 */
export function derivarLigamentoDesdePasadas(matrizPasadas) {
  if (!Array.isArray(matrizPasadas)) return null;
  return matrizPasadas.map((fila) => fila.map((celda) => (Number(celda) > 0 ? 1 : 0)));
}
