/**
 * La cuchilla ámbar del hero/franja también remata las cabeceras de TODAS
 * las páginas internas, para que el sello de marca sea consistente en todo
 * el sitio y ningún rótulo oscuro se lea como un rectángulo plano.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

const CON_CUCHILLA = [
  'servicios', 'catalogo', 'cobertura', 'contacto', 'nosotros',
  'aviso-legal', 'cookies', 'privacidad',
];

describe('Cuchilla ámbar en las cabeceras internas', () => {
  for (const pagina of CON_CUCHILLA) {
    test(`${pagina}.html: la cabecera lleva hero--blade`, () => {
      const html = leer(`pagbateria/public/${pagina}.html`);
      assert.match(html, /<header class="hero[^"]*\bhero--blade\b[^"]*"[^>]*data-testid="page-header"/);
    });
  }
});

describe('El CSS de la cuchilla reusa el mismo ámbar del hero, detrás del texto', () => {
  const css = leer('pagbateria/public/assets/css/v2/components.css');

  test('la hoja ámbar se dibuja con clip-path y el gradiente energy', () => {
    const regla = css.match(/\.hero--blade::before\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(regla, /clip-path:\s*polygon/);
    assert.match(regla, /var\(--energy-400\)/);
  });

  test('el contenido queda por encima de la cuchilla', () => {
    assert.match(css, /\.hero--blade \.hero__inner\s*\{[^}]*z-index:\s*1/);
  });
});
