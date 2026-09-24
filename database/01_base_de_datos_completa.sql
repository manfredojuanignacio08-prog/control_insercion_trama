-- ============================================================================
--  Control de Inserción de Trama · Base de datos completa
--
--  Se genera a partir de la fuente de verdad del esquema (backend/src/db/schema.sql)
--  más TODAS las migraciones, en orden, y al final las registra en la tabla que usa
--  el migrador del backend.
--
--  En el día a día conviene usar los scripts del backend:
--      npm run init-db     crea las tablas
--      npm run migrate     aplica las migraciones pendientes
--  El servidor además aplica solo las pendientes en cada arranque.
--
--  IMPORTANTE: si se agrega una migración nueva, hay que regenerar este archivo.
-- ============================================================================

-- ============================================================
-- Esquema de base de datos: Control de Inserción de Trama
-- PostgreSQL
--
-- Decisiones de diseño (ver Analisis_Frontend_y_Plan_Backend.md):
--   - matriz_pasadas y matriz_ligamento son campos separados.
--   - Esquema multi-telar desde el día 1 (el piloto arranca con 1).
--   - Sin tabla de usuarios / autenticación en esta versión.
--   - La repetición es DE FILA ENTERA: una FILA equivale a una PASADA del
--     telar, y las columnas de esa fila son los elementos que se activan de
--     forma simultánea. Si una fila tiene valores mayores a 1, esa pasada se
--     repite esa cantidad de veces (se toma el mayor valor de la fila).
--   - fila_actual / columna_actual / pasada_actual en historial_produccion:
--     posición exacta de la producción en curso (mismo significado que
--     curRow/curCol/curPass del frontend), para soportar "retroceder un
--     paso" sin reconstruir nada.
--   - El tejido no tiene "final": al llegar a la última celda vuelve a la
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
  filas             INTEGER NOT NULL CHECK (filas BETWEEN 1 AND 100),
  columnas          INTEGER NOT NULL CHECK (columnas BETWEEN 1 AND 8),
  matriz_pasadas    JSONB NOT NULL,   -- array de arrays de enteros: pasadas por celda (lo que programa el editor hoy)
  matriz_ligamento  JSONB,            -- array de arrays binarios (0/1): lizo arriba/abajo, estructura textil (opcional)
  colores_filas     JSONB,            -- array de colores hex, uno por fila
  metadata          JSONB,            -- ej: {"tipo": "Tafetán"}
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- migración 014: cuántas pasadas seguidas se teje cada fila. Un elemento por
  -- fila; en NULL, una pasada por fila.
  repeticiones_por_fila INTEGER[],
  -- migración 011: metros de tela que avanza el telar en una pasada, para este
  -- dibujo. Lo carga el operario; queda en NULL mientras no se conozca.
  metros_por_pasada NUMERIC(10, 6) CHECK (metros_por_pasada IS NULL OR (metros_por_pasada > 0 AND metros_por_pasada <= 1)),
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
  ultimo_evento_manual_tipo TEXT,                 -- migración 008: 'avanzar' | 'impulso'
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
  columna_actual       INTEGER DEFAULT 0,           -- índice (0-based) de la columna dentro de esa fila
  -- migración 015: cuántas pasadas de la fila actual ya se tejieron. Con las
  -- repeticiones del dibujo define la posición exacta dentro de la producción.
  repeticion_en_fila   INTEGER NOT NULL DEFAULT 0 CHECK (repeticion_en_fila >= 0),
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

-- migración 005: código de recuperación fijo (en texto plano, ver esa
-- migración para la nota de seguridad). Faltaba en este archivo aunque
-- ya estaba en la base real y en database/01_base_de_datos_completa.sql.
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


-- ============================================================
-- migracion_001_matriz_ligamento.sql
-- ============================================================
-- ============================================================
-- MIGRACIÓN 001, Ajustar la base de datos existente (Neon del equipo)
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

-- 4) OPCIONAL, completar matriz_ligamento en patrones que ya existían
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
-- Verificación rápida (opcional, solo lectura), correr después y revisar
-- que patrones tenga la columna y que el conteo de NULL sea 0:
--
-- SELECT count(*) AS total, count(matriz_ligamento) AS con_ligamento FROM patrones;
-- ============================================================

