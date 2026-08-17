-- ============================================================
-- Migración 007: botón físico "Retroceder" del telar
--
-- OJO, no confundir con POST /api/telares/:id/retroceder (ya existente):
-- esa ruta solo mueve fila_actual/columna_actual en historial_produccion
-- (edición/simulación del patrón en la web, sin efecto en la máquina).
-- Esta migración es para el botón FÍSICO real del telar (Marcha/Pausa/
-- Retroceder son los tres botones que tiene la máquina), pensado para
-- corregir la posición tras un corte de hilo.
--
-- retroceder_seq es un CONTADOR, no un flag: cada pedido de pulso
-- incrementa el número. El ESP32 sondea este valor junto con "estado"
-- (GET /api/telares/:id) y, cuando lo ve distinto al último que conocía,
-- pulsa el relé de Retroceder una sola vez. Evita que dos pedidos
-- seguidos se pisen entre sí antes de que el ESP32 llegue a sondear.
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS retroceder_seq INTEGER NOT NULL DEFAULT 0;
