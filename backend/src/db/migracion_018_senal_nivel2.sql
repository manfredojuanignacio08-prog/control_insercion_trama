-- ============================================================
-- 018 · La consulta periódica del nodo del Nivel 2 también es señal de vida del sensor.
-- Antes solo la renovaban los reportes de pasadas, que el nodo no manda con el telar quieto:
-- tras una pausa de más de 30 s, al reanudar la web volvía a avanzar la posición por reloj, el
-- primer reporte del sensor ya no coincidía y el backend rechazaba ese y todos los siguientes.
-- Solo cambia la descripción de la columna: el dato es el mismo.
COMMENT ON COLUMN telares.ultimo_reporte_sensor IS
  'Última señal del nodo del Nivel 2: un reporte de pasadas o su consulta periódica (cada 2,5 s). Si es reciente (30 s), la posición y el conteo los lleva el sensor y la web no avanza por reloj. En NULL o viejo (sin nodo): el conteo es una estimación por reloj.';
