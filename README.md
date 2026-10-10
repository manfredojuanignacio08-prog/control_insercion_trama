# Control de Inserción de Trama, Proyecto completo

Sistema para **digitalizar y controlar los patrones de tejido de un telar
industrial**. El operario diseña y controla la producción desde una **página
web pensada para el celular**; un **backend** guarda y coordina todo en una
**base de datos**; y un **microcontrolador ESP32** conecta ese sistema con el
**telar físico**.


> **Antes de instalar en el telar (Vamatex C 201, cuatro bobinas), leer [`PUESTA_EN_MARCHA.md`](PUESTA_EN_MARCHA.md)**: claves del sistema, ajuste de la sincronización, validación del conteo y lista de primera puesta en marcha. Los cambios de la última revisión están en [`CAMBIOS_REVISION.md`](CAMBIOS_REVISION.md).

## Estructura del repositorio

```
backend/          El servidor y la aplicación web
  public/         La aplicación que ve el operario
  src/            Rutas, controladores y utilidades
  src/nivel2/     Endpoints del Nivel 2 (montados; los usa el firmware con el sensor)
esp32/            El firmware
  control_trama_esp32/   El único programa de la placa (un solo ESP32). Con
                         NIVEL2_INSTALADO en false (hoy) maneja la botonera;
                         en true suma el sensor y la selección del dibujo
  pruebas/               Prueba de mesa de un relé LCA110, sin red
  documentacion/         Recomendaciones eléctricas, checklist y niveles
  verificacion/          Scripts que comprueban la lógica sin hardware
diagramas/        Los diagramas del proyecto, en SVG y PNG
  hardware/       Conexionado: placa, canal del sensor, canal del relé
  sistema/        Arquitectura lógica y árbol de problemas
docs/             Documentación de apoyo
  analisis/       Análisis técnico y árbol de problemas
  guias/          Instalación, funcionamiento y base de datos
database/         El esquema completo, para levantar la base desde cero
documentacion_proyecto/   Los documentos de la Carpeta del Proyecto
_referencia_app_android/  ⚠️ Base de una eventual app Android: solo referencia, NO funcional
```

## Las piezas del producto

```
┌────────────────┐    ┌───────────────────────┐    ┌───────────────────┐
│  Página web    │──▶ │  Backend Node/Express │ ◀─▶│ Base de datos     │
│  (en el celu,  │    │  (API REST + sirve    │    │ PostgreSQL /      │
│   interfaz de  │    │   la web + reglas de  │    │ Neon (nube)       │
│   uso real)    │    │   negocio)            │    │                   │
└────────────────┘    └───────────┬───────────┘    └───────────────────┘
                                  │  (la misma API REST)
                                  ▼
                       ┌─────────────────────┐        ┌──────────────────┐
                       │  Firmware ESP32     │ ─────▶ │  Telar físico    │
                       │  (gateway por relés)│        │  (botones Marcha,│
                       └─────────────────────┘        │  Pausa y         │
                                                      │  Retroceder)     │
                                                      └──────────────────┘
```

Cuatro componentes forman el producto:

1. **Página web (interfaz de uso real)**, diseñada mobile-first, para
   abrirse en el navegador del celular. Desde acá se diseñan los patrones
   (editor de cuadrícula), se controla el telar y se consulta la biblioteca.
   La sirve el mismo backend y ya está conectada a la API (no usa
   `localStorage`). Tiene modo claro y oscuro.
2. **Backend (Node.js + Express)**, expone la API REST, sirve la web, aplica
   las reglas de negocio (transacciones, validaciones, bloqueos) y es el
   **único** que habla con la base de datos.
3. **Base de datos (PostgreSQL en Neon)**, donde vive toda la
   información (patrones, telares, historial de producción, errores),
   alojada en la nube.
4. **Firmware ESP32**, el puente con la máquina real: lee del backend si el
   telar debe estar tejiendo y acciona los relés conectados en paralelo a
   los botones de Marcha, Pausa y Retroceder del telar, y le avisa al
   backend cuando alguien los usa a mano en la botonera.

**La regla de oro:** los clientes (la web y el ESP32) hablan con el **mismo
backend** por la **misma API**. Nadie toca la base de datos directo.

---

## Puesta en marcha, en orden

### 1. Backend + web (primero: todo depende de esto)

```bash
cd backend
npm install
cp .env.example .env      # completar DATABASE_URL con la URI de Neon, y PGSSL=true
npm run init-db           # crea las tablas (solo la primera vez)
npm start                 # levanta la API + la web en http://localhost:3000
```

El `.env.example` explica de dónde sacar la connection string de Neon
(Project Settings → Database → Connection string → URI) y por qué conviene `PGSSL=true` y
`?sslmode=verify-full` con Neon.

Con esto ya tenés **la web funcionando**: abrí `http://localhost:3000` en el
navegador (idealmente el del celular, o el modo responsive del navegador de
escritorio, ya que está pensada para pantalla de teléfono).

### 2. ESP32 (fase de hardware)

