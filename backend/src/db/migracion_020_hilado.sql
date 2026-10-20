-- ============================================================
-- 020 · Hilado del dibujo: peso y máximo de metros que alcanza a tejer.
--
-- El operario carga cuánto pesa el hilado disponible (kg) y cuántos metros de tela alcanza a
-- tejer con él. Con los metros por pasada (migración 011) y el conteo de pasadas, la ficha
-- y el PDF muestran cuánto hilado se usó, cuánto queda y cuántos metros faltan.
--
-- hilado_pasadas_base guarda las pasadas que ya tenía tejidas el dibujo cuando se cargó ese
-- hilado: lo usado se cuenta desde ahí, no desde la primera vez que se tejió el dibujo. Se
-- vuelve a tomar al cargar un hilado nuevo ("empezar de cero").
ALTER TABLE patrones
  ADD COLUMN IF NOT EXISTS hilado_peso_kg      NUMERIC(10, 3)
    CHECK (hilado_peso_kg IS NULL OR (hilado_peso_kg > 0 AND hilado_peso_kg <= 100000)),
  ADD COLUMN IF NOT EXISTS hilado_metros_max   NUMERIC(12, 2)
    CHECK (hilado_metros_max IS NULL OR (hilado_metros_max > 0 AND hilado_metros_max <= 10000000)),
  ADD COLUMN IF NOT EXISTS hilado_pasadas_base INTEGER
    CHECK (hilado_pasadas_base IS NULL OR hilado_pasadas_base >= 0);

COMMENT ON COLUMN patrones.hilado_peso_kg IS
  'Peso del hilado disponible para este dibujo, en kg. NULL = sin cargar.';
COMMENT ON COLUMN patrones.hilado_metros_max IS
  'Metros de tela que alcanza a tejer ese hilado (el máximo a poder hacer). NULL = sin cargar.';
COMMENT ON COLUMN patrones.hilado_pasadas_base IS
  'Pasadas acumuladas del dibujo cuando se cargó el hilado: el consumo se cuenta desde acá.';