-- ============================================================
-- migracion_002_repeticiones_y_posicion.sql
-- ============================================================
-- ============================================================
-- MIGRACIÓN 002, Posición de tejido para soportar "retroceder un paso"
--
-- Corrección de diseño: la primera versión de esta migración había
-- agregado patrones.repeticiones_filas (repetir una fila completa N veces)
-- y un repeticion_actual a nivel de fila. Eso no coincidía con cómo
-- funciona en realidad el editor: la repetición ya existe A NIVEL DE
-- CELDA (cada valor de matriz_pasadas ya es "cuántas veces se repite esa
-- celda"), y el patrón se teje en bucle infinito hasta que alguien lo
-- detiene (no tiene un "final"). Esta versión corrige eso.
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
-- eliminan acá, es seguro, no se perdió ningún dato real porque esa
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
-- migracion_003_login_biometrico.sql
-- ============================================================
-- ============================================================
-- Migración 003: Login biométrico (huella dactilar) con WebAuthn
--
-- El login biométrico se implementa con el estándar WebAuthn / FIDO2.
-- Punto CLAVE de seguridad: la huella dactilar NUNCA se guardan en la
-- base de datos ni viajan al servidor. El sensor biométrico del dispositivo
-- (celular / notebook) valida localmente y solo genera una PRUEBA
-- criptográfica (una firma con una clave privada que nunca sale del
-- dispositivo). El servidor guarda únicamente la CLAVE PÚBLICA para
-- verificar esas firmas.
--
-- Por eso acá NO hay ninguna columna con datos biométricos: solo usuarios y
-- las claves públicas de sus dispositivos registrados.
-- ============================================================

-- Usuarios del sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       TEXT NOT NULL UNIQUE,           -- nombre de usuario / legajo
  nombre        TEXT,                            -- nombre visible (opcional)
  -- Identificador estable que WebAuthn asocia a este usuario. Se guarda como
  -- texto (base64url) para no exponer el id incremental en el protocolo.
  webauthn_id   TEXT NOT NULL UNIQUE,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);

