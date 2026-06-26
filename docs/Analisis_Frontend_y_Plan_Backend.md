# Análisis del Frontend y Plan de Backend
## Control de Inserción de Trama — Industria Textil Argentina (Ferrando)

---

## 0. Decisiones confirmadas

> ⚠️ **Actualización (20/06/2026):** se definió que **el backend no se modifica** —
> `matriz_ligamento` se mantiene como parte del backend (con derivación automática
> desde `matriz_pasadas`). En cambio, se generó una **migración SQL**
> (`backend/src/db/migracion_001_matriz_ligamento.sql`, ejecutable con
> `npm run migrate`) para actualizar la base real de Supabase y que coincida con
> el backend, en vez de achicar el backend para que coincida con la base. Ver
> sección 9 para el detalle de la migración y cómo se probó.

| Decisión | Resolución |
|---|---|
| ¿Qué representa la matriz? | **Las dos cosas, en campos separados**: `matriz_pasadas` (enteros) y `matriz_ligamento` (binario, derivado automáticamente). El backend la mantiene; la base de Supabase se actualiza con la migración para tenerla también. |
| Alcance de telares para el MVP | **Esquema multi-telar desde ahora**, pero el piloto funcional arranca probando con **1 solo telar** conectado. |
| Login de operarios | **No por ahora.** Sistema abierto en planta, sin tabla de usuarios ni auth en esta versión. |
| ¿Dónde vive la base de datos? | **Supabase** (PostgreSQL administrado en la nube), no una base local. Credenciales compartidas por el equipo. |
| Tipografía del frontend | **Century Gothic**, con `Questrial` (Google Fonts) como respaldo — Century Gothic es una fuente comercial y no se puede empaquetar ni cargar desde un CDN gratuito, así que se usa si el sistema operativo del usuario ya la tiene instalada, y si no, cae a Questrial (la alternativa libre más parecida geométricamente). |

---

## 1. Qué hay en el paquete

> **Nota:** las secciones 1 y 2 describen el **frontend original** tal como
> llegó (el punto de partida del análisis). El estado actual —conectado al
> backend, con PDF real, etc.— está en las secciones 8 a 12. Se conservan
> como referencia de dónde se arrancó.

```
Control_Insercion_Trama_V14_Final/
├── index.html              ← ARCHIVO ACTIVO (usa styles.css externo)
├── styles.css               ← hoja de estilos (637 líneas, 108 clases, bien organizada)
├── index_backup.html        ← backup viejo (CSS inline), idéntico a telar_industrial.html
├── telar_industrial.html    ← duplicado exacto del backup (se puede borrar)
├── save_fix.js               ← código HUÉRFANO, no referenciado en ningún HTML
├── images/                   ← logos y fotos (algunas no se usan en el HTML)
└── build_html.py, build_v2/3/4.py, add_features.py, integrate_*.py, remove_bg*.py, process_new_logo.py
                              ← scripts de desarrollo que generaron el HTML a fuerza de
                                parchear strings. Son artefactos de proceso, no del producto.
```

**Conclusión #1:** es un frontend 100% estático (HTML + CSS + JS vanilla, sin framework, sin build tool, sin `package.json`). No hay ninguna llamada a un backend — confirmé con `grep` que no existe ni un `fetch()`, ni `XMLHttpRequest`, ni referencia a ESP32 en todo el código. Todo corre y persiste **solo en el navegador**.

---

## 2. Cómo funciona hoy (lógica real del JS)

- **3 pantallas (SPA por `display`):** Inicio, Editor, Biblioteca.
- **Persistencia:** `localStorage`, claves `telar_v3` (array de dibujos), `currentDraw` (dibujo activo) y `telar_errors` (log de errores, máx. 10).
- **Modelo de un "dibujo" en el cliente:**
  ```js
  {
    id, nombre, filas, columnas,
    matriz:  [[...]],   // ⚠️ NO es binario 0/1 — cada celda guarda el N° DE PASADAS (0,1,2,3...)
    colores: [...],     // color de hilo por FILA (hex), separado de la matriz
    creadoAt, modificadoAt
  }
  ```
