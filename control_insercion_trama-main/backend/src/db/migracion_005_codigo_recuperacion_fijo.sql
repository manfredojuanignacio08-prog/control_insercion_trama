-- ============================================================
-- Migración 005: Código de recuperación FIJO por usuario
--
-- Cambio de criterio respecto de la 004:
--  - Antes el código de recuperación era de un solo uso y se regeneraba,
--    lo que podía confundir al usuario (metía un código viejo y no entraba).
--  - Ahora cada usuario tiene UN código fijo que NUNCA cambia. Siempre es
--    el mismo, así que el usuario no se confunde.
--
-- Para que ese código fijo se pueda mostrar cuando el usuario lo necesite
-- (botón "Ver mi código de recuperación"), se guarda en texto plano en la
-- columna recovery_code. Al ingresar usuario + código correcto, se entra
-- directamente a la app (no se re-registra la huella).
--
-- Nota de seguridad: es una decisión deliberada para una herramienta
-- interna. Quien conozca usuario + código puede entrar a esa cuenta, igual
-- que con cualquier código de recuperación.
-- ============================================================

-- Código de recuperación fijo, en texto plano (para poder mostrarlo siempre)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_code TEXT;

-- Ya no usamos "un solo uso": el código no se marca como usado nunca.
-- Dejamos la columna recovery_usado por compatibilidad, pero forzamos que
-- todos queden como "no usado" para que ningún código fijo quede invalidado.
UPDATE usuarios SET recovery_usado = false WHERE recovery_usado = true;
