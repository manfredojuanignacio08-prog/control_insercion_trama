# Control de Inserción de Trama, Proyecto completo

Sistema para **digitalizar y controlar los patrones de tejido de un telar
industrial**. El operario diseña y controla la producción desde una **página
web pensada para el celular**; un **backend** guarda y coordina todo en una
**base de datos**; y un **microcontrolador ESP32** conecta ese sistema con el
**telar físico**.


## Estructura del repositorio

```
backend/          El servidor y la aplicación web
  public/         La aplicación que ve el operario
  src/            Rutas, controladores y utilidades
  src/nivel2/     Endpoints del Nivel 2 (en desarrollo, sin montar)
esp32/            El firmware
  control_trama_esp32/   Nivel 1: el que hoy corre en la máquina
  nivel2/                Nivel 2: en desarrollo, proyecto separado
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
```

## Las piezas del producto

```
┌────────────────┐    ┌───────────────────────┐    ┌───────────────────┐
│  Página web    │──▶ │  Backend Node/Express │ ◀─▶│ Base de datos     │
│  (en el celu, │    │  (API REST + sirve    │    │ PostgreSQL /      │
│   interfaz de  │    │   la web + reglas de  │    │ Neon (nube)   │
│   uso real)    │    │   negocio)            │    │                   │
└────────────────┘    └───────────┬───────────┘    └───────────────────┘
                                  │  (la misma API REST)
                                  ▼
                       ┌─────────────────────┐        ┌──────────────────┐
                       │  Firmware ESP32     │ ─────▶ │  Telar físico    │
                       │  (gateway por relés)│        │  (botones        │
                       └─────────────────────┘        │   Marcha/Pausa)  │
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
   los botones de Marcha/Pausa del telar.

**La regla de oro:** los clientes (la web y el ESP32) hablan con el **mismo
backend** por la **misma API**. Nadie toca la base de datos directo.

---

## Estructura del paquete

```
proyecto_completo/
├── backend/                 → Servidor Node.js + Express + PostgreSQL.
│   ├── src/                    La API REST y la lógica de negocio.
│   └── public/                 La PÁGINA WEB (el producto), servida por el backend.
├── esp32/                   → Firmware del microcontrolador (gateway con
│                              relés Marcha/Pausa) + documentación eléctrica.
├── database/                → Script SQL de referencia del esquema.
├── docs/                    → Documentación de análisis, instalación y uso.
├── diagramas/               → Diagrama lógico (arquitectura) y diagrama
│                              físico (conexión eléctrica del ESP32).
└── _referencia_app_android/ → ⚠️ Base de una eventual app Android, guardada
                               SOLO como referencia. NO funcional, NO en uso,
                               NO es parte del producto. Se puede ignorar.
```

---

## Puesta en marcha, en orden

### 1. Backend + web (primero: todo depende de esto)

```bash
cd backend
npm install
cp .env.example .env      # completar DATABASE_URL con la URI de Neon
npm run init-db           # crea las tablas (solo la primera vez)
npm start                 # levanta la API + la web en http://localhost:3000
```

El `.env.example` explica de dónde sacar la connection string de Neon
(Project Settings → Database → Connection string → URI) y por qué `PGSSL`
es necesario con Neon.

Con esto ya tenés **la web funcionando**: abrí `http://localhost:3000` en el
navegador (idealmente el del celular, o el modo responsive del navegador de
escritorio, ya que está pensada para pantalla de teléfono).

### 2. ESP32 (fase de hardware)

El firmware sigue el diseño eléctrico del equipo: tres relés en paralelo con
los botones de Marcha y Pausa del telar. Asignar un patrón desde la web
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
- `backend/src/db/schema.sql` + `migracion_*.sql`, esquema de 4 tablas y
  migraciones idempotentes.
- `public/`, la página web (HTML/CSS/JS + jsPDF), diseñada para el celular,
  con modo claro y oscuro.
- `backend/src/controllers/auth.controller.js` + `backend/src/routes/auth.routes.js` -
  login biométrico (huella/rostro) con WebAuthn. Ver
  `AUTENTICACION_BIOMETRICA.md`.
- `Dockerfile`, `docker-compose.yml`, `ecosystem.config.cjs`, despliegue.

### `esp32/`
- `esp32/control_trama_esp32/control_trama_esp32.ino`, firmware gateway: sondeo
  del estado del telar, pulsos de relé Marcha/Pausa, arranque seguro,
  watchdog, fail-safe sin red y reporte de errores.
- `esp32/control_trama_esp32/config.h`, configuración (Wi-Fi, URL del backend,
  id del telar, polaridad del relé).
- `RECOMENDACIONES_ELECTRICAS.md`, mejoras de protección eléctrica.
- `diagrama_conexion_electrica.svg` / `.png`, diagrama de las 4 etapas.

### `diagramas/`
- `diagrama_logico_arquitectura.svg` / `.png`, cómo se conectan la web, el
  backend, la base de datos, el ESP32 y el telar.
- `diagrama_conexion_electrica.svg` / `.png`, el cableado físico del ESP32.
- `arbol_problemas_soluciones.svg` / `.png`, el árbol de problemas y
  soluciones del proyecto.

### `database/` y `docs/`
Material de referencia: el script SQL del esquema y los documentos de
análisis, instalación y funcionamiento.

### `_referencia_app_android/`
⚠️ Base de una eventual app Android, guardada solo como referencia para el
futuro. **No es funcional, no está en uso y no es parte del producto.** Ver
el `AVISO.md` dentro de la carpeta. Se puede ignorar por completo.

---

## Estado del proyecto

**Hecho y probado:** backend completo con PostgreSQL/Neon (probado de
punta a punta), página web conectada a la API y diseñada para el celular
(con modo claro/oscuro), login biométrico (huella/rostro) con WebAuthn,
esquema multi-telar, historial y log de errores, firmware ESP32 gateway
(relés Marcha/Pausa) acorde al diseño eléctrico del equipo.

**Siguiente fase:** armar la etapa eléctrica según la documentación (con las
mejoras de `RECOMENDACIONES_ELECTRICAS.md`) y conectar los relés del ESP32 a
la botonera del telar.


## Nivel 2, en desarrollo

El código del Nivel 2 (conteo real de pasadas y selección del dibujo) está en
desarrollo y se mantiene **separado** del que hoy corre en la máquina:

- `esp32/nivel2/`, firmware, con su propio archivo de configuración
- `backend/src/nivel2/`, endpoints y migración de base de datos
- `esp32/verificacion/sim_nivel2_firmware.py`, verificación de la lógica

Ninguna de esas piezas está montada en producción. Cada carpeta tiene su README
con el detalle de lo que falta antes de poder usarla.
