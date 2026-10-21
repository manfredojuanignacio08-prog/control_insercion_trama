-- ============================================================
-- Migración 015: posición dentro de la fila
--
-- Con las repeticiones por fila (migración 014), una pasada ya no equivale a
-- avanzar una fila: una fila con 100 repeticiones son 100 pasadas antes de pasar
-- a la siguiente. La posición de una producción dejó de ser un solo número.
--
-- repeticion_en_fila guarda cuántas pasadas de la fila actual ya se tejieron
-- (0 significa que todavía no se tejió ninguna de esa fila). Sin este dato, la
-- aplicación y el nodo avanzaban distinto: la web se quedaba en la fila mientras
-- el backend la adelantaba, y cada sincronización pegaba un salto.
-- ============================================================

ALTER TABLE historial_produccion
  ADD COLUMN IF NOT EXISTS repeticion_en_fila INTEGER NOT NULL DEFAULT 0
  CHECK (repeticion_en_fila >= 0);

COMMENT ON COLUMN historial_produccion.repeticion_en_fila IS
  'Cuántas pasadas de la fila actual ya se tejieron. Con repeticiones_por_fila del dibujo define la posición exacta dentro de la producción.';
