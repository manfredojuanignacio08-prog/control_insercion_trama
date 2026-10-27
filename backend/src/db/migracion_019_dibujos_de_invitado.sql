-- ============================================================
-- 019 · Dibujos creados como invitado, y usuarios sin distinguir mayúsculas.
--
-- Entrar como invitado está abierto a cualquiera que abra la página. Con esa sesión se
-- podía modificar y BORRAR cualquier dibujo de la biblioteca, también los de los operarios.
-- Ahora cada dibujo recuerda si lo creó un invitado: el invitado puede cambiar o borrar esos,
-- y los de los operarios solo mirarlos. Cuando un operario guarda un dibujo hecho por un
-- invitado, pasa a ser de los operarios (la marca vuelve a false).
ALTER TABLE patrones
  ADD COLUMN IF NOT EXISTS creado_por_invitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN patrones.creado_por_invitado IS
  'true si lo creó una sesión de invitado y ningún operario lo guardó después: un invitado solo puede modificar o borrar estos dibujos.';

-- El usuario se busca sin distinguir mayúsculas ("Juan" y "juan" son la misma cuenta): en el
-- celular el teclado suele poner la primera letra en mayúscula sola. Índice para esa búsqueda
-- (no único, para no fallar si una base vieja ya tuviera dos nombres que solo difieren en eso).
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario_lower ON usuarios (lower(usuario));
