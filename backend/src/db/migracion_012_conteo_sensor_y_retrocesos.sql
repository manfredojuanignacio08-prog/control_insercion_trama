-- ============================================================
-- Migración 012: conteo del sensor, retrocesos y motivo de pausa
--
-- 1) Conteo real vs. estimado. Hasta que el sensor inductivo (Bloque C) esté
--    instalado, pasadas_totales sale del reloj de la página web (una pasada
--    cada 500 ms), no de la máquina: es una ESTIMACIÓN. Estas columnas separan
--    lo estimado de lo medido, para no mostrar "metros tejidos" con precisión
--    aparente sobre un número que no se midió.
--      pasadas_sensor   → lo que reportó el sensor del Nivel 2
--      conteo_validado  → verdadero solo después de comparar el sensor contra el
--                         contador mecánico del telar durante una jornada completa
--      pasadas_objetivo → pasadas de la pieza (parada automática, a futuro)
--    (Antes vivían en nivel2/migracion_nivel2.sql, que nunca se aplicaba.)
--
-- 2) ultimo_reporte_sensor: heartbeat del sensor. Si es reciente, la posición y
--    el conteo los lleva el sensor y la web NO debe seguir avanzándolos por reloj.
--
-- 3) retrocesos_contados: cuenta CADA retroceso del telar, lo pida la web o lo
--    apriete el operario en la botonera. El Nivel 2 lo usa para saber cuántas
--    pasadas descontar. No se puede usar retroceder_seq para eso: ese contador
--    es la ORDEN que la web le da al ESP32 del Nivel 1 (que pulsa el relé cuando
--    cambia), y subirlo por un botón físico haría que el Nivel 1 pulsara de nuevo.
--
-- 4) motivo_pausa: distingue una pausa del operario de una parada detectada por el
--    sensor (la máquina dejó de dar pulsos).
--
-- (La restricción de una sola producción 'en_curso' por telar está aparte, en la migración 013:
--  si esa falla por datos previos, estas columnas -de las que depende el backend- no deben quedar
--  sin aplicar.)
-- ============================================================

ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_sensor   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS conteo_validado  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_objetivo INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN historial_produccion.pasadas_totales IS
  'Conteo de pasadas por reloj de la web (estimación) mientras no haya sensor. Con el Nivel 2 instalado, el conteo medido está en pasadas_sensor.';
COMMENT ON COLUMN historial_produccion.pasadas_sensor IS
  'Pasadas reportadas por el sensor inductivo del Bloque C. Distinto de pasadas_totales, que puede ser una estimación por tiempo.';
COMMENT ON COLUMN historial_produccion.conteo_validado IS
  'Verdadero solo después de comparar el conteo del sensor contra el contador mecánico del telar durante una jornada completa.';
COMMENT ON COLUMN historial_produccion.pasadas_objetivo IS
  'Pasadas que tiene la pieza. Cero significa sin objetivo. La parada automática requiere conteo_validado en verdadero.';

ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_reporte_sensor TIMESTAMPTZ;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS retrocesos_contados   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS motivo_pausa           TEXT;

COMMENT ON COLUMN telares.ultimo_reporte_sensor IS
  'Último reporte de pasadas del sensor del Nivel 2. En NULL o viejo: el conteo es una estimación por reloj.';
COMMENT ON COLUMN telares.retrocesos_contados IS
  'Cantidad total de retrocesos del telar (web + botonera física). Lo lee el Nivel 2 para descontar pasadas. No es lo mismo que retroceder_seq, que es la orden hacia el ESP32 del Nivel 1.';

COMMENT ON COLUMN telares.motivo_pausa IS
  'Por qué quedó pausado el telar cuando no fue una decisión del operario. ''sin_senal'': el sensor de pasada dejó de recibir pulsos (la máquina se frenó o el sensor falló). ''reinicio'': el ESP32 arrancó en frío (corte de luz o traslado) y el tejido quedó en pausa conservando la posición. NULL en cualquier otro caso.';
