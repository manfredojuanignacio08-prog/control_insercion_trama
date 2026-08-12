-- ============================================================
-- MIGRACIÓN 001 — Ajustar la base de datos existente (Supabase del equipo)
-- para que coincida con el backend.
--
-- A diferencia de schema.sql (que crea tablas nuevas desde cero con
-- CREATE TABLE IF NOT EXISTS), este script está pensado para correr UNA VEZ
-- contra la base que el equipo ya armó y que ya tiene datos cargados.
--
-- Es 100% seguro de ejecutar:
--   - No borra ni modifica ninguna fila existente.
--   - No borra ninguna tabla ni columna.
--   - Cada paso chequea si ya existe antes de crearlo (se puede correr
--     más de una vez sin error y sin duplicar nada).
--
-- Qué hace:
--   1. Agrega la columna matriz_ligamento a patrones (la única diferencia
--      real de columnas entre el backend y la base actual).
--   2. Agrega las mismas validaciones (CHECK) y los mismos índices que ya
--      tiene definidos schema.sql, para que la base en la nube quede
--      exactamente igual de robusta que la que se usa en desarrollo local.
--   3. Agrega el trigger que actualiza modificado_at solo, para no tener
--      que hacerlo a mano desde el backend.
--   4. (Opcional, al final) completa matriz_ligamento para los patrones que
--      ya existían antes de esta migración, usando la misma regla que usa
--      el backend (pasadas > 0 → 1).
-- ============================================================

-- 1) Columna nueva en patrones
ALTER TABLE patrones ADD COLUMN IF NOT EXISTS matriz_ligamento JSONB;

-- 2a) CHECK constraints en patrones (idempotente: solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patrones_filas_check') THEN
    ALTER TABLE patrones ADD CONSTRAINT patrones_filas_check CHECK (filas > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patrones_columnas_check') THEN
    ALTER TABLE patrones ADD CONSTRAINT patrones_columnas_check CHECK (columnas > 0);
  END IF;
END $$;

-- 2b) CHECK constraints en telares y historial_produccion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'telares_estado_check') THEN
    ALTER TABLE telares ADD CONSTRAINT telares_estado_check
      CHECK (estado IN ('apagado', 'tejiendo', 'pausado', 'error'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historial_produccion_estado_check') THEN
    ALTER TABLE historial_produccion ADD CONSTRAINT historial_produccion_estado_check
      CHECK (estado IN ('en_curso', 'finalizado', 'detenido_manual'));
  END IF;
END $$;

-- 2c) Índices de apoyo (igual que schema.sql)
CREATE INDEX IF NOT EXISTS idx_historial_telar   ON historial_produccion (telar_id);
CREATE INDEX IF NOT EXISTS idx_historial_patron   ON historial_produccion (patron_id);
CREATE INDEX IF NOT EXISTS idx_historial_en_curso ON historial_produccion (telar_id) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_errores_telar      ON errores_log (telar_id);

-- 3) Trigger que mantiene patrones.modificado_at actualizado solo
CREATE OR REPLACE FUNCTION set_modificado_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.modificado_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patrones_modificado ON patrones;
CREATE TRIGGER trg_patrones_modificado
BEFORE UPDATE ON patrones
FOR EACH ROW
EXECUTE FUNCTION set_modificado_at();

-- 4) OPCIONAL — completar matriz_ligamento en patrones que ya existían
-- antes de esta migración (quedaron en NULL al agregar la columna).
-- Usa la misma regla que el backend: cada celda con pasadas > 0 pasa a ser 1.
-- Si no se corre esto, esos patrones viejos simplemente muestran
-- matriz_ligamento = NULL hasta la próxima vez que se editen desde la app
-- (el PUT del backend ya lo calcula solo).
DO $$
DECLARE
  fila RECORD;
  resultado JSONB;
BEGIN
  FOR fila IN SELECT id, matriz_pasadas FROM patrones WHERE matriz_ligamento IS NULL LOOP
    SELECT jsonb_agg(
      (SELECT jsonb_agg(CASE WHEN (celda)::numeric > 0 THEN 1 ELSE 0 END)
       FROM jsonb_array_elements(fila_arr) AS celda)
    ) INTO resultado
    FROM jsonb_array_elements(fila.matriz_pasadas) AS fila_arr;

    UPDATE patrones SET matriz_ligamento = resultado WHERE id = fila.id;
  END LOOP;
END $$;

-- ============================================================
-- Verificación rápida (opcional, solo lectura) — correr después y revisar
-- que patrones tenga la columna y que el conteo de NULL sea 0:
--
-- SELECT count(*) AS total, count(matriz_ligamento) AS con_ligamento FROM patrones;
-- ============================================================
