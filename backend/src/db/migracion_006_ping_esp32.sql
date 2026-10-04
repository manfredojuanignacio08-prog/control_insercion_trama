-- ============================================================
-- Migración 006: heartbeat del ESP32
--
-- Agrega una marca de tiempo que el ESP32 deja cada vez que hace su
-- sondeo periódico al backend (GET /api/telares/:id?origen=esp32).
-- Con esto la web puede mostrar "ESP32 conectado / sin conexión" en
-- la pantalla del editor, comparando esta marca contra el momento
-- actual: si pasaron más de unos segundos sin novedades, se considera
-- desconectado.
--
-- No rompe nada si el ESP32 todavía no manda el parámetro ?origen=esp32
-- (firmware viejo): la columna simplemente queda en NULL y la web
-- muestra "Sin datos del ESP32" en vez de mentir con un estado falso.
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_ping_esp32 TIMESTAMPTZ;
