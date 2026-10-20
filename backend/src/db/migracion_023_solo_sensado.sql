-- ============================================================
-- 023 · Solo sensado: apagar el control del telar desde la página.
--
-- Con control_web_activo en false, la página no puede arrancar, pausar ni retroceder la máquina:
-- el backend rechaza esos pedidos (409 CONTROL_WEB_DESACTIVADO) y el ESP32 no pulsa ningún relé
-- aunque el estado cambie. Todo lo demás sigue igual: el sensado de la botonera y el sensor de
-- pasada avisan lo que hace la máquina, el Nivel 2 sigue seleccionando las bobinas del dibujo y
-- la página muestra la posición y el conteo. Sirve cuando se quiere manejar el telar solo con su
-- botonera (por ejemplo mientras se prueba el sistema en la fábrica).
--
-- Con el control apagado se puede cargar un dibujo (abre la producción sin arrancar la máquina:
-- arranca cuando alguien toca Marcha en la botonera) y terminar un trabajo con la máquina parada.
ALTER TABLE telares
  ADD COLUMN IF NOT EXISTS control_web_activo BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN telares.control_web_activo IS
  'false = solo sensado: la página no acciona Marcha, Pausa ni Retroceder (el ESP32 no pulsa los relés); el sensado sigue.';
