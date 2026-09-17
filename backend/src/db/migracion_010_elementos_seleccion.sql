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
