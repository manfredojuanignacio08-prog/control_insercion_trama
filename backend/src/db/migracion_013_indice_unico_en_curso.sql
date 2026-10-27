-- ============================================================
-- Migración 013: una sola producción 'en_curso' por telar
--
-- Hasta ahora el índice idx_historial_en_curso no era UNIQUE: nada impedía dos producciones
-- abiertas en el mismo telar, y el LEFT JOIN de listarTelares duplicaría filas.
--
-- Va en una migración aparte de la 012 a propósito: si esta falla por datos previos, las columnas
-- nuevas de la 012 (de las que depende el backend) igual quedan aplicadas.
-- ============================================================

-- Una sola producción abierta por telar. Si por algún error ya hubiera dos, se cierra
-- como detenida la más vieja (no se borra nada) para poder crear el índice.
UPDATE historial_produccion h
   SET estado = 'detenido_manual', fecha_fin = COALESCE(fecha_fin, now())
 WHERE h.estado = 'en_curso'
   AND EXISTS (
     SELECT 1 FROM historial_produccion h2
      WHERE h2.telar_id = h.telar_id AND h2.estado = 'en_curso'
        AND (h2.fecha_inicio > h.fecha_inicio OR (h2.fecha_inicio = h.fecha_inicio AND h2.id > h.id))
   );

DROP INDEX IF EXISTS idx_historial_en_curso;
CREATE UNIQUE INDEX IF NOT EXISTS idx_historial_en_curso ON historial_produccion (telar_id) WHERE estado = 'en_curso';
