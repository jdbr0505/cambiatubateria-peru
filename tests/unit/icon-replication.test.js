/**
 * Verificación estática de la replicación de íconos SVG (reemplazo de emoji)
 * del rediseño de index.html hacia el resto de páginas.
 *
 * Ya hubo un bug real en esta sesión donde un ícono se copió con un <path>
 * truncado en vez de su definición completa — estas pruebas comparan contra
 * la fuente real (otro archivo del repo ya verificado) en vez de solo
 * contar elementos.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

/** @param {string} html @param {string} anchor texto que precede al <svg> a extraer */
function extraerSvgTrasAncla(html, anchor) {
  const idx = html.indexOf(anchor);
  assert.ok(idx !== -1, `no se encontró el ancla "${anchor}"`);
  const desde = html.slice(idx);
  const match = desde.match(/<svg[^>]*viewBox="0 0 24 24"[^>]*>[\s\S]*?<\/svg>/);
  assert.ok(match, `no se encontró un <svg> después de "${anchor}"`);
  return match[0];
}

describe('Íconos nuevos (call, message-text, sms) — forma correcta', () => {
  const casos = [
    { archivo: 'pagbateria/public/contacto.html', ancla: 'newicons/call', paths: 1 },
    { archivo: 'pagbateria/public/contacto.html', ancla: 'newicons/message-text', paths: 3 },
    { archivo: 'pagbateria/public/contacto.html', ancla: 'newicons/sms', paths: 2 },
  ];

  for (const { archivo, ancla, paths } of casos) {
    test(`${ancla} en ${archivo}: ${paths} <path>, viewBox y stroke correctos`, () => {
      const svg = extraerSvgTrasAncla(leer(archivo), ancla);
      const pathCount = (svg.match(/<path /g) ?? []).length;
      assert.equal(pathCount, paths, `esperaba ${paths} <path>, encontró ${pathCount}`);
      assert.match(svg, /fill="none"/);
      // Cada <path> debe declarar su propio stroke — un <path> sin
      // stroke="currentColor" no hereda color y se pinta invisible/negro.
      const pathsSinStroke = svg.match(/<path(?![^>]*stroke="currentColor")[^>]*\/>/g);
      assert.equal(pathsSinStroke, null, 'hay un <path> sin stroke="currentColor"');
    });
  }
});

describe('.card__icon svg — tamaño declarado', () => {
  test('components.css define .card__icon svg con ancho y alto fijos', () => {
    const css = leer('pagbateria/public/assets/css/v2/components.css');
    assert.match(css, /\.card__icon svg\s*\{[^}]*width:\s*1\.5rem[^}]*height:\s*1\.5rem/s);
  });
});
