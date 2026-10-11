-- ============================================================
-- 022 · Intercalados por grupos de filas (reemplaza a la 021).
--
-- Cada fila lleva una sola bobina (una trama por pasada). Para alternar bobinas, varias filas
-- seguidas forman un grupo que se teje intercalado: sus filas se recorren en orden, cada una
-- tantas pasadas como sus repeticiones, y vuelven a empezar hasta completar las pasadas del
-- grupo. Por ejemplo, las filas 1 a 4 (bobinas 1, 3, 4 y 2) durante 120 pasadas.
--
-- Formato: un array de {desde, hasta, pasadas}, con desde y hasta como índices de fila desde
-- 0 (desde < hasta) y grupos que no se superponen. NULL = ningún intercalado.
--
-- La 021 guardaba el orden adentro de una sola fila (una fila con varias bobinas): se descartó
-- porque una fila no puede llevar más de una bobina. Su columna se borra.
ALTER TABLE patrones ADD COLUMN IF NOT EXISTS grupos_intercalados JSONB;
ALTER TABLE patrones DROP COLUMN IF EXISTS secuencias_por_fila;

COMMENT ON COLUMN patrones.grupos_intercalados IS
  'Grupos de filas que se tejen intercalados: [{desde, hasta, pasadas}] con índices de fila desde 0. NULL = ninguno.';
