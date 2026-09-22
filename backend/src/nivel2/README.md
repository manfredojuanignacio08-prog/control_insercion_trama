# Backend del Nivel 2

Endpoints que usa el firmware del Nivel 2 (conteo real de pasadas y selección del
dibujo). Ya están **montados** en `server.js` bajo `/api/telares` y, como todo lo
que toca el hardware, exigen la clave de dispositivo (header `X-Device-Key`, valor
de `ESP32_DEVICE_KEY` en el `.env`).

| Endpoint | Quién | Para qué |
|---|---|---|
| `GET /api/telares/:id/patron-actual` | dispositivo o sesión | El firmware descarga la matriz del dibujo asignado y la posición donde quedó |
| `POST /api/telares/:id/pasadas` | solo dispositivo | El firmware reporta el conteo real del sensor (`pasadas_sensor`, `fila_actual`) |
| `POST /api/telares/:id/evento-fisico` con `{tipo:"sin_senal"}` | solo dispositivo | El sensor dejó de recibir pulsos con el telar en marcha: la web pasa a "pausado" y queda un registro en el log de errores |
| `POST /api/telares/:id/validar-conteo` con `{confirmo:true}` | sesión | El operario da por bueno el conteo del sensor tras compararlo con el contador mecánico |

## Conteo estimado vs. medido

Mientras el sensor no esté instalado, `pasadas_totales` sale del **reloj de la web**
(una pasada cada 500 ms): es una estimación, y así se marca (`origen_conteo:
"estimado"`). Con el sensor reportando:

- el conteo medido se guarda en `pasadas_sensor` (nunca en `pasadas_totales`, para
  poder compararlos durante la jornada de validación);
- `telares.ultimo_reporte_sensor` se actualiza en cada reporte, y mientras sea
  reciente (30 s) `POST /avanzar` responde `409 SENSOR_ACTIVO`: la web deja de
  avanzar por reloj y sigue la posición que informa el sensor;
- el conteo pasa a `origen_conteo: "sensor"` y solo pasa a `"sensor_validado"`
  después de `POST /validar-conteo`. Los metros de las estadísticas se marcan como
  estimados mientras no esté validado.

## Retrocesos

`telares.retrocesos_contados` cuenta cada retroceso del telar (desde la web o desde
la botonera). El Nivel 2 lo compara con el último valor que vio para saber cuántas
pasadas descontar. **No usar `retroceder_seq` para eso**: es la orden que la web le da
al ESP32 del Nivel 1, y subirla por un botón físico haría que el Nivel 1 pulsara el
relé otra vez.

## Antes de fiarse de los números

El conteo del sensor no debe tomarse como bueno hasta compararlo contra el contador
mecánico del telar durante una jornada completa.