-- Credenciales biométricas (una por cada dispositivo que el usuario registra:
-- su huella en el celular, el Face ID de otro, etc.). Un usuario puede tener
-- varias.
CREATE TABLE IF NOT EXISTS credenciales_biometricas (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Identificador único de la credencial que devuelve el dispositivo
  -- (base64url). Con esto el navegador sabe qué credencial usar al loguearse.
  credential_id  TEXT NOT NULL UNIQUE,
  -- La CLAVE PÚBLICA del dispositivo (no hay clave privada acá: esa nunca
  -- sale del hardware del usuario). Se guarda en base64.
  public_key     TEXT NOT NULL,
  -- Contador anti-clonación: WebAuthn lo incrementa en cada uso; si llegara
  -- un valor menor al guardado, es señal de credencial clonada.
  counter        BIGINT NOT NULL DEFAULT 0,
  -- Tipo de autenticador, informativo: "platform" (huella dactilar integrado
  -- en el dispositivo) o "cross-platform" (llave física USB, etc.).
  tipo_dispositivo TEXT,
  apodo          TEXT,                           -- ej: "iPhone de Juan"
  creado_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cred_usuario ON credenciales_biometricas(usuario_id);

-- Desafíos temporales ("challenges") de WebAuthn. En cada registro o login,
-- el servidor emite un desafío aleatorio de un solo uso que el dispositivo
-- debe firmar. Se guardan acá con vencimiento corto para validarlos y evitar
-- reutilización (ataques de repetición).
CREATE TABLE IF NOT EXISTS desafios_webauthn (
  id          SERIAL PRIMARY KEY,
  challenge   TEXT NOT NULL,                     -- valor aleatorio (base64url)
  tipo        TEXT NOT NULL CHECK (tipo IN ('registro', 'login')),
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,  -- puede ser NULL en login por descubrimiento
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at   TIMESTAMPTZ NOT NULL               -- vencimiento corto (ej: 5 min)
);

CREATE INDEX IF NOT EXISTS idx_desafio_challenge ON desafios_webauthn(challenge);

-- ============================================================
-- migracion_004_recupero_usuarios.sql
-- ============================================================
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

-- ============================================================
-- migracion_005_codigo_recuperacion_fijo.sql
-- ============================================================
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

-- ============================================================
-- migracion_006_ping_esp32.sql
-- ============================================================
-- ============================================================
-- Migración 006: heartbeat del ESP32
--
-- Agrega una marca de tiempo que el ESP32 deja cada vez que hace su
-- sondeo periódico al backend (GET /api/telares/:id?origen=esp32).
-- Con esto la web puede mostrar "ESP32 conectado / sin conexión" en
-- la pantalla del editor, comparando esta marca contra el momento
-- actual: si pasaron más de unos segundos sin novedades, se considera
-- desconectado.
--
-- No rompe nada si el ESP32 todavía no manda el parámetro ?origen=esp32
-- (firmware viejo): la columna simplemente queda en NULL y la web
-- muestra "Sin datos del ESP32" en vez de mentir con un estado falso.
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_ping_esp32 TIMESTAMPTZ;

-- ============================================================
-- migracion_007_retroceder_fisico.sql
-- ============================================================
-- ============================================================
-- Migración 007: botón físico "Retroceder" del telar
--
-- OJO, no confundir con POST /api/telares/:id/retroceder (ya existente):
-- esa ruta solo mueve fila_actual/columna_actual en historial_produccion
-- (edición/simulación del patrón en la web, sin efecto en la máquina).
-- Esta migración es para el botón FÍSICO real del telar (Marcha/Pausa/
-- Retroceder son los tres botones que tiene la máquina), pensado para
-- corregir la posición tras un corte de hilo.
--
-- retroceder_seq es un CONTADOR, no un flag: cada pedido de pulso
-- incrementa el número. El ESP32 sondea este valor junto con "estado"
-- (GET /api/telares/:id) y, cuando lo ve distinto al último que conocía,
-- pulsa el relé de Retroceder una sola vez. Evita que dos pedidos
-- seguidos se pisen entre sí antes de que el ESP32 llegue a sondear.
-- ============================================================

ALTER TABLE telares ADD COLUMN IF NOT EXISTS retroceder_seq INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- migracion_008_evento_fisico.sql
-- ============================================================
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

-- ============================================================
-- migracion_009_rango_dimensiones.sql
-- ============================================================
-- ============================================================
-- Migración 009: acotar filas y columnas al rango 2 a 32
--
-- El editor de la aplicación ya validaba ese rango, pero la base
-- solo exigía "mayor que cero". Un dibujo creado por fuera de la
-- interfaz (por API) podía quedar con dimensiones que el operario
-- no puede ver y que el firmware no puede ejecutar: su MAX_FILAS
-- es 32 y truncaría el dibujo en silencio.
--
-- Esta migración NO borra nada. La versión anterior hacía un DELETE de
-- los dibujos fuera de rango, y eso (1) destruía datos sin avisar y
-- (2) fallaba si alguno tenía historial de producción, abortando toda la
-- migración y dejando sin aplicar el CHECK. Ahora las restricciones se
-- agregan como NOT VALID: se exigen para todo dibujo NUEVO o modificado,
-- y los que ya existieran fuera de rango se conservan (se pueden revisar
-- con el SELECT del final y corregirlos a mano).
-- ============================================================

ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_filas_check;
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_columnas_check;

ALTER TABLE patrones ADD CONSTRAINT patrones_filas_check    CHECK (filas    BETWEEN 2 AND 32) NOT VALID;
ALTER TABLE patrones ADD CONSTRAINT patrones_columnas_check CHECK (columnas BETWEEN 2 AND 32) NOT VALID;

-- Para revisar si quedó algún dibujo fuera de rango (no se ejecuta solo):
--   SELECT id, nombre, filas, columnas FROM patrones
--    WHERE filas NOT BETWEEN 2 AND 32 OR columnas NOT BETWEEN 2 AND 32;

-- ============================================================
-- migracion_010_elementos_seleccion.sql
-- ============================================================
-- ============================================================
-- Migración 010: elementos de selección por telar
--
-- El editor permite dibujar hasta 32 columnas, pero cada telar tiene
-- una cantidad fija de elementos de selección: en el Vamatex C 401 donde
-- se implementa son 4 bobinas. Las columnas que excedan ese número no
-- tienen a qué accionar y el firmware las descarta.
--
-- Hasta ahora ese límite no estaba en ningún lado: ni en la base, ni en
-- la API, ni en la interfaz. Alguien podía diseñar un dibujo de 20
-- columnas, tejerlo, y ver que 14 no hacían nada, sin explicación.
--
-- El número es una propiedad de la máquina, no del sistema: otro telar
-- podría tener 8 o 12. Por eso se guarda por telar y no como constante.
-- ============================================================

ALTER TABLE telares
  ADD COLUMN IF NOT EXISTS elementos_seleccion INTEGER NOT NULL DEFAULT 4
  CHECK (elementos_seleccion BETWEEN 1 AND 32);

COMMENT ON COLUMN telares.elementos_seleccion IS
  'Cantidad de elementos de selección (bobinas) que tiene la máquina. Un dibujo con más columnas que este número no puede ejecutarse completo: las columnas que sobran no tienen a qué accionar.';

-- columna_actual quedó del modelo conceptual anterior, cuando se creía que el
-- tejido avanzaba celda por celda dentro de cada fila. En el modelo correcto una
-- fila es una pasada completa y sus columnas son simultáneas, así que este campo
-- permanece siempre en cero. Se conserva para no romper el historial existente.
COMMENT ON COLUMN historial_produccion.columna_actual IS
  'Vestigial: permanece siempre en 0. Una fila del dibujo es una pasada completa y sus columnas se activan simultáneamente, por lo que no existe avance por columna. Se conserva por compatibilidad con el historial ya registrado.';

-- ============================================================
-- migracion_011_metros_por_pasada.sql
-- ============================================================
-- ============================================================
-- Migración 011: metros de tela por pasada
--
-- Cada pasada del telar inserta un hilo de trama y hace avanzar la tela una
-- distancia muy chica, que depende de la densidad del tejido y del artículo.
-- Ese número lo conoce el operario, no el sistema.
--
-- Guardarlo junto al dibujo permite convertir el conteo de pasadas en metros
-- reales de tela, que es la unidad con la que se trabaja en la fábrica: el
-- cliente no pide "veinte mil pasadas", pide "ochenta metros".
--
-- Queda en NULL mientras no se cargue. Las estadísticas que dependen de este
-- valor simplemente no se muestran hasta que exista.
-- ============================================================

ALTER TABLE patrones
  ADD COLUMN IF NOT EXISTS metros_por_pasada NUMERIC(10, 6)
  CHECK (metros_por_pasada IS NULL OR (metros_por_pasada > 0 AND metros_por_pasada <= 1));

COMMENT ON COLUMN patrones.metros_por_pasada IS
  'Metros de tela que avanza el telar en una pasada, para este dibujo. Lo carga el operario desde el editor. En NULL mientras no se conozca.';

-- ============================================================
-- migracion_012_conteo_sensor_y_retrocesos.sql
-- ============================================================
-- ============================================================
-- Migración 012: conteo del sensor, retrocesos y motivo de pausa
--
-- 1) Conteo real vs. estimado. Hasta que el sensor inductivo (Bloque C) esté
--    instalado, pasadas_totales sale del reloj de la página web (una pasada
--    cada 500 ms), no de la máquina: es una ESTIMACIÓN. Estas columnas separan
--    lo estimado de lo medido, para no mostrar "metros tejidos" con precisión
--    aparente sobre un número que no se midió.
--      pasadas_sensor   → lo que reportó el sensor del Nivel 2
--      conteo_validado  → verdadero solo después de comparar el sensor contra el
--                         contador mecánico del telar durante una jornada completa
--      pasadas_objetivo → pasadas de la pieza (parada automática, a futuro)
--    (Antes vivían en nivel2/migracion_nivel2.sql, que nunca se aplicaba.)
--
-- 2) ultimo_reporte_sensor: heartbeat del sensor. Si es reciente, la posición y
--    el conteo los lleva el sensor y la web NO debe seguir avanzándolos por reloj.
--
-- 3) retrocesos_contados: cuenta CADA retroceso del telar, lo pida la web o lo
--    apriete el operario en la botonera. El Nivel 2 lo usa para saber cuántas
--    pasadas descontar. No se puede usar retroceder_seq para eso: ese contador
--    es la ORDEN que la web le da al ESP32 del Nivel 1 (que pulsa el relé cuando
--    cambia), y subirlo por un botón físico haría que el Nivel 1 pulsara de nuevo.
--
-- 4) motivo_pausa: distingue una pausa del operario de una parada detectada por el
--    sensor (la máquina dejó de dar pulsos).
--
-- (La restricción de una sola producción 'en_curso' por telar está aparte, en la migración 013:
--  si esa falla por datos previos, estas columnas -de las que depende el backend- no deben quedar
--  sin aplicar.)
-- ============================================================

ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_sensor   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS conteo_validado  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE historial_produccion ADD COLUMN IF NOT EXISTS pasadas_objetivo INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN historial_produccion.pasadas_totales IS
  'Conteo de pasadas por reloj de la web (estimación) mientras no haya sensor. Con el Nivel 2 instalado, el conteo medido está en pasadas_sensor.';