El firmware sigue el diseño eléctrico del equipo: tres relés en paralelo con
los botones de Marcha, Pausa y Retroceder del telar. Asignar un patrón desde la web
arranca la máquina real; "Pausa" la detiene. Detalle en `esp32/README.md` y
mejoras eléctricas en `esp32/documentacion/RECOMENDACIONES_ELECTRICAS.md`.

---

## Qué hay en cada carpeta (detalle)

### `backend/`
- `backend/src/server.js`, servidor Express: API + sirve la web + seguridad
  (helmet, CORS, rate limiting) + apagado prolijo.
- `backend/src/db.js`, pool de conexiones a PostgreSQL/Neon (driver `pg`).
- `src/controllers/`, lógica de negocio: patrones, telares (con
  transacciones y `FOR UPDATE`), historial y errores.
- `src/routes/`, define las rutas de la API.
- `src/utils/`, lógica pura sin base de datos: derivación de ligamento,
  cálculo de posición de tejido, validaciones.
- `backend/src/db/schema.sql` + `migracion_*.sql`, esquema de 9 tablas y
  migraciones que se aplican una sola vez cada una (el servidor aplica las pendientes al arrancar).
- `public/`, la página web (HTML/CSS/JS + jsPDF), diseñada para el celular,
  con modo claro y oscuro.
- `backend/src/controllers/auth.controller.js` + `backend/src/routes/auth.routes.js` -
  ingreso con huella (WebAuthn), código de recuperación, invitaciones y modo invitado. Ver
  `AUTENTICACION_BIOMETRICA.md`.
- `Dockerfile`, `docker-compose.yml`, `ecosystem.config.cjs`, despliegue.

### `esp32/`
- `esp32/control_trama_esp32/control_trama_esp32.ino`, el único firmware de la placa:
  sondeo del estado del telar, pulsos de relé Marcha/Pausa/Retroceder, sensado de
  la botonera, arranque seguro, watchdog, fail-safe sin red y reporte de errores; con
  `NIVEL2_INSTALADO` en `true`, además el conteo de pasadas y la selección del dibujo.
- `esp32/control_trama_esp32/config.h`, configuración (qué está instalado, Wi-Fi, clave
  del dispositivo, URL del backend, id del telar, polaridad de los relés y parámetros del
  Nivel 2). En el repositorio van textos de ejemplo: los datos reales no se suben.
- `esp32/verificacion/`, simulaciones y pruebas en la PC de la lógica del firmware.
- `esp32/documentacion/`, recomendaciones eléctricas, lista de validación y
  descripción de los niveles de control.

### `diagramas/`
Cada diagrama en SVG (editable) y PNG. El detalle está en `diagramas/README.md`.
- `diagramas/hardware/`, cómo se conecta: el cableado del nodo de control
  (`diagrama_conexion_electrica`), los bloques A y C, un canal del sensor, un
  canal de relé LCA110 y la vista del Nivel 2.
- `diagramas/sistema/`, cómo funciona: la arquitectura (`diagrama_logico_arquitectura`),
  los diagramas de la base de datos, el árbol de problemas y soluciones, el Gantt,
  la estimación y el organigrama.

### `database/` y `docs/`
Material de referencia: el script SQL completo de la base, `docs/guias/`
(instalación y funcionamiento, cómo crear la base) y `docs/analisis/`
(análisis del frontend, árbol de problemas, componentes).

### `_referencia_app_android/`
⚠️ Base de una eventual app Android, guardada solo como referencia para el
futuro. **No es funcional, no está en uso y no es parte del producto.** Ver
el `AVISO.md` dentro de la carpeta. Se puede ignorar por completo.

---

## Estado del proyecto

**Hecho y probado:** backend completo con PostgreSQL/Neon (probado de
punta a punta), página web conectada a la API y diseñada para el celular
(con modo claro/oscuro), ingreso con huella (WebAuthn) y código de recuperación,
esquema multi-telar, historial y log de errores, firmware ESP32 gateway
(relés Marcha/Pausa/Retroceder) acorde al diseño eléctrico del equipo.

**Instalado en el telar:** el Bloque A (relés de Marcha, Pausa y Retroceder y sensado de
la botonera), probado en la máquina el 19/09/2026.

**Siguiente fase:** el Nivel 2 (sensor de pasada y relés LCA110 sobre los lectores
ópticos). El 10/10/2026 se probó todo en protoboard y funcionó; se está haciendo la plaqueta
para probarlo en la máquina. Las mediciones que faltan están en
`esp32/control_trama_esp32/README.md` y `PUESTA_EN_MARCHA.md`.


## Nivel 2, en desarrollo

El conteo real de pasadas y la selección del dibujo están en desarrollo. El gabinete tiene
**un solo ESP32 con un solo programa** (`esp32/control_trama_esp32/`): hoy se carga con
`NIVEL2_INSTALADO` en `false` y solo maneja la botonera; cuando se instalen los Bloques C y D
se pone en `true` y se vuelve a cargar el mismo programa.

- `esp32/control_trama_esp32/`, el firmware (su README explica el Nivel 2)
- `backend/src/nivel2/`, endpoints que usa el firmware con el sensor
- `esp32/verificacion/sim_nivel2_firmware.py`, verificación de la lógica

Cada carpeta tiene su README con el detalle de lo que falta antes de usar el Nivel 2.
