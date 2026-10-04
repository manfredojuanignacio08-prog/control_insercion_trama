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
