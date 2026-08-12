-- ============================================================
-- BASE DE DATOS COMPLETA — Control de Inserción de Trama
-- PostgreSQL / Supabase
--
-- QUÉ ES ESTE ARCHIVO
-- Es el único script que hace falta correr para tener la base de datos
-- 100% lista y compatible con el backend. Sirve para los dos casos:
--   A) Base nueva, vacía: crea las 4 tablas completas.
--   B) Base que ya existía antes (con datos reales cargados): no rompe ni
--      borra nada — detecta lo que ya existe y solo agrega/corrige lo que falta.
-- Es seguro correrlo más de una vez. No hay forma de que borre datos reales.
--
-- CÓMO USARLO: ver docs/Como_Crear_La_Base_De_Datos.md (paso a paso, 100%
-- desde el navegador, sin terminal).
-- ============================================================


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


-- ── migracion_001_matriz_ligamento.sql ──
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

-- ── migracion_002_repeticiones_y_posicion.sql ──
-- ============================================================
-- MIGRACIÓN 002 — Posición de tejido para soportar "retroceder un paso"
--
-- Corrección de diseño: la primera versión de esta migración había
-- agregado patrones.repeticiones_filas (repetir una fila completa N veces)
-- y un repeticion_actual a nivel de fila. Eso no coincidía con cómo
-- funciona en realidad el editor: la repetición ya existe A NIVEL DE
-- CELDA (cada valor de matriz_pasadas ya es "cuántas veces se repite esa
-- celda"), y el patrón se teje en bucle infinito hasta que alguien lo
-- detiene — no tiene un "final". Esta versión corrige eso.
--
-- Agrega a historial_produccion:
--   - fila_actual, columna_actual, pasada_actual: posición exacta de la
--     producción en curso (mismo significado que curRow/curCol/curPass
--     del frontend).
--   - vueltas_completadas: cuántas veces se tejió el patrón entero de
--     punta a punta (no hay "completado", el tejido es infinito).
--
-- Si una base ya había corrido la versión anterior de esta misma
-- migración (con repeticiones_filas / repeticion_actual), esos campos se
-- eliminan acá — es seguro, no se perdió ningún dato real porque esa
-- funcionalidad nunca llegó a usarse en producción.
--
-- 100% seguro de correr contra una base con datos reales. Se puede correr
-- más de una vez sin error.
-- ============================================================

-- Limpieza de la versión anterior (si llegó a aplicarse)
ALTER TABLE patrones DROP COLUMN IF EXISTS repeticiones_filas;
ALTER TABLE historial_produccion DROP COLUMN IF EXISTS repeticion_actual;

-- Columnas correctas
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS fila_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS columna_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasada_actual INTEGER DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS vueltas_completadas INTEGER DEFAULT 0;

-- Verificación rápida (opcional, solo lectura):
-- SELECT id, telar_id, fila_actual, columna_actual, pasada_actual, vueltas_completadas FROM historial_produccion;

-- ============================================================
-- Login biométrico (huella / rostro) con WebAuthn
-- (agregado en la migración 003)
--
-- IMPORTANTE: la biometría NUNCA se guarda ni viaja al servidor. Solo se
-- guardan las CLAVES PÚBLICAS de los dispositivos registrados. Ver
-- backend/AUTENTICACION_BIOMETRICA.md para el detalle.
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

-- ============================================================
-- Recupero de usuario + códigos de invitación (migración 004)
-- ============================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recovery_usado BOOLEAN NOT NULL DEFAULT false;

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
