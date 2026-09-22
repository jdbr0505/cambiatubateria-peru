/**
 * Verificación estática del consentimiento de cookies y las páginas legales.
 * Sin DOM real en el entorno (misma convención que catalog-preview.test.js).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const leer = (p) => readFileSync(p, 'utf8');

const PAGINAS = [
  'index', 'catalogo', 'servicios', 'cobertura', 'nosotros', 'contacto',
];

describe('Consent Mode — gtag activo, arranca denegado en el HTML', () => {
  for (const p of PAGINAS) {
    test(`${p}.html declara el consentimiento por defecto en 'denied'`, () => {
      const html = leer(`pagbateria/public/${p}.html`);
      assert.match(html, /gtag\('consent', 'default', \{ analytics_storage: 'denied' \}\)/);
    });
  }
});

describe('cookie-consent.js — banner y Consent Mode', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/cookie-consent.js');

  test('recuerda la decisión en localStorage', () => {
    assert.match(codigo, /localStorage\.setItem/);
    assert.match(codigo, /localStorage\.getItem/);
  });

  test('actualiza el consentimiento de Google Ads al aceptar', () => {
    assert.match(codigo, /gtag\('consent', 'update', \{ analytics_storage: estado \}\)/);
  });

  test('envuelve el acceso a localStorage en try/catch (modo privado)', () => {
    assert.match(codigo, /try \{[\s\S]*localStorage[\s\S]*catch/);
  });

  test('main.js arranca el consentimiento', () => {
    const main = leer('pagbateria/public/assets/js/main.js');
    assert.match(main, /import \{ initCookieConsent \}/);
    assert.match(main, /initCookieConsent\(\)/);
  });
});

describe('Páginas legales — existen y enlazan de vuelta', () => {
  const esperadas = ['cookies', 'aviso-legal', 'privacidad'];

  for (const slug of esperadas) {
    test(`${slug}.html existe con su chrome (nav + footer)`, () => {
      const ruta = `pagbateria/public/${slug}.html`;
      assert.ok(existsSync(ruta), `falta ${ruta}`);
      const html = leer(ruta);
      assert.match(html, /class="nav"/, 'debe tener la navegación');
      assert.match(html, /class="footer"/, 'debe tener el pie');
      assert.match(html, /section-legal/, 'debe tener el bloque legal');
      assert.match(html, /assets\/js\/main\.js/, 'debe cargar main.js (banner de cookies)');
    });
  }

  test('el footer de las 6 páginas públicas enlaza a las 3 páginas legales', () => {
    for (const p of PAGINAS) {
      const html = leer(`pagbateria/public/${p}.html`);
      assert.match(html, /href="cookies\.html"/, `${p} no enlaza cookies`);
      assert.match(html, /href="aviso-legal\.html"/, `${p} no enlaza aviso-legal`);
      assert.match(html, /href="privacidad\.html"/, `${p} no enlaza privacidad`);
    }
  });

  test('aviso-legal y privacidad marcan los datos pendientes del negocio', () => {
    for (const slug of ['aviso-legal', 'privacidad']) {
      const html = leer(`pagbateria/public/${slug}.html`);
      assert.match(html, /legal__ph/, `${slug} debe marcar los placeholders de datos reales`);
      assert.match(html, /RUC/, `${slug} debe pedir el RUC`);
    }
  });
});

describe('Footer — redes sociales reales', () => {
  test('las 6 páginas públicas ya NO enlazan Instagram (pedido explícito: "esa no es la página")', () => {
    for (const p of PAGINAS) {
      const html = leer(`pagbateria/public/${p}.html`);
      assert.doesNotMatch(html, /instagram/i, `${p} todavía menciona Instagram`);
      // WhatsApp sigue siendo el único ícono social del pie.
      assert.match(html, /footer__social-link/, `${p} sin fila de redes`);
    }
  });
});
