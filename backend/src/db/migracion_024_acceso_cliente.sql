-- ============================================================
-- 024 · Vista para clientes: una clave por tejido.
--
-- Cada dibujo (el tejido de un cliente) puede tener UNA clave de acceso. Con ella, el cliente
-- entra a una vista de solo lectura donde ve únicamente ese tejido: cómo se ve la tela, si se
-- está tejiendo, cuánto avanzó, los metros tejidos y lo que falta. No ve otros dibujos, ni los
-- controles del telar, ni los errores, ni quién lo operó.
--
-- La clave se guarda dos veces, y ninguna en texto plano:
--   clave_hash     SHA-256, para encontrar el tejido cuando el cliente la escribe (única).
--   clave_cifrada  AES-256-GCM con RECOVERY_SECRET, para que el operario la pueda volver a ver
--                  y mandársela al cliente.
-- metros_pedidos (opcional) son los metros que encargó el cliente: con los metros por pasada del
-- dibujo, la vista le muestra cuánto lleva de su pedido.
-- Generar una clave nueva reemplaza la anterior: la vieja deja de andar, también para quien ya
-- había entrado con ella. Borrar el acceso hace lo mismo. Si se borra el dibujo, se borra su acceso.
CREATE TABLE IF NOT EXISTS accesos_cliente (
  patron_id      INTEGER PRIMARY KEY REFERENCES patrones(id) ON DELETE CASCADE,
  cliente_nombre TEXT CHECK (cliente_nombre IS NULL OR char_length(cliente_nombre) BETWEEN 1 AND 80),
  clave_hash     TEXT NOT NULL UNIQUE,
  clave_cifrada  TEXT NOT NULL,
  -- metros que encargó el cliente (opcional): con ellos ve cuánto lleva de su pedido
  metros_pedidos NUMERIC(12, 2) CHECK (metros_pedidos IS NULL OR (metros_pedidos > 0 AND metros_pedidos <= 10000000)),
  creada_por     TEXT,
  creada_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso  TIMESTAMPTZ
);

COMMENT ON TABLE accesos_cliente IS
  'Clave de un cliente para ver su tejido (un dibujo) en modo solo lectura. Una por dibujo.';
