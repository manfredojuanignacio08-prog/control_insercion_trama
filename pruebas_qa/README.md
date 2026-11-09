# Pruebas de calidad (QA)

Herramientas para revisar el código sin tocarlo. Están en esta carpeta, aparte de `backend/`,
para que no cambien lo que se instala en Render (allí solo se usa `backend/`).

| Comando | Qué revisa |
|---|---|
| `npm run lint` | ESLint del servidor (`backend/src`), sus pruebas (`backend/tests`) y el JavaScript de la página (`backend/public/index.html`). Configuración: `eslint.config.js`. |
| `npm run html` | html-validate de la página, con el conjunto de reglas `html-validate:standard` (`.htmlvalidate.json`). |
| `npm run celular` | Playwright: abre la página real en un Chromium con tamaño de celular (Pixel 7), sin servidor ni base de datos (las rutas `/api` se contestan dentro de la prueba). Revisa la pantalla de ingreso con sus dos pestañas y el modo invitado con Inicio, Editor y Biblioteca: que se vean, que no haya desplazamiento horizontal y que la página no tire errores. |
| `npm run todo` | Los tres, uno tras otro. |

## Cómo correrlas

```bash
cd pruebas_qa
npm install
npx playwright install chromium   # solo la primera vez, para la prueba en el celular
npm run todo
```

Las pruebas del servidor siguen en `backend/` (`npm test` y la integración contra PostgreSQL,
`backend/tests/integracion.pg.mjs`), y las del firmware en `esp32/verificacion/`.
