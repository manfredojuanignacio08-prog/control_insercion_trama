-- ============================================================
-- Esquema de base de datos: Control de Inserción de Trama
-- PostgreSQL
--
-- Decisiones de diseño (ver Analisis_Frontend_y_Plan_Backend.md):
--   - matriz_pasadas y matriz_ligamento son campos separados.
--   - Esquema multi-telar desde el día 1 (el piloto arranca con 1).
--   - Sin tabla de usuarios / autenticación en esta versión.
--   - La repetición es A NIVEL DE CELDA (ya existe: cada valor de
--     matriz_pasadas es cuántas veces se repite ESA celda antes de pasar a
--     la siguiente columna). Es un espejo exacto de cómo ya funciona la
--     simulación del editor (doTick/rollback en index.html) — no se agregó
--     ningún campo nuevo para esto, ya estaba resuelto desde antes.
--   - fila_actual / columna_actual / pasada_actual en historial_produccion:
--     posición exacta de la producción en curso (mismo significado que
--     curRow/curCol/curPass del frontend), para soportar "retroceder un
--     paso" sin reconstruir nada.
--   - El tejido no tiene "final": al llegar a la última celda vuelve a la
--     fila 0 y sigue en bucle infinito (así es un telar real) — por eso
--     vueltas_completadas cuenta cuántas veces se repitió el patrón entero.
--
-- Nota: la base real del equipo (Supabase) se creó sin estas columnas.
-- Para actualizarla, usar database/01_base_de_datos_completa.sql (o
-- los migracion_*.sql sueltos, ver npm run migrate).
-- ============================================================

CREATE TABLE IF NOT EXISTS patrones (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  filas             INTEGER NOT NULL CHECK (filas > 0),
  columnas          INTEGER NOT NULL CHECK (columnas > 0),
  matriz_pasadas    JSONB NOT NULL,   -- array de arrays de enteros: pasadas por celda (lo que programa el editor hoy)
  matriz_ligamento  JSONB,            -- array de arrays binarios (0/1): lizo arriba/abajo, estructura textil (opcional)
  colores_filas     JSONB,            -- array de colores hex, uno por fila
  metadata          JSONB,            -- ej: {"tipo": "Tafetán"}
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telares (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,         -- ej: "TELAR-01"
  nombre            TEXT,
  estado            TEXT NOT NULL DEFAULT 'apagado'
                      CHECK (estado IN ('apagado', 'tejiendo', 'pausado', 'error')),
  patron_actual_id  INTEGER REFERENCES patrones(id) ON DELETE SET NULL,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historial_produccion (
  id                   SERIAL PRIMARY KEY,
  telar_id             INTEGER NOT NULL REFERENCES telares(id),
  patron_id            INTEGER NOT NULL REFERENCES patrones(id),
  fecha_inicio         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_fin            TIMESTAMPTZ,                 -- NULL mientras está en curso
  pasadas_totales      INTEGER DEFAULT 0,
  alertas_disparadas   INTEGER DEFAULT 0,
  fila_actual          INTEGER DEFAULT 0,           -- índice (0-based) de la fila que se está tejiendo ahora
  columna_actual       INTEGER DEFAULT 0,           -- índice (0-based) de la columna dentro de esa fila
  pasada_actual        INTEGER DEFAULT 0,           -- cuántas pasadas ya se hicieron en esa celda exacta
  vueltas_completadas  INTEGER DEFAULT 0,           -- cuántas veces se tejió el patrón entero de punta a punta
  estado               TEXT NOT NULL DEFAULT 'en_curso'
                          CHECK (estado IN ('en_curso', 'finalizado', 'detenido_manual'))
);

CREATE TABLE IF NOT EXISTS errores_log (
  id          SERIAL PRIMARY KEY,
  telar_id    INTEGER REFERENCES telares(id),
  titulo      TEXT,
  mensaje     TEXT,
  codigo      TEXT,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de apoyo
CREATE INDEX IF NOT EXISTS idx_historial_telar       ON historial_produccion (telar_id);
CREATE INDEX IF NOT EXISTS idx_historial_patron       ON historial_produccion (patron_id);
CREATE INDEX IF NOT EXISTS idx_historial_en_curso     ON historial_produccion (telar_id) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_errores_telar          ON errores_log (telar_id);

-- Mantiene patrones.modificado_at actualizado automáticamente
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

-- ============================================================
-- Login biométrico (huella dactilar) con WebAuthn — ver
-- migracion_003_login_biometrico.sql para el detalle y las notas de
-- seguridad. Resumen: la biometría NUNCA se guarda ni viaja al servidor;
-- solo se guardan las claves públicas de los dispositivos registrados.
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT,
  webauthn_id   TEXT NOT NULL UNIQUE,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS credenciales_biometricas (
  id               SERIAL PRIMARY KEY,
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  credential_id    TEXT NOT NULL UNIQUE,
  public_key       TEXT NOT NULL,
  counter          BIGINT NOT NULL DEFAULT 0,
  tipo_dispositivo TEXT,
  apodo            TEXT,
  creado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cred_usuario ON credenciales_biometricas(usuario_id);

CREATE TABLE IF NOT EXISTS desafios_webauthn (
  id          SERIAL PRIMARY KEY,
  challenge   TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('registro', 'login')),
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_desafio_challenge ON desafios_webauthn(challenge);