COMMENT ON COLUMN historial_produccion.pasadas_sensor IS
  'Pasadas reportadas por el sensor inductivo del Bloque C. Distinto de pasadas_totales, que puede ser una estimación por tiempo.';
COMMENT ON COLUMN historial_produccion.conteo_validado IS
  'Verdadero solo después de comparar el conteo del sensor contra el contador mecánico del telar durante una jornada completa.';
COMMENT ON COLUMN historial_produccion.pasadas_objetivo IS
  'Pasadas que tiene la pieza. Cero significa sin objetivo. La parada automática requiere conteo_validado en verdadero.';

ALTER TABLE telares ADD COLUMN IF NOT EXISTS ultimo_reporte_sensor TIMESTAMPTZ;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS retrocesos_contados   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telares ADD COLUMN IF NOT EXISTS motivo_pausa           TEXT;

COMMENT ON COLUMN telares.ultimo_reporte_sensor IS
  'Último reporte de pasadas del sensor del Nivel 2. En NULL o viejo: el conteo es una estimación por reloj.';
COMMENT ON COLUMN telares.retrocesos_contados IS
  'Cantidad total de retrocesos del telar (web + botonera física). Lo lee el Nivel 2 para descontar pasadas. No es lo mismo que retroceder_seq, que es la orden hacia el ESP32 del Nivel 1.';

