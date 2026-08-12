# ⚠️ CARPETA DE REFERENCIA — NO FUNCIONAL POR AHORA

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
  nativa — en ese caso, sirve de punto de partida (ya tiene la estructura
  de datos, la conexión a la API y las pantallas base esbozadas).

Si estás evaluando o usando el proyecto ahora, **podés ignorar esta carpeta
por completo.** Todo lo que importa está en `backend/`, `esp32/`,
`database/`, `docs/` y `diagramas/`.

El contenido técnico original de esta base está en `README_tecnico.md`
(dentro de esta misma carpeta), por si se retoma más adelante.
