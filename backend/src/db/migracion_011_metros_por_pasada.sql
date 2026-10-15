-- ============================================================
-- Migración 011: metros de tela por pasada
--
-- Cada pasada del telar inserta un hilo de trama y hace avanzar la tela una
-- distancia muy chica, que depende de la densidad del tejido y del artículo.
-- Ese número lo conoce el operario, no el sistema.
--
-- Guardarlo junto al dibujo permite convertir el conteo de pasadas en metros
-- reales de tela, que es la unidad con la que se trabaja en la fábrica: el
-- cliente no pide "veinte mil pasadas", pide "ochenta metros".
--
-- Queda en NULL mientras no se cargue. Las estadísticas que dependen de este
-- valor simplemente no se muestran hasta que exista.
-- ============================================================

ALTER TABLE patrones
  ADD COLUMN IF NOT EXISTS metros_por_pasada NUMERIC(10, 6)
  CHECK (metros_por_pasada IS NULL OR (metros_por_pasada > 0 AND metros_por_pasada <= 1));

COMMENT ON COLUMN patrones.metros_por_pasada IS
  'Metros de tela que avanza el telar en una pasada, para este dibujo. Lo carga el operario desde el editor. En NULL mientras no se conozca.';
