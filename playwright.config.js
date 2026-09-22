// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Configuración de Playwright.
 *
 * `tests/e2e/api-auth.spec.js` sólo usa el fixture `request` (peticiones HTTP
 * reales contra los endpoints .php), no abre navegador. Por eso no se declara
 * ningún `project` con browserName: instalar los binarios de Chromium no hace
 * falta para esta suite.
 *
 * El servidor: PHP no viene con el proyecto ni con el hosting local. Se levanta
 * con `webServer` sólo si hay un binario `php` en el PATH. La ruta del router
 * se pasa por PW_PHP_ROUTER cuando se quiere que las URLs locales coincidan con
 * las de producción (`/catalogo.html` en vez de `/pagbateria/public/...`); sin
 * él, el servidor sirve el árbol de archivos tal cual, que es todo lo que esta
 * suite necesita.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://127.0.0.1:8000',
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: process.env.PW_PHP_ROUTER
          ? `php -S 127.0.0.1:8000 -t . ${process.env.PW_PHP_ROUTER}`
          : 'php -S 127.0.0.1:8000 -t .',
        url: 'http://127.0.0.1:8000/pagbateria/backend/api/products.php',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