- **Simulación de tejido:** `startPlay/pausePlay/stopPlay/rollback` avanzan celda por celda con `setTimeout` (500ms si la celda tiene pasadas, 100ms si está vacía). Es una **simulación visual pura**, no hay comunicación con hardware real.
- **"Exportar a PDF"** (`exportDrawToPDF`) en realidad descargaba un `.txt` plano — el botón estaba mal etiquetado, no generaba un PDF real. *(✅ Resuelto — ver sección 8)*
- **Sin selector de telar/máquina**, sin login, sin tema persistente (el modo oscuro se resetea al recargar).

---

## 3. Problemas / deuda técnica detectados (con su estado actual)

> Esta tabla es el diagnóstico **original** del frontend. La columna "Estado"
> refleja qué se resolvió a lo largo del proyecto.

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Logo embebido en base64 **3 veces** dentro del HTML (~240KB extra). | Sin cambios (cosmético, no afecta el funcionamiento). |
| 2 | `save_fix.js` no está enlazado a ningún HTML — código muerto. | ✅ No se incluyó en el paquete final (solo van `index.html` y `styles.css` limpios). |
| 3 | "Exportar PDF" no exportaba PDF real. | ✅ Resuelto: genera un PDF real con jsPDF local. |
| 4 | No existía noción de "telar" en el frontend. | ✅ Resuelto: telar único automático + endpoints de telar (ver sección 11). |
| 5 | Matriz entera (pasadas) vs binaria (ligamento). | ✅ Resuelto: `matriz_pasadas` (entera) y `matriz_ligamento` (binaria, derivada) son campos separados. |
| 6 | No hay pantalla de historial de producción. | Parcial: las tablas y datos ya existen en la base; falta la pantalla visual (único pendiente de UI real). |
| 7 | Archivos de desarrollo (`build_*.py`, backups) no deberían ir a producción. | ✅ No se incluyeron en el paquete final. |

**Conclusión actual:** lo que en el análisis inicial era un "prototipo
desconectado" hoy es un sistema conectado de punta a punta: el frontend habla
con el backend en cada acción (no solo al guardar) y todo persiste en
PostgreSQL. Lo único que queda a nivel de interfaz es la pantalla de historial
de producción; lo único a nivel de hardware es el ESP32 (próxima etapa).

---

## 4. Lo que ya define el documento de base de datos (resumen)

- Motor: **PostgreSQL**, con **JSONB** para las matrices (decisión correcta para evitar JOINs masivos al reconstruir grillas).
- Backend: **Node.js** como intermediario entre Frontend ↔ PostgreSQL ↔ ESP32.
- Patrones = biblioteca genérica, independiente de los telares (evita duplicar diseños).
- Relación patrón↔telar = muchos a muchos, resuelta con tabla intermedia transaccional (`historial_produccion`) para trazabilidad (inicio, fin, pasadas totales, alertas).
- `telares.patron_actual_id` (FK nullable) indica qué está tejiendo cada máquina ahora.

---

## 5. Esquema PostgreSQL final (coincide con `backend/src/db/schema.sql`)

