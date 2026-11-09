// ESLint del servidor (backend/src), sus pruebas (backend/tests) y el JavaScript de la página
// (los dos <script> de backend/public/index.html). Se corre desde esta carpeta con npm run lint,
// que llama a ESLint desde la raíz del repositorio con este archivo como configuración.
//
// Parte de las reglas recomendadas de ESLint, con estos ajustes a cómo está escrito el proyecto:
// - Los argumentos sin usar no se marcan: Express necesita los cuatro (err, req, res, next) para
//   reconocer el manejador de errores, aunque no use next.
// - Las expresiones regulares con \x00-\x1f son a propósito: sacan los caracteres de control de
//   lo que escribe el usuario antes de guardarlo.
// - Un catch vacío está permitido (se usa al borrar algo que puede no existir).
// - En la página, el primer <script> llama a funciones que declara el segundo (los dos comparten
//   el ámbito global del navegador, y las llamadas ocurren después de que cargan los dos); esas
//   funciones se declaran abajo como globales. Las funciones que se llaman desde onclick="..."
//   del HTML ESLint no las ve, por eso en la página no se marcan las variables sin usar.
import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

const comunes = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-control-regex': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-redeclare': ['error', { builtinGlobals: false }],
};

export default [
  {
    files: ['backend/src/**/*.js', 'backend/tests/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, ...comunes },
  },
  {
    files: ['backend/public/**/*.html'],
    plugins: { html },
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        jspdf: 'readonly',
        SimpleWebAuthnBrowser: 'readonly',
        // declaradas en el segundo <script> y usadas en el primero
        toast: 'readonly', showConfirm: 'readonly', goTo: 'readonly', iniciarApp: 'readonly',
        elegirIngreso: 'readonly', actualizarEstadoTelar: 'readonly',
        isPlaying: 'writable', seguidor: 'writable', generacionPlay: 'writable',
        playTimer: 'writable', telarStatusTimer: 'writable',
      },
    },
    rules: { ...js.configs.recommended.rules, ...comunes, 'no-unused-vars': 'off' },
  },
];
