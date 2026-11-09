// Playwright: la página real (backend/public/index.html) en un navegador Chromium con tamaño de
// celular. No hace falta levantar el servidor ni la base: la prueba sirve los archivos de
// backend/public y contesta las rutas /api con respuestas fijas (ver tests/celular.spec.js).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    // Si Chromium ya está instalado en otra carpeta (por ejemplo, en un entorno de pruebas),
    // se puede indicar con CHROMIUM_PATH; si no, usa el de "npx playwright install chromium".
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
