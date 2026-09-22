// tests/e2e/api-auth.spec.js
//
// REQUIERE UN SERVIDOR PHP CORRIENDO. Este archivo NO se puede ejecutar en una
// máquina sin PHP: hace peticiones HTTP reales contra los endpoints .php del
// sitio. En la máquina de desarrollo actual no hay PHP instalado (ni en PATH,
// ni XAMPP, ni Laragon), así que estas pruebas quedan listas para correr contra
// el hosting o contra un entorno con PHP:
//
//   php -S localhost:8000 -t .        # desde la raíz del repositorio
//   npx playwright test tests/e2e/api-auth.spec.js --config=playwright.config.js
//
// La verificación que SÍ se puede ejecutar hoy, sin PHP, es el test estático
// tests/unit/endpoint-auth.test.js (`node --test`), que comprueba que todos los
// endpoints con operaciones de escritura incluyen el guardián.

import { test, expect } from '@playwright/test';

const ENDPOINTS_ESCRITURA = [
  { path: '/adminbateria/backend/api/usuarios.php',  method: 'POST' },
  { path: '/adminbateria/backend/api/productos.php', method: 'POST' },
  { path: '/adminbateria/backend/api/marcas.php',    method: 'POST' },
  { path: '/adminbateria/backend/api/upload.php',    method: 'POST' },
];

test.describe('La API rechaza escrituras sin sesión', () => {
  for (const { path, method } of ENDPOINTS_ESCRITURA) {
    test(`${method} ${path} responde 401 sin autenticar`, async ({ request }) => {
      const response = await request.fetch(path, {
        method,
        data: { username: 'atacante', password: 'x' },
        failOnStatusCode: false,
      });
      expect(response.status(), `${path} debe exigir sesión`).toBe(401);
    });
  }
});

// El catálogo público debe seguir respondiendo sin sesión: si estos GET dejan de
// funcionar el sitio se queda sin productos, que es peor que la vulnerabilidad.
const ENDPOINTS_PUBLICOS_GET = [
  '/pagbateria/backend/api/products.php',
  '/pagbateria/backend/api/brands.php',
  '/pagbateria/backend/api/hero.php',
  '/pagbateria/backend/api/servicios.php',
  '/pagbateria/backend/api/sitio.php',
  '/pagbateria/backend/api/whatsapp.php',
  '/pagbateria/backend/api/nosotros.php',
  '/pagbateria/backend/api/contacto_info.php',
  '/pagbateria/backend/api/especialistas.php',
];

test.describe('El catálogo público sigue abierto en GET', () => {
  for (const path of ENDPOINTS_PUBLICOS_GET) {
    test(`GET ${path} responde 200 sin autenticar`, async ({ request }) => {
      const response = await request.get(path, { failOnStatusCode: false });
      expect(response.status(), `${path} debe seguir siendo público en GET`).toBe(200);
    });
  }
});

test.describe('Las escrituras del sitio público también exigen sesión', () => {
  for (const path of ['/pagbateria/backend/api/products.php', '/pagbateria/backend/api/brands.php']) {
    test(`POST ${path} responde 401 sin autenticar`, async ({ request }) => {
      const response = await request.post(path, {
        data: { name: 'inyectado' },
        failOnStatusCode: false,
      });
      expect(response.status(), `${path} debe exigir sesión para escribir`).toBe(401);
    });
  }
});

// El formulario de contacto del sitio público es anónimo por diseño: no debe
// devolver 401. Si alguien le pone el guardián, esta prueba lo detecta.
test('POST /pagbateria/backend/api/contact.php sigue aceptando envíos anónimos', async ({ request }) => {
  const response = await request.post('/pagbateria/backend/api/contact.php', {
    form: { name: 'Prueba', phone: '999999999', message: 'Hola' },
    failOnStatusCode: false,
  });
  expect(response.status(), 'el formulario público de contacto no debe pedir sesión').not.toBe(401);
});
