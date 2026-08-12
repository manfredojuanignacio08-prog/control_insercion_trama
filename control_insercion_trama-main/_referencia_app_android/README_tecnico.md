# Base de código — App Android (Control de Inserción de Trama)

Esto **no es un proyecto de Android Studio completo** (no incluye el
wrapper de Gradle, el SDK, ni los íconos) — es la **arquitectura y el
código fuente** que consume la misma API REST que ya usa el frontend web,
listo para pegar dentro de un proyecto nuevo. La idea es que arranques el
proyecto en Android Studio y copies estas carpetas adentro, en vez de
escribir esta capa desde cero.

**Punto clave para la presentación:** el backend **no se toca en absoluto**.
Esta app llama exactamente a los mismos endpoints que ya están construidos
y probados (`/api/patrones`, `/api/telares`, `/api/errores`) — es la misma
idea que se explica en la sección 11 del guion ("cómo se va a conectar en
el futuro").

---

## 1. Cómo crear el proyecto real en Android Studio

1. Abrí Android Studio → **New Project** → **Empty Activity** (la opción
   que ya usa Jetpack Compose, no la de "Views").
2. Elegí un nombre (ej. `ControlTrama`) y un **package name** — si querés
   que coincida con el código de acá sin tocar nada, usá
   `com.controltrama.app`. Si usás otro, hay que actualizar el `package` al
   inicio de cada archivo `.kt` (buscar y reemplazar `com.controltrama.app`
   por el que elegiste).
3. Language: **Kotlin**. Minimum SDK: 26 o superior anda bien.
4. Una vez creado, **reemplazá/completá** estos archivos con los de esta
   carpeta:

| Archivo de acá | Va a esta ruta en tu proyecto |
|---|---|
| `app/src/main/AndroidManifest.xml` | pisa el que ya existe |
| `app/src/main/res/xml/network_security_config.xml` | archivo nuevo (crear la carpeta `xml` dentro de `res` si no existe) |
| `app/src/main/java/com/controltrama/app/**` | pisa/agrega dentro de `app/src/main/java/<tu_package>/` |
| `dependencias_build.gradle.kts` | **fusionar** su contenido dentro del `dependencies { }` que ya tiene tu `app/build.gradle.kts` (no lo reemplaces entero) |

5. **"Sync Project with Gradle Files"** para que baje Retrofit, Gson, OkHttp
   y Navigation Compose.

> **Sobre los recursos (`@mipmap/ic_launcher`, tema, `strings.xml`):** no
> están en este paquete a propósito — los **genera Android Studio solo** al
> crear el proyecto "Empty Activity". El `AndroidManifest.xml` de acá usa el
> tema genérico `Theme.Material3.DayNight.NoActionBar` (que viene con
> Material3) justo para no depender de ningún recurso que haya que crear a
> mano. La identidad visual real (los colores de la marca, el modo
> claro/oscuro) la aplica Compose en `ui/theme/Theme.kt`, que es lo que se
> ve en pantalla. Si al pegar el manifest Android Studio marca algo en rojo,
> es porque tu proyecto todavía no generó `ic_launcher`: se arregla solo al
> compilar la primera vez, o con click derecho en `res` → New → Image Asset.

---

## 2. Cómo probar contra el backend

Antes de correr la app, hay que decirle a `RetrofitClient.kt` dónde está el
servidor. Es **una sola línea** para cambiar (`BASE_URL`):

| Situación | BASE_URL a usar |
|---|---|
| Emulador de Android Studio + backend corriendo en tu propia PC (`npm start`) | `http://10.0.2.2:3000/` |
| Celular físico en la misma Wi-Fi que la PC del backend | `http://IP_DE_TU_PC:3000/` |
| Backend desplegado en la nube (ej. Render) con HTTPS | `https://tu-backend.onrender.com/` |

> ⚠️ Si servís el backend por **HTTP** (sin HTTPS), Android bloquea ese
> tráfico por defecto — por eso viene incluido
> `network_security_config.xml`, donde hay que agregar la IP puntual de tu
> backend. Si el backend está desplegado con HTTPS (ej. Render), no hace
> falta tocar nada para ese dominio.

---

## 3. Arquitectura (mapea 1:1 con el backend)

```
ui/patrones, ui/telar        →  Pantallas (Compose) + ViewModels
        │
        ▼
data/repository/TramaRepository  →  Único punto que atrapa errores de red
        │                             (mismo espíritu que errorHandler.js)
        ▼
data/remote/ApiService       →  Interfaz Retrofit: un método por endpoint
        │                        real del backend, ni uno más ni uno menos
        ▼
data/model/*.kt              →  Las mismas formas de datos que ya devuelve
                                 la API (Patron, Telar, HistorialProduccion,
                                 ErrorLog) — los nombres de campo en
                                 snake_case del backend se mapean con
                                 @SerializedName
```

Esta separación en capas es intencional y es la misma idea que ya se usa en
el backend (rutas → controladores → utilidades puras): cada capa se puede
cambiar sin tocar las demás. Por ejemplo, el día de mañana se puede sumar
una base de datos local (para que la app funcione sin conexión) agregando
una capa nueva entre el Repository y los ViewModels, sin tocar las
pantallas.

### Archivos incluidos

- **`data/model/`** — `Patron.kt`, `Telar.kt`, `HistorialProduccion.kt`,
  `ErrorLog.kt`: las formas de datos, calcadas de lo que devuelve
  `patrones.controller.js` / `telares.controller.js` / `errores.controller.js`.
- **`data/remote/ApiService.kt`** — un método por cada endpoint real del
  backend (`GET`, `POST`, `PUT`, `DELETE`), con las mismas rutas.
- **`data/remote/RetrofitClient.kt`** — configuración única de red (acá se
  cambia la URL del servidor).
- **`data/repository/TramaRepository.kt`** — envuelve cada llamada,
  atrapa errores de conexión y del servidor, y devuelve un resultado
  simple (`ApiResult.Success` / `ApiResult.Error`) para que las pantallas
  nunca tengan que lidiar con excepciones sueltas.
- **`ui/patrones/`** — pantalla de biblioteca (lista + buscador), equivalente
  móvil de la Biblioteca del frontend web.
- **`ui/telar/`** — pantalla de monitoreo y control de un telar (estado,
  patrón asignado, posición actual, botones avanzar/retroceder/detener).
- **`ui/historial/`** — pantalla de historial de producción del telar
  (nótese que esta pantalla existe en la app antes que en la web: el
  endpoint del backend ya estaba listo, solo faltaba una interfaz).
- **`ui/theme/Theme.kt`** — la misma paleta de colores que `styles.css` en
  la web (rosa/vino `#7C2155` + su modo oscuro), para que la app se sienta
  parte del mismo producto.
- **`MainActivity.kt`** — punto de entrada, con barra de navegación
  inferior entre las tres secciones (Biblioteca / Telar / Historial).

---

## 4. Qué falta para que sea una app completa (a propósito, no es un bug)

Esto es una **base**, no la app terminada — lo que sigue es trabajo de UI,
no de arquitectura (la arquitectura ya soporta todo esto sin cambios):

- **Editor visual de patrones** (tocar cada celda de la grilla, como en la
  web). Es la pieza más grande que falta: se puede resolver con un
  `Canvas` de Compose, dibujando la grilla a mano y detectando toques por
  coordenada. La API para guardar (`crearPatron` / `actualizarPatron`) ya
  está lista y probada.
- **Selector de telar** — hoy no hace falta (un solo telar), pero
  `listarTelares()` ya trae la lista completa apenas haya más de uno.
- **Actualización en tiempo real** — hoy la pantalla de telar se refresca
  después de cada botón que tocás. Cuando el ESP32 esté conectado y
  reportando solo, conviene cambiar esto por un `WebSocket` o un
  `Timer`/`Flow` que refresque sola cada 1-2 segundos, para que la app
  funcione como un monitor en vivo sin que el operario tenga que tocar
  nada.

---

## 5. Nota sobre el ESP32 (para cuando llegue esa fase)

Nada de este código cambia cuando se conecte el ESP32. El microcontrolador
va a hablarle a la **misma API REST** (`POST /telares/:id/avanzar`, etc.)
que hoy le habla esta app y el navegador — el backend no distingue si el
llamado viene de un celular, una PC o un microcontrolador. Lo único que
cambia en la app, en ese momento, es que la pantalla de control pasa de
"mandar comandos manuales para probar" a "mostrar en vivo lo que el ESP32
ya está reportando solo".