```sql
CREATE TABLE patrones (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  filas             INTEGER NOT NULL,
  columnas          INTEGER NOT NULL,
  matriz_pasadas    JSONB NOT NULL,   -- array de arrays de ENTEROS: cuántas pasadas por celda (lo que ya programa el editor)
  matriz_ligamento  JSONB,            -- array de arrays BINARIOS (0/1): lizo arriba/abajo (derivado automáticamente si no se manda)
  colores_filas     JSONB,            -- array de colores hex por fila (puede ser NULL)
  metadata          JSONB,            -- ej: {"tipo": "Tafetán"} para clasificar ligamentos
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telares (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,     -- ej: "TELAR-01"
  nombre            TEXT,
  estado            TEXT DEFAULT 'apagado',   -- apagado | tejiendo | pausado | error
  patron_actual_id  INTEGER REFERENCES patrones(id) ON DELETE SET NULL,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE historial_produccion (
  id                   SERIAL PRIMARY KEY,
  telar_id             INTEGER NOT NULL REFERENCES telares(id),
  patron_id            INTEGER NOT NULL REFERENCES patrones(id),
  fecha_inicio         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_fin            TIMESTAMPTZ,            -- NULL mientras está en curso
  pasadas_totales      INTEGER DEFAULT 0,
  alertas_disparadas   INTEGER DEFAULT 0,
  fila_actual          INTEGER DEFAULT 0,     -- posición exacta (mismo significado que curRow del frontend)
  columna_actual       INTEGER DEFAULT 0,     -- (mismo significado que curCol del frontend)
  pasada_actual        INTEGER DEFAULT 0,     -- (mismo significado que curPass del frontend)
  vueltas_completadas  INTEGER DEFAULT 0,     -- cuántas veces se tejió el patrón entero (no hay "final", es un bucle infinito)
  estado               TEXT DEFAULT 'en_curso' -- en_curso | finalizado | detenido_manual
);

CREATE TABLE errores_log (   -- reemplaza el localStorage 'telar_errors'
  id          SERIAL PRIMARY KEY,
  telar_id    INTEGER REFERENCES telares(id),
  titulo      TEXT,
  mensaje     TEXT,
  codigo      TEXT,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> Esta es la versión final, idéntica a `backend/src/db/schema.sql`. Las
> secciones 9 a 11 más abajo explican cómo se llegó hasta acá (incluida una
> corrección de diseño sobre la marcha).

---

## 6. Mapeo función del frontend → endpoint (todos ya implementados)

> Esta tabla era el **plan** de qué endpoint reemplazaría a cada función del
> frontend original. Hoy **todos están implementados y en uso**. El "no existía
> en el frontend original" indica que esa función la sumamos nosotros (no venía
> en el prototipo de partida), no que falte.

| Función del frontend original | Endpoint que la reemplaza (ya implementado) |
|---|---|
| `loadStore()` (leía `localStorage`) | `GET /api/patrones?buscar=` |
| `saveDraw()` crear | `POST /api/patrones` |
| `saveDraw()` editar | `PUT /api/patrones/:id` |
| `deleteDraw(id)` | `DELETE /api/patrones/:id` |
| `loadDrawInEditor(id)` | `GET /api/patrones/:id` |
| (nuevo, no venía en el prototipo) | `GET /api/telares` / `GET /api/telares/:id` |
| (nuevo, no venía en el prototipo) | `POST /api/telares/:id/asignar-patron` `{patron_id}` → abre fila en `historial_produccion` |
| (nuevo, no venía en el prototipo) | `POST /api/telares/:id/detener` → cierra la fila con `fecha_fin`, `pasadas_totales`, `alertas` |
| (nuevo, no venía en el prototipo) | `POST /api/telares/:id/avanzar` `{pasos?}` → avanza fila/columna/pasada — ver sección 10 |
| (nuevo, no venía en el prototipo) | `POST /api/telares/:id/retroceder` `{pasos?}` → retrocede fila/columna/pasada — ver sección 10 |
| (nuevo, no venía en el prototipo) | `GET /api/telares/:id/historial` y `GET /api/historial` (datos listos; falta la pantalla visual) |

---

## 7. Plan recomendado por fases

**Fase 1 — Backend mínimo (sin tocar hardware):**
Node.js + Express + `pg`, exponer CRUD de `patrones`. Cambiar en el frontend solo las funciones `loadStore/saveStore/deleteDraw/loadDrawInEditor` para que usen `fetch()` en vez de `localStorage`. El resto de la UI no se toca.

**Fase 2 — Activar telares (esquema ya multi-telar, piloto con 1 máquina):**
Las tablas `telares` y `historial_produccion` se crean desde la Fase 1 (no hay migración después). Funcionalmente, el piloto arranca con un solo registro en `telares` conectado de verdad; agregar el resto es solo insertar filas nuevas, sin tocar esquema ni backend. En el frontend hay que sumar el selector de máquina (hoy no existe) y las pantallas de asignación/historial.

**Fase 3 — Integración real con ESP32:**
Reemplazar la simulación de `startPlay/doTick` por datos reales del microcontrolador (vía WebSocket o polling), y que `pasadas_totales`/`alertas_disparadas` se completen con datos del sensor óptico, no simulados.

**Limpieza recomendada antes de seguir:** borrar `index_backup.html`, `telar_industrial.html`, `save_fix.js` y los scripts `build_*.py` / `add_*.py` / `integrate_*.py` del repo de producción (dejarlos en un historial de git si hace falta, pero no en el paquete final), y reemplazar el base64 triplicado del logo por una referencia de archivo.

---

## 8. Estado de los pendientes

> ✅ **El PDF real de ficha técnica ya está implementado** (con `jsPDF`, bundleado localmente —
> no depende de internet). Genera un PDF con nombre, fecha, dimensiones y la grilla completa
> coloreada igual que en el editor. Dejó de ser un pendiente.

> ✅ **`matriz_ligamento` se mantiene en el backend** (no se quitó). En cambio, se
> migró la base de datos real de Supabase para que la tenga también — ver sección 9.

---

## 9. Migración de la base de datos real (Supabase) para que coincida con el backend

Se decidió que el backend es la fuente de verdad — en vez de sacarle `matriz_ligamento`
para que coincida con la base que el equipo ya armó, se generó una migración que
actualiza esa base para que coincida con el backend.

**Archivo:** `backend/src/db/migracion_001_matriz_ligamento.sql`
**Cómo correrla:** `npm run migrate` (con `.env` apuntando a la base de Supabase real)

Qué hace, en orden:
1. Agrega la columna `matriz_ligamento JSONB` a `patrones` (la única diferencia real
   de columnas entre el backend y la base).
2. Agrega los mismos `CHECK` constraints que ya tiene `schema.sql` (`filas > 0`,
   `columnas > 0`, los `estado` válidos de `telares` y `historial_produccion`).
3. Agrega los mismos índices de apoyo (`idx_historial_telar`, `idx_historial_patron`,
   `idx_historial_en_curso`, `idx_errores_telar`).
4. Agrega el trigger que mantiene `patrones.modificado_at` actualizado solo.
5. **Backfill opcional:** completa `matriz_ligamento` para los patrones que ya
   existían antes de la migración, usando la misma regla que usa el backend
   (`pasadas > 0 → 1`), así no quedan en `NULL` hasta la próxima edición.

Es 100% seguro de correr contra una base con datos reales: todo usa
`ADD COLUMN IF NOT EXISTS` / chequeos `IF NOT EXISTS` antes de cada `ADD CONSTRAINT`
/ `CREATE INDEX IF NOT EXISTS` — no borra ni pisa nada existente, y se puede
correr más de una vez sin error.

**Cómo se probó** (antes de entregarla): se recreó una base desde cero usando
el script SQL **literal** que figura en `Documentacion_BaseDeDatos_Telar.docx`
(sin nada nuestro), se cargaron 2 patrones de prueba sin `matriz_ligamento`, se
corrió la migración, y se confirmó que: la columna quedó agregada, los 2
patrones viejos quedaron con `matriz_ligamento` completado automáticamente, los
índices y el trigger quedaron creados, y el backend (con `matriz_ligamento`
intacta) pudo leer y escribir contra esa base migrada sin ningún error.

---

## 10. Decisiones que el equipo había dejado sin resolver — ya implementadas

`Documentacion_BaseDeDatos_Telar.docx` listaba estos dos puntos como pendientes.
El usuario pidió resolverlos eligiendo la opción más eficiente para producción
real en fábrica, y luego corrigió mi primera implementación al aclarar cómo
funciona realmente el tejido — la versión final quedó así:

### ⚠️ Corrección de diseño (importante)

Mi primera versión modeló la repetición **a nivel de fila completa**
(`patrones.repeticiones_filas = [3, 150, 2]`, "repetir toda la fila 1 tres
veces, la fila 2 ciento cincuenta veces"). El usuario aclaró que **no es así
como funciona el editor**: la repetición ya existe **a nivel de celda
individual** — cada valor de `matriz_pasadas` ya es "cuántas veces se repite
*esa celda exacta*" antes de pasar a la siguiente columna. Esto se confirma
mirando el código que ya existía en el frontend (`doTick()` en `index.html`,
nunca se tocó):

```js
const cellPasadas = grid[curRow][curCol];   // la celda puede repetirse
curPass++;
if (curPass >= cellPasadas) { curCol++ }    // recién ahí pasa a la siguiente celda
if (curCol >= nC) { curRow++ }              // fin de fila -> siguiente fila
if (curRow >= nR) { curRow = 0; ... }       // fin del patrón -> vuelve a empezar (bucle infinito)
```

Es decir: **no había que agregar ningún campo nuevo para la repetición** — ya
estaba resuelta desde el principio del proyecto. Lo único que faltaba era la
posición para el retroceso. Se corrigió el backend para que coincida
exactamente con esta lógica (ver `migracion_002_repeticiones_y_posicion.sql`,
que ahora limpia el campo `repeticiones_filas` si llegó a crearse).

### Retroceso a nivel de base de datos — ✅ resuelto (versión corregida)

**Elegido:** `historial_produccion.fila_actual`, `columna_actual` y
`pasada_actual` (mismo significado que `curRow`/`curCol`/`curPass` del
frontend) + `vueltas_completadas` (cuántas veces se tejió el patrón entero
de punta a punta — no existe un "final", el tejido es infinito hasta que se
detiene manualmente, igual que un telar real).

**Por qué `historial_produccion` y no `telares`:** ya existía el índice
`idx_historial_en_curso`, pensado justo para encontrar rápido la producción
activa de un telar — usarlo evita guardar la misma posición en dos tablas
que se puedan desincronizar, y de paso queda registrado en el historial
dónde se quedó *cada* producción pasada (diagnóstico/trazabilidad útil en planta).

**Endpoints nuevos** (`backend/src/controllers/telares.controller.js`):
- `POST /api/telares/:id/avanzar` `{pasos?}` — avanza N pasos (pensado para
  que lo llame el ESP32 al reportar pasadas físicas; acepta varios pasos de
  una sola llamada para no golpear la base en cada pasada individual). Nunca
  "termina" — al llegar a la última celda vuelve a la fila 0 y sigue, sumando
  a `vueltas_completadas`.
- `POST /api/telares/:id/retroceder` `{pasos?}` — la función de "volver
  atrás" pedida por el equipo, espejo exacto de `rollback()` del frontend
  (retrocede una celda completa, sin importar en qué pasada estaba; esa
  celda se retoma desde 0). Devuelve `al_inicio: true` si ya no se puede
  retroceder más.
- La lógica de avance/retroceso es pura y está aislada en
  `backend/src/utils/posicion.js` (sin tocar la base) — es un puerto 1:1 de
  `doTick()`/`rollback()` del frontend a Node.js, para que el comportamiento
  sea idéntico en los dos lados.

**Probado:** con un patrón de 2×3 (`[[1,0,2],[0,3,1]]`) se calculó a mano
cuántos pasos hacen falta para completar una vuelta entera (9 pasos), se
avanzó 15 pasos vía API contra una base PostgreSQL real y el resultado
coincidió exactamente con el cálculo manual (cruzó de fila, dio una vuelta
completa, y siguió en la segunda vuelta). También se probó: retroceder
cruzando de fila, no poder retroceder más allá del inicio absoluto
(`al_inicio: true`, sin bajar `pasadas_totales` de 0), y que una base que
ya tenía la versión anterior (incorrecta) de esta migración se corrige sola
sin perder ningún dato real.

**Actualización:** lo que en esa sección decía "pendiente" ya se hizo — ver
sección 11.

---

## 11. Frontend conectado al backend en cada acción (no solo al Guardar)

El usuario pidió ir un paso más allá: que **todo** lo que se hace en el
editor (no solo "Guardar") llegue a la base de datos — tocar una celda,
cambiar un color, cambiar el tamaño, y también play/pausa/detener/retroceder.

### Decisión: telar único automático, sin selector

Como por ahora solo hay un telar físico, no se agregó ningún selector en la
UI — agregar una decisión a elegir cuando solo hay una opción es fricción de
más. En cambio: al cargar la página, el frontend pide la lista de telares
(`GET /api/telares`); si no hay ninguno, crea uno solo automáticamente
(`POST /api/telares`). Toda la lógica de abajo ya está escrita para trabajar
con cualquier id de telar — el día que haya más de uno, lo que cambia es
agregar el selector visual, no la lógica de conexión.

### Autoguardado en cada edición

Se agregó `sincronizarPatron()`, que hace `POST` (si el patrón es nuevo, sin
id todavía) o `PUT` (si ya existe) contra `/api/patrones`. Se llama
automáticamente — sin mostrar ningún diálogo de confirmación, a diferencia
del botón "Guardar" explícito — desde:
- Tocar una celda y poner sus pasadas (`openRepsModal`)
- Borrar una celda (botón "Eliminar" del modal de la celda)
- Cambiar el tamaño de la grilla (`applySize`)
- Limpiar toda la grilla (`clearGrid`)
- Cambiar el color de una fila o de toda la matriz (`applyThreadColor`)

Si el patrón todavía no tenía nombre ni se había guardado nunca, la primera
edición lo crea solo con un nombre por defecto (`Nuevo Dibujo N`) — así
*siempre* tiene un id en la base, incluso antes de que el usuario apriete
"Guardar" la primera vez.

### Play / Pausa / Detener / Retroceder conectados al telar

- **▶ Play** (`startPlay`): si el patrón no tiene id, lo guarda primero. Si
  el telar no tiene ya asignado este patrón, llama a
  `/telares/:id/asignar-patron` (esto arranca la posición en 0,0,0 en el
  backend). Recién ahí empieza la animación local de siempre.
- **Cada tick** (`doTick`): además de animar la grilla como siempre hizo,
  llama a `/telares/:id/avanzar` sin esperar la respuesta (*fire-and-forget*)
  para no frenar la animación visual por la latencia de red.
- **⏸ Pausa** (`pausePlay`): sin cambios — no llama a nada, porque "pausado"
  ya significa simplemente "dejar de tickear"; la posición en la base queda
  exactamente donde estaba.
- **⏹ Detener** (`stopPlay`): si había una posición activa, llama a
  `/telares/:id/detener` para cerrar la producción formalmente en el historial.
- **↺ Retroceder** (`rollback`): llama a `/telares/:id/retroceder` y usa la
  posición que devuelve el backend (no la calcula localmente) — así el
  navegador y la base nunca se desincronizan. Si el backend no responde, cae
  a un cálculo local de respaldo para no romper la experiencia.

### Probado

Como no se puede abrir un navegador real en este entorno, se simuló la
secuencia exacta de llamadas que haría el frontend (mismo orden, mismos
parámetros) contra el servidor real:
1. Carga de página → telar creado automáticamente.
2. Primer toque de celda → crea el patrón en la base sin que el usuario
   guarde explícitamente.
3. Segundo toque de celda → actualiza el mismo patrón (no duplica).
4. Cambio de color → se refleja en `colores_filas`.
5. Play → asigna el patrón al telar, arranca en (0,0,0).
6. 4 ticks de avance → la posición coincidió exactamente con el cálculo
   manual en cada paso (cruce de columna, cruce de fila).
7. Retroceder → la posición devuelta coincidió con el cálculo manual.
8. Detener → cierra la producción, el telar queda libre para la próxima vez.

---

## 12. Revisión de robustez (casos límite y consistencia)

Además de la funcionalidad principal, se hizo una revisión enfocada en casos
límite y consistencia. Lo que se verificó y/o corrigió:

- **Cruce frontend ↔ backend:** se confirmó que cada endpoint que el frontend
  invoca existe en el backend (patrones, telares, asignar/avanzar/retroceder/
  detener, errores) — no hay llamadas a rutas inexistentes.
- **Condición de carrera al crear (corregida):** si se tocaban dos celdas muy
  rápido en un patrón nuevo, la segunda llamada chocaba por nombre duplicado y
  ese cambio se perdía en silencio. Ahora, si hay una creación en curso, la
  segunda edición la espera en vez de mandar un segundo POST.
- **Borrar el patrón abierto en el editor (pulido):** antes quedaba en pantalla
  un patrón que ya no existía (y se "revivía" al tocar una celda). Ahora, al
  borrar desde la biblioteca el patrón que está abierto, el editor se limpia
  para empezar uno nuevo.
- **404 vs 409 en avanzar/retroceder (corregido):** antes, avanzar/retroceder
  sobre un telar inexistente devolvía 409 ("sin producción en curso") en vez de
  404 ("no existe el telar"). Ahora se distingue correctamente.
- **Validaciones de datos:** se probó que el backend rechaza con mensaje claro
  matrices con dimensiones que no coinciden, pasadas negativas y nombres vacíos.
- **Robustez de bodies:** body vacío usa los valores por defecto, un `pasos`
  no numérico se trata como 1, y un JSON roto devuelve 400 (no tira el
  servidor con un 500).

### Endurecimiento para producción (esta revisión)

- **Variables de entorno:** se verificó que las 14 variables que el código
  lee están todas documentadas en `.env.example`, ni una de más ni de menos.
- **Mensajes de error 500 en producción:** con `NODE_ENV=production`, un error
  interno inesperado ya no devuelve el mensaje técnico al cliente (que podría
  filtrar nombres de tablas o rutas) — se loguea completo del lado del
  servidor, pero al usuario le llega un texto genérico.
- **Content-Security-Policy:** se confirmó que el CSP de helmet permite
  exactamente lo que el frontend usa (Google Fonts para la tipografía, jsPDF
  servido localmente) y nada más.
- **Fuente sin internet:** el stack de fuentes cae a Century Gothic → Questrial
  (Google Fonts) → fuente del sistema, así que la página se ve bien aun si la
  planta no tiene conexión. Se unificó el fallback de títulos y cuerpo.
- **Cierre prolijo:** ante SIGTERM/SIGINT (lo que manda Render al reiniciar),
  el servidor cierra el pool de PostgreSQL antes de salir.

### Limitación conocida (no corregida a propósito)

Si dos ediciones de un patrón **ya guardado** llegan desordenadas por la red
(poco probable en uso normal, algo más probable con la latencia real de
Supabase), gana la última que llega al servidor. Resolverlo del todo requeriría
una cola de escritura por patrón — se evaluó que el costo no justifica el
beneficio para este caso de uso (un solo operario editando un patrón a la vez).
Conviene tenerlo presente si en el futuro varios usuarios editan el mismo
patrón en simultáneo.
