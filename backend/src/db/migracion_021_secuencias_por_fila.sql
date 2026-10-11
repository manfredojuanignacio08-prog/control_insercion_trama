-- ============================================================
-- 021 · Filas intercaladas: una secuencia de bobinas por fila.
--
-- Un tramo como "una pasada de la bobina 1, una de la 3, una de la 4 y una de la 2, hasta
-- completar 120 pasadas" es UNA fila: sus repeticiones son las 120 pasadas del tramo y la
-- secuencia dice qué bobina va en cada una, en orden y volviendo a empezar (1, 3, 4, 2, 1, 3...).
-- Antes había que dibujar 120 filas de una bobina cada una, con el límite de 300 filas.
--
-- Un elemento por fila: NULL (fila común, una sola bobina) o un array de 2 a 16 bobinas
-- numeradas desde 1, por ejemplo [1, 3, 4, 2]. En matriz_pasadas esa fila marca las bobinas
-- que aparecen en la secuencia. NULL en la columna entera = ninguna fila intercalada.
ALTER TABLE patrones ADD COLUMN IF NOT EXISTS secuencias_por_fila JSONB;

COMMENT ON COLUMN patrones.secuencias_por_fila IS
  'Por fila: NULL o el orden de las bobinas (desde 1) que se alternan pasada por pasada en esa fila. Las repeticiones de la fila son el total de pasadas del tramo.';
