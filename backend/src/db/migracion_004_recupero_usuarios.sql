-- ============================================================
-- Migración 004: Recupero de usuario + control de registro
--
-- Agrega:
--  1) Un código de recuperación de un solo uso por usuario (para entrar si
--     la huella falla o se cambia de dispositivo). Se guarda HASHEADO, nunca
--     en texto plano.
--  2) Una tabla de códigos de invitación, para sumar usuarios en el futuro
--     (cualquier usuario ya registrado puede generar uno).
--
-- Regla de registro (en el backend): los primeros 3 usuarios se registran
-- libremente; a partir del 4º hace falta un código de invitación válido.
-- No hay roles: todos los usuarios son iguales.
-- ============================================================

-- 1) Código de recuperación por usuario (hasheado)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_usado BOOLEAN NOT NULL DEFAULT false;

-- 2) Códigos de invitación (para sumar usuarios a futuro)
CREATE TABLE IF NOT EXISTS invitaciones (
  id           SERIAL PRIMARY KEY,
  -- El código se guarda hasheado (no en texto plano).
  codigo_hash  TEXT NOT NULL,
  -- Quién generó la invitación (cualquier usuario registrado puede).
  creada_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usada        BOOLEAN NOT NULL DEFAULT false,
  usada_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creada_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at    TIMESTAMPTZ NOT NULL   -- vencimiento (ej: 7 días)
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_hash ON invitaciones(codigo_hash);
