-- 017 · El máximo de filas de un dibujo pasa de 100 a 300.
-- Con las repeticiones por fila alcanzaba para la mayoría de los dibujos, pero el equipo
-- pidió margen para dibujos con más filas distintas. Los dibujos guardados tienen como
-- máximo 100 filas, así que todos cumplen la restricción nueva.
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_filas_rango;
ALTER TABLE patrones
  ADD CONSTRAINT patrones_filas_rango CHECK (filas BETWEEN 1 AND 300);
