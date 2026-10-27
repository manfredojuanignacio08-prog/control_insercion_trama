-- 016 · recovery_code ahora guarda el código CIFRADO (AES-256-GCM), no texto plano.
-- Sin cambio de esquema: la columna TEXT ya contiene el valor; las filas
-- viejas en texto plano se migran solas al usarse (login por código o endpoint ver).
-- Este archivo solo documenta el cambio para el tracking de migraciones.
DO $$ BEGIN
  RAISE NOTICE '016: recovery_code en reposo cifrado (ver auth.controller.js). Requiere RECOVERY_SECRET en el .env.';
END $$;
