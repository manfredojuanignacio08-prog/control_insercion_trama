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
