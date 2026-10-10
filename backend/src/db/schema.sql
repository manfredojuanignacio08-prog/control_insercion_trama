-- ============================================================
-- Esquema de base de datos: Control de Inserción de Trama
-- PostgreSQL
--
-- Decisiones de diseño (ver Analisis_Frontend_y_Plan_Backend.md):
--   - matriz_pasadas y matriz_ligamento son campos separados.
--   - Esquema multi-telar desde el día 1 (el piloto arranca con 1).
--   - Usuarios con login por huella (WebAuthn): tablas usuarios,
--     credenciales_biometricas, desafios_webauthn e invitaciones (más abajo).
--   - Una FILA es una pasada: lleva como máximo una bobina activa, porque en cada
--     pasada entra una sola trama (cada celda vale 0 o 1; el servidor rechaza una
--     fila con dos). Cuántas pasadas seguidas se teje cada fila lo dice
--     repeticiones_por_fila (migración 014); sin ese dato, una.
--   - fila_actual + repeticion_en_fila en historial_produccion: posición exacta de la
--     producción en curso (la fila y cuántas pasadas de esa fila ya se tejieron), para
--     soportar "retroceder una pasada" sin reconstruir nada. columna_actual y
--     pasada_actual se conservan por compatibilidad y quedan siempre en 0.
--   - El tejido no tiene "final": después de la última fila vuelve a la
--     fila 0 y sigue en bucle infinito (así es un telar real), por eso
--     vueltas_completadas cuenta cuántas veces se repitió el patrón entero.
--
-- Nota: la base real del equipo (Neon) se creó sin estas columnas.
-- Para actualizarla, usar database/01_base_de_datos_completa.sql (o
-- los migracion_*.sql sueltos, ver npm run migrate).
-- ============================================================

CREATE TABLE IF NOT EXISTS patrones (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  filas             INTEGER NOT NULL CHECK (filas BETWEEN 1 AND 300),
  columnas          INTEGER NOT NULL CHECK (columnas BETWEEN 1 AND 8),
  matriz_pasadas    JSONB NOT NULL,   -- array de arrays (una fila por pasada, con una bobina como máximo): mayor que 0 = la bobina se activa (la web guarda 0 y 1)
  matriz_ligamento  JSONB,            -- array de arrays binarios (0/1), derivado de matriz_pasadas si no se manda
  colores_filas     JSONB,            -- array de colores hex, uno por fila
  metadata          JSONB,            -- ej: {"tipo": "Tafetán"}
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- migración 014: cuántas pasadas seguidas se teje cada fila. Un elemento por
  -- fila; en NULL, una pasada por fila.
  repeticiones_por_fila INTEGER[],
  -- migración 011: metros de tela que avanza el telar en una pasada, para este
  -- dibujo. Lo carga el operario; queda en NULL mientras no se conozca.
  metros_por_pasada NUMERIC(10, 6) CHECK (metros_por_pasada IS NULL OR (metros_por_pasada > 0 AND metros_por_pasada <= 1)),
  creado_por_invitado BOOLEAN NOT NULL DEFAULT false,  -- migración 019: lo creó un invitado (un invitado solo puede cambiar o borrar esos)
  -- migración 020: hilado disponible (peso en kg y metros de tela que alcanza a tejer) y las
  -- pasadas que ya tenía el dibujo cuando se cargó, para contar el consumo desde ahí.
  hilado_peso_kg      NUMERIC(10, 3) CHECK (hilado_peso_kg IS NULL OR (hilado_peso_kg > 0 AND hilado_peso_kg <= 100000)),
  hilado_metros_max   NUMERIC(12, 2) CHECK (hilado_metros_max IS NULL OR (hilado_metros_max > 0 AND hilado_metros_max <= 10000000)),
  hilado_pasadas_base INTEGER CHECK (hilado_pasadas_base IS NULL OR hilado_pasadas_base >= 0),
  modificado_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telares (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,         -- ej: "TELAR-01"
  nombre            TEXT,
  estado            TEXT NOT NULL DEFAULT 'apagado'
                      CHECK (estado IN ('apagado', 'tejiendo', 'pausado', 'error')),
  patron_actual_id  INTEGER REFERENCES patrones(id) ON DELETE SET NULL,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_ping_esp32 TIMESTAMPTZ,       -- migración 006: heartbeat del ESP32
  retroceder_seq    INTEGER NOT NULL DEFAULT 0,  -- migración 007: botón físico Retroceder
  posicion_incierta BOOLEAN NOT NULL DEFAULT false,  -- migración 008: uso manual de los botones del telar
  ultimo_evento_manual      TIMESTAMPTZ,          -- migración 008
  ultimo_evento_manual_tipo TEXT,                 -- migración 008: 'marcha' | 'pausa' | 'retroceder' | 'reinicio'
  -- migración 010: cuántos elementos de selección (bobinas) tiene la máquina.
  -- Un dibujo con más columnas que este número no puede ejecutarse completo.
  elementos_seleccion INTEGER NOT NULL DEFAULT 4 CHECK (elementos_seleccion BETWEEN 1 AND 8)
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
  columna_actual       INTEGER DEFAULT 0,           -- vestigial: siempre 0 (las columnas de una fila son simultáneas)
  -- migración 015: cuántas pasadas de la fila actual ya se tejieron. Con las
  -- repeticiones del dibujo define la posición exacta dentro de la producción.
  repeticion_en_fila   INTEGER NOT NULL DEFAULT 0 CHECK (repeticion_en_fila >= 0),
  pasada_actual        INTEGER DEFAULT 0,           -- vestigial: siempre 0 (la pasada dentro de la fila es repeticion_en_fila)
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
-- Login biométrico (huella dactilar) con WebAuthn, ver
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
-- migración 019: el usuario se busca sin distinguir mayúsculas
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario_lower ON usuarios (lower(usuario));

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

-- ============================================================
-- Recupero de usuario + códigos de invitación (migración 004)
-- Ver migracion_004_recupero_usuarios.sql para el detalle.
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_usado BOOLEAN NOT NULL DEFAULT false;

-- migración 005: código de recuperación fijo. Desde la migración 016 se guarda CIFRADO
-- con RECOVERY_SECRET (AES-256-GCM), no en texto plano.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_code TEXT;

CREATE TABLE IF NOT EXISTS invitaciones (
  id           SERIAL PRIMARY KEY,
  codigo_hash  TEXT NOT NULL,
  creada_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usada        BOOLEAN NOT NULL DEFAULT false,
  usada_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creada_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_hash ON invitaciones(codigo_hash);

-- ============================================================
-- Migraciones 012 y 013 (ver db/migracion_012_* y db/migracion_013_*):
-- conteo del sensor vs. estimado, retrocesos, una sola producción abierta por telar.
-- ============================================================
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_sensor   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS conteo_validado  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_objetivo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_reporte_sensor TIMESTAMPTZ;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS retrocesos_contados   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS motivo_pausa           TEXT;
DROP INDEX IF EXISTS idx_historial_en_curso;
CREATE UNIQUE INDEX IF NOT EXISTS idx_historial_en_curso ON historial_produccion (telar_id) WHERE estado = 'en_curso';
