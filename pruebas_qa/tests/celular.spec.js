// La página en tamaño de celular, sin servidor: los archivos salen de backend/public y las
// rutas /api se contestan acá. Revisa que la pantalla de ingreso y el modo invitado se vean
// enteros (sin desplazamiento horizontal) y que la página no tire errores de JavaScript.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/public');
const ORIGEN = 'http://control-trama.prueba';
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

// Respuestas fijas de la API para cada prueba
function preparar(page, api) {
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.route(`${ORIGEN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const r = api(route.request().method(), url.pathname) ?? { status: 404, body: { error: 'no existe' } };
      return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.body ?? r) });
    }
    const archivo = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!archivo.startsWith(PUBLIC) || !fs.existsSync(archivo)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TIPOS[path.extname(archivo)] ?? 'application/octet-stream', body: fs.readFileSync(archivo) });
  });
  // Las tipografías de Google no hacen falta para la prueba
  page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  return errores;
}

async function sinDesplazamientoHorizontal(page) {
  const { ancho, visible } = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: window.innerWidth }));
  expect(ancho).toBeLessThanOrEqual(visible);
}

test('pantalla de ingreso en el celular: pestañas Personal y Clientes', async ({ page }) => {
  const errores = preparar(page, (metodo, ruta) => {
    if (ruta === '/api/auth/sesion') return { autenticado: false };
    if (ruta === '/api/auth/estado-registro') return { requiere_invitacion: false };
    if (ruta === '/api/cliente/tejido') return { status: 401, body: { error: 'Sin acceso' } };
  });
  await page.goto(`${ORIGEN}/`);
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-panel-personal')).toBeVisible();
  await sinDesplazamientoHorizontal(page);

  await page.locator('#tab-cliente').click();
  await expect(page.locator('#login-panel-cliente')).toBeVisible();
  await expect(page.locator('#login-panel-personal')).toBeHidden();
  await sinDesplazamientoHorizontal(page);

  await page.locator('#tab-personal').click();
  await expect(page.locator('#login-panel-personal')).toBeVisible();
  expect(errores).toEqual([]);
});

test('modo invitado en el celular: entra al sistema sin errores', async ({ page }) => {
  const errores = preparar(page, (metodo, ruta) => {
    if (ruta === '/api/auth/sesion') return { autenticado: true, invitado: true };
    if (ruta === '/api/auth/estado-registro') return { requiere_invitacion: false };
    if (metodo === 'GET' && (ruta === '/api/patrones' || ruta === '/api/telares' || ruta === '/api/historial' || ruta === '/api/errores')) return [];
    if (metodo === 'GET') return {};
  });
  await page.goto(`${ORIGEN}/`);
  await expect(page.locator('#login-overlay')).toBeHidden();
  await expect(page.locator('#sc-inicio')).toBeVisible();
  await sinDesplazamientoHorizontal(page);

  // Las tres pantallas de abajo: Inicio, Editor y Biblioteca
  for (const pantalla of ['sc-editor', 'sc-biblioteca', 'sc-inicio']) {
    await page.locator(`.screen.active .nav-btn[onclick*="${pantalla}"]`).click();
    await expect(page.locator(`#${pantalla}`)).toBeVisible();
    await sinDesplazamientoHorizontal(page);
  }
  expect(errores).toEqual([]);
});