COMMENT ON COLUMN telares.motivo_pausa IS
  'Por qué quedó pausado el telar cuando no fue una decisión del operario. ''sin_senal'': el sensor de pasada dejó de recibir pulsos (la máquina se frenó o el sensor falló). ''reinicio'': el ESP32 arrancó en frío (corte de luz o traslado) y el tejido quedó en pausa conservando la posición. NULL en cualquier otro caso.';

-- ============================================================
-- migracion_013_indice_unico_en_curso.sql
-- ============================================================
-- ============================================================
-- Migración 013: una sola producción 'en_curso' por telar
--
-- Hasta ahora el índice idx_historial_en_curso no era UNIQUE: nada impedía dos producciones
-- abiertas en el mismo telar, y el LEFT JOIN de listarTelares duplicaría filas.
--
-- Va en una migración aparte de la 012 a propósito: si esta falla por datos previos, las columnas
-- nuevas de la 012 (de las que depende el backend) igual quedan aplicadas.
-- ============================================================

-- Una sola producción abierta por telar. Si por algún error ya hubiera dos, se cierra
-- como detenida la más vieja (no se borra nada) para poder crear el índice.
UPDATE historial_produccion h
   SET estado = 'detenido_manual', fecha_fin = COALESCE(fecha_fin, now())
 WHERE h.estado = 'en_curso'
   AND EXISTS (
     SELECT 1 FROM historial_produccion h2
      WHERE h2.telar_id = h.telar_id AND h2.estado = 'en_curso'
        AND (h2.fecha_inicio > h.fecha_inicio OR (h2.fecha_inicio = h.fecha_inicio AND h2.id > h.id))
   );

DROP INDEX IF EXISTS idx_historial_en_curso;
CREATE UNIQUE INDEX IF NOT EXISTS idx_historial_en_curso ON historial_produccion (telar_id) WHERE estado = 'en_curso';

-- ============================================================
-- migracion_014_repeticiones_por_fila.sql
-- ============================================================
-- ============================================================
-- Migración 014: repeticiones por fila y nuevos rangos del dibujo
--
-- Una fila del dibujo es una pasada, y eso no cambia. Lo que faltaba es poder
-- decir cuántas veces se repite esa misma pasada: en un tejido real es habitual
-- que la misma combinación de bobinas se repita cien o mil veces seguidas antes
-- de cambiar. Hasta ahora había que dibujar cien filas idénticas.
--
-- repeticiones_por_fila guarda un número por cada fila del dibujo. En NULL
-- significa "todas las filas una vez", que es exactamente el comportamiento
-- anterior: los dibujos que ya existen siguen tejiéndose igual.
--
-- Además se corrigen los rangos. Las columnas son bobinas de selección, y una
-- máquina tiene entre 1 y 8: permitir 32 no tenía sentido físico. Las filas
-- pasan a 1 a 100, porque con las repeticiones ya no hace falta que sean muchas.
-- ============================================================

