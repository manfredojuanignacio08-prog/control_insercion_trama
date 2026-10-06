# ⚠️ CARPETA DE REFERENCIA, NO FUNCIONAL POR AHORA

Esta carpeta contiene una **base de arquitectura para una eventual app
Android**, guardada **solo como referencia para el futuro**. 

**NO es parte del producto actual y NO está en uso.**

El producto de este proyecto es la **página web** (servida por el backend,
diseñada para verse en el celular) + el backend + la base de datos + el
ESP32. La interfaz con la que se usa el sistema es esa web, no una app.

Este código Android:
- **No está compilado ni probado** en Android Studio.
- **No se mantiene** al día con los cambios del resto del proyecto.
- Queda acá por si en algún momento se decide retomar la idea de una app
  nativa, en ese caso, sirve de punto de partida (ya tiene la estructura
  de datos, la conexión a la API y las pantallas base esbozadas).

Si estás evaluando o usando el proyecto ahora, **podés ignorar esta carpeta
por completo.** Todo lo que importa está en `backend/`, `esp32/`,
`database/`, `docs/` y `diagramas/`.

## Qué tendría que cambiar antes de retomarla

Desde que se escribió, la API cambió. Tal como está, esta app **no funcionaría**:

- **Inicio de sesión.** Hoy toda la API (salvo `/api/health` y `/api/auth/*`) exige una
  sesión (cookie firmada que entrega el ingreso con huella o con el código de recuperación)
  o la clave del dispositivo. Sin eso cada pedido responde **401**. Habría que sumar el
  ingreso (WebAuthn en Android, o el código de recuperación con `POST /api/auth/recuperar`)
  y guardar la cookie (`CookieJar` de OkHttp).
- **Pausa y reanudación.** El telar se pausa con `POST /api/telares/:id/pausar` y se retoma
  con `/reanudar`; `/detener` cierra el trabajo. La app solo conoce `/detener`.
- **Quién avanza la posición.** El sensor del Nivel 2 informa con
  `POST /api/telares/:id/pasadas` (solo con la clave del dispositivo); `/avanzar` es el
  avance estimado por reloj que usa la web, y responde 409 cuando el sensor está activo.
- **Campos nuevos** de los modelos: `repeticiones_por_fila`, `metros_por_pasada`,
  `repeticion_en_fila`, `pasadas_sensor`, `origen_conteo`, entre otros (ver
  `backend/README.md`).

El contenido técnico original de esta base está en `README_tecnico.md`
(dentro de esta misma carpeta), por si se retoma más adelante.
