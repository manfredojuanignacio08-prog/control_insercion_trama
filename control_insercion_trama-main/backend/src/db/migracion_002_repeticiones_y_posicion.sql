-- ============================================================
-- MIGRACIÓN 002 — Posición de tejido para soportar "retroceder un paso"
--
-- Corrección de diseño: la primera versión de esta migración había
-- agregado patrones.repeticiones_filas (repetir una fila completa N veces)
-- y un repeticion_actual a nivel de fila. Eso no coincidía con cómo
-- funciona en realidad el editor: la repetición ya existe A NIVEL DE
-- CELDA (cada valor de matriz_pasadas ya es "cuántas veces se repite esa
-- celda"), y el patrón se teje en bucle infinito hasta que alguien lo
-- detiene — no tiene un "final". Esta versión corrige eso.
--
-- Agrega a historial_produccion:
--   - fila_actual, columna_actual, pasada_actual: posición exacta de la
--     producción en curso (mismo significado que curRow/curCol/curPass
--     del frontend).
--   - vueltas_completadas: cuántas veces se tejió el patrón entero de
--     punta a punta (no hay "completado", el tejido es infinito).
--
-- Si una base ya había corrido la versión anterior de esta misma
-- migración (con repeticiones_filas / repeticion_actual), esos campos se
-- eliminan acá — es seguro, no se perdió ningún dato real porque esa
-- funcionalidad nunca llegó a usarse en producción.
--
-- 100% seguro de correr contra una base con datos reales. Se puede correr
-- más de una vez sin error.
-- ============================================================

-- Limpieza de la versión anterior (si llegó a aplicarse)
ALTER TABLE patrones DROP COLUMN IF EXISTS repeticiones_filas;
ALTER TABLE historial_produccion DROP COLUMN IF EXISTS repeticion_actual;

-- Columnas correctas
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS fila_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS columna_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasada_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS vueltas_completadas INTEGER DEFAULT 0;

-- Verificación rápida (opcional, solo lectura):
-- SELECT id, telar_id, fila_actual, columna_actual, pasada_actual, vueltas_completadas FROM historial_produccion;
