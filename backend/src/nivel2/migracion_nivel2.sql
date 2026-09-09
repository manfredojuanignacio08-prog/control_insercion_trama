-- ============================================================================
--  Nivel 2, cambios en el esquema
--
--  EN DESARROLLO: no aplicada en la base de producción.
--
--  El Nivel 2 no necesita tablas nuevas. Lo único que agrega es distinguir el
--  conteo real del sensor del que hoy se estima por tiempo, para que se pueda
--  comparar uno contra otro durante la etapa de validación.
-- ============================================================================

-- Las pasadas que efectivamente reportó el sensor inductivo. Se mantiene
-- separada de pasadas_totales, que hoy es una estimación por tiempo: durante la
-- jornada de validación hay que poder ver las dos y compararlas.
ALTER TABLE produccion_historial
  ADD COLUMN IF NOT EXISTS pasadas_sensor INTEGER NOT NULL DEFAULT 0;

-- Deja constancia de si el número de arriba viene del sensor o es estimado.
-- Mientras sea falso, cualquier cálculo derivado (metros, tiempos) es aproximado.
ALTER TABLE produccion_historial
  ADD COLUMN IF NOT EXISTS conteo_validado BOOLEAN NOT NULL DEFAULT false;

-- Cuántas pasadas tiene la pieza. Al alcanzarlas corresponde detener el telar.
-- Queda en cero mientras no se use, y la parada automática solo se habilita
-- cuando conteo_validado sea verdadero.
ALTER TABLE produccion_historial
  ADD COLUMN IF NOT EXISTS pasadas_objetivo INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN produccion_historial.pasadas_sensor IS
  'Pasadas reportadas por el sensor inductivo del Bloque C. Distinto de pasadas_totales, que puede ser una estimación por tiempo.';
COMMENT ON COLUMN produccion_historial.conteo_validado IS
  'Verdadero solo después de comparar el conteo del sensor contra el contador mecánico del telar durante una jornada completa.';
COMMENT ON COLUMN produccion_historial.pasadas_objetivo IS
  'Pasadas que tiene la pieza. Cero significa sin objetivo. La parada automática requiere conteo_validado en verdadero.';
