-- ============================================================
-- Migración 009: acotar filas y columnas al rango 2 a 32
--
-- El editor de la aplicación ya validaba ese rango, pero la base
-- solo exigía "mayor que cero". Un dibujo creado por fuera de la
-- interfaz (por API) podía quedar con dimensiones que el operario
-- no puede ver y que el firmware no puede ejecutar: su MAX_FILAS
-- es 32 y truncaría el dibujo en silencio.
--
-- Antes de aplicar la restricción se corrigen los registros que
-- pudieran haber quedado fuera de rango, para que la migración no
-- falle sobre una base con datos.
-- ============================================================

DELETE FROM patrones WHERE filas < 2 OR filas > 32 OR columnas < 2 OR columnas > 32;

ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_filas_check;
ALTER TABLE patrones DROP CONSTRAINT IF EXISTS patrones_columnas_check;

ALTER TABLE patrones ADD CONSTRAINT patrones_filas_check    CHECK (filas    BETWEEN 2 AND 32);
ALTER TABLE patrones ADD CONSTRAINT patrones_columnas_check CHECK (columnas BETWEEN 2 AND 32);
