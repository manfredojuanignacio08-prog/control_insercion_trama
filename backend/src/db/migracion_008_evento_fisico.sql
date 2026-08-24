-- ============================================================
-- Migración 008: sensado (no control) de Avanzar e Impulso
--
-- A diferencia de Marcha/Pausa/Retroceder, estos 2 botones del telar
-- NO tienen relé: siguen siendo 100% manuales. El ESP32 solo los
-- "escucha" con un optoacoplador por canal, y avisa al backend cuando
-- detecta que se usaron — sin eso, un uso manual de estos botones
-- desincroniza el conteo de pasadas/posición sin que nadie se entere.
--
-- posicion_incierta: se pone en TRUE apenas llega un aviso de uso
-- manual. Queda así hasta que alguien confirme la posición a mano
-- desde la web (POST /confirmar-posicion), que la vuelve a FALSE.
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS posicion_incierta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_evento_manual TIMESTAMPTZ;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_evento_manual_tipo TEXT;
