-- ============================================================
-- Migración 003: Login biométrico (huella / rostro) con WebAuthn
--
-- El login biométrico se implementa con el estándar WebAuthn / FIDO2.
-- Punto CLAVE de seguridad: la huella o el rostro NUNCA se guardan en la
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
  -- Tipo de autenticador, informativo: "platform" (huella/rostro integrado
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
