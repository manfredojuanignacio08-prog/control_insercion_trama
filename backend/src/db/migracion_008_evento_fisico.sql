-- ============================================================
-- Migración 008: sensado (no control) de los botones del telar
--
-- Los mismos tres botones que el ESP32 acciona por relé (Marcha, Pausa
-- y Retroceder) se "escuchan" además con un optoacoplador por canal.
-- Así, si un operario los aprieta a mano en la máquina, el backend se
-- entera y la web refleja lo que realmente está pasando en el telar:
-- sin esto, alguien podía arrancar la máquina desde la botonera y la
-- página seguía mostrando "detenido".
--
-- posicion_incierta: se pone en TRUE cuando el uso manual deja la
-- posición sin referencia (por ejemplo, arrancan el telar a mano sin
-- que haya un trabajo abierto en el sistema). Queda así hasta que
-- alguien la confirme desde la web (POST /confirmar-posicion).
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS posicion_incierta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_evento_manual TIMESTAMPTZ;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_evento_manual_tipo TEXT;