ALTER TABLE patrones
  ADD COLUMN IF NOT EXISTS repeticiones_por_fila INTEGER[];

COMMENT ON COLUMN patrones.repeticiones_por_fila IS
  'Cuántas pasadas seguidas se teje cada fila. Un elemento por fila, en el mismo orden. En NULL significa una pasada por fila (comportamiento anterior).';

-- Los rangos viejos (2 a 32) se reemplazan. Se usa NOT VALID para no rechazar
-- los dibujos que ya están guardados: la restricción rige para lo que se cree o
-- modifique de acá en adelante.
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_filas_check;
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_columnas_check;
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_filas_rango;
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_columnas_rango;

ALTER TABLE patrones
  ADD CONSTRAINT patrones_filas_rango CHECK (filas BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE patrones
  ADD CONSTRAINT patrones_columnas_rango CHECK (columnas BETWEEN 1 AND 8) NOT VALID;

-- Cada elemento de repeticiones_por_fila tiene que ser al menos 1.
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_repeticiones_positivas;
ALTER TABLE patrones
  ADD CONSTRAINT patrones_repeticiones_positivas
  -- Sin subconsultas: PostgreSQL no las admite dentro de un CHECK. Los operadores
  -- <= ALL y >= ALL sobre un array sí son válidos acá.
  CHECK (repeticiones_por_fila IS NULL
         OR (array_length(repeticiones_por_fila, 1) = filas
             AND 1 <= ALL (repeticiones_por_fila)
             AND 9999 >= ALL (repeticiones_por_fila)))
  NOT VALID;

-- Los elementos de selección de un telar también son como máximo 8.
ALTER TABLE telares DROP CONSTRAINT IF EXISTS telares_elementos_seleccion_check;
ALTER TABLE telares DROP CONSTRAINT IF EXISTS telares_elementos_rango;
ALTER TABLE telares
  ADD CONSTRAINT telares_elementos_rango CHECK (elementos_seleccion BETWEEN 1 AND 8) NOT VALID;

-- ============================================================
-- migracion_015_repeticion_en_fila.sql
-- ============================================================
-- ============================================================
-- Migración 015: posición dentro de la fila
--
-- Con las repeticiones por fila (migración 014), una pasada ya no equivale a
-- avanzar una fila: una fila con 100 repeticiones son 100 pasadas antes de pasar
-- a la siguiente. La posición de una producción dejó de ser un solo número.
--
-- repeticion_en_fila guarda cuántas pasadas de la fila actual ya se tejieron
-- (0 significa que todavía no se tejió ninguna de esa fila). Sin este dato, la
-- aplicación y el nodo avanzaban distinto: la web se quedaba en la fila mientras
-- el backend la adelantaba, y cada sincronización pegaba un salto.
-- ============================================================

ALTER TABLE historial_produccion
  ADD COLUMN IF NOT EXISTS repeticion_en_fila INTEGER NOT NULL DEFAULT 0
  CHECK (repeticion_en_fila >= 0);

COMMENT ON COLUMN historial_produccion.repeticion_en_fila IS
  'Cuántas pasadas de la fila actual ya se tejieron. Con repeticiones_por_fila del dibujo define la posición exacta dentro de la producción.';

-- ============================================================
-- Registro de migraciones
-- ============================================================
CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
  archivo     TEXT PRIMARY KEY,
  aplicada_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO migraciones_aplicadas (archivo) VALUES
  ('migracion_001_matriz_ligamento.sql'),
  ('migracion_002_repeticiones_y_posicion.sql'),
  ('migracion_003_login_biometrico.sql'),
  ('migracion_004_recupero_usuarios.sql'),
  ('migracion_005_codigo_recuperacion_fijo.sql'),
  ('migracion_006_ping_esp32.sql'),
  ('migracion_007_retroceder_fisico.sql'),
  ('migracion_008_evento_fisico.sql'),
  ('migracion_009_rango_dimensiones.sql'),
  ('migracion_010_elementos_seleccion.sql'),
  ('migracion_011_metros_por_pasada.sql'),
  ('migracion_012_conteo_sensor_y_retrocesos.sql'),
  ('migracion_013_indice_unico_en_curso.sql'),
  ('migracion_014_repeticiones_por_fila.sql'),
  ('migracion_015_repeticion_en_fila.sql')
ON CONFLICT (archivo) DO NOTHING;
