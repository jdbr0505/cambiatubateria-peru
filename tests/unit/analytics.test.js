/**
 * Verificación estática del tracking de conversión (Google Ads / GA4).
 *
 * La cuenta real ya existe (AW-18461995323): el snippet de gtag carga en las
 * 9 páginas públicas con navegación, con Consent Mode denegado por defecto
 * (cookie-consent.js lo pasa a 'granted' solo si el usuario acepta). Estas
 * pruebas verifican que el snippet esté presente con el ID correcto, y que
 * el módulo de eventos siga sin romper nada si gtag no llegó a cargar
 * (bloqueador de anuncios, sin conexión).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS = [
  'pagbateria/public/index.html',
  'pagbateria/public/catalogo.html',
  'pagbateria/public/servicios.html',
  'pagbateria/public/cobertura.html',
  'pagbateria/public/nosotros.html',
  'pagbateria/public/contacto.html',
];

describe('Google Ads (gtag.js) — snippet real cargado con el ID correcto', () => {
  for (const pagina of PAGINAS) {
    test(`${pagina} carga gtag.js con AW-18461995323`, () => {
      const html = leer(pagina);
      assert.match(html, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-18461995323">/);
      assert.match(html, /gtag\('config', 'AW-18461995323'\)/);
    });

    test(`${pagina} arranca Consent Mode en 'denied' antes de cargar gtag.js`, () => {
      const html = leer(pagina);
      const indiceDefault = html.indexOf("gtag('consent', 'default'");
      const indiceScriptGtag = html.indexOf('googletagmanager.com/gtag/js');
      assert.notStrictEqual(indiceDefault, -1, 'falta gtag(\'consent\', \'default\', ...)');
      assert.ok(indiceDefault < indiceScriptGtag, 'el consent default debe declararse antes de cargar gtag.js');
      assert.match(html, /analytics_storage: 'denied'/);
    });
  }
});

describe('analytics.js — no rompe nada si gtag no está disponible', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/analytics.js');

  test('evento() comprueba que window.gtag sea función antes de llamarlo', () => {
    assert.match(codigo, /typeof window\.gtag !== 'function'\) return/);
  });

  test('un solo listener delegado en document cubre teléfono y WhatsApp en toda la página', () => {
    assert.match(codigo, /document\.addEventListener\('click'/);
    assert.match(codigo, /startsWith\('tel:'\)/);
    assert.match(codigo, /includes\('wa\.me'\)/);
  });

  test('exporta initAnalytics', () => {
    assert.match(codigo, /export function initAnalytics/);
  });

  test('ya no exporta trackAuxilioEnviado — el flujo de auxilio se quitó del sitio', () => {
    assert.doesNotMatch(codigo, /trackAuxilioEnviado/);
  });
});

describe('main.js — conecta el tracking en el flujo real', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('llama a initAnalytics() en el arranque', () => {
    assert.match(codigo, /^initAnalytics\(\);$/m);
  });

  test('ya no referencia trackAuxilioEnviado — ese flujo se quitó del sitio público', () => {
    assert.doesNotMatch(codigo, /trackAuxilioEnviado/);
  });
});
