/**
 * Verificación estática de la estructura de las páginas internas
 * (Servicios/Cobertura/Nosotros/Contacto), tras la ronda de pulido.
 *
 * Sin DOM real en este entorno — se lee el código fuente, misma convención
 * que el resto de la suite (ver upload-security.test.js).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('Cobertura — distritos agrupados por zona, no una lista plana', () => {
  const html = leer('pagbateria/public/cobertura.html');

  test('existe al menos un grupo de zona con su título', () => {
    assert.match(html, /class="districts-zona"/);
    assert.match(html, /class="districts-zona__titulo"/);
  });

  test('el ancla #callao existe de verdad — el pie de página ya la enlazaba', () => {
    // El footer trae <a href="cobertura.html#callao">; sin un id="callao" real
    // en la página, ese enlace no lleva a ningún lado.
    assert.match(html, /<div class="districts-zona" id="callao">/);
  });

  test('los 20 distritos originales siguen todos presentes (agrupar no es perder datos)', () => {
    const distritos = [
      'San Isidro', 'Miraflores', 'Surco', 'La Molina', 'San Borja', 'Barranco',
      'Jesús María', 'Lince', 'Magdalena', 'Pueblo Libre', 'San Miguel', 'Callao',
      'Cercado de Lima', 'La Victoria', 'Surquillo', 'Chorrillos', 'San Luis',
      'Breña', 'Rímac', 'Los Olivos',
    ];
    for (const d of distritos) {
      assert.match(html, new RegExp(`<li>${d}</li>`), `falta "${d}" tras agrupar por zona`);
    }
  });
});

describe('layout.css — cualquier ancla respeta la barra fija al saltar', () => {
  const css = leer('pagbateria/public/assets/css/v2/layout.css');

  test('define scroll-margin-top global para [id]', () => {
    // Sin esto, saltar a #auxilio, #horarios, #callao... deja el título
    // tapado a medias detrás del nav sticky.
    assert.match(css, /\[id\]\s*\{\s*scroll-margin-top:/);
  });

  test('el margen es mayor en móvil que en escritorio (la barra mide más alto: dos filas)', () => {
    const movil = css.match(/\[id\]\s*\{\s*scroll-margin-top:\s*([\d.]+)rem/)?.[1];
    const bloqueDesktop = css.slice(css.indexOf('min-width: 1200px'));
    const desktop = bloqueDesktop.match(/\[id\]\s*\{\s*scroll-margin-top:\s*([\d.]+)rem/)?.[1];
    assert.ok(movil && desktop, 'no se encontraron ambos valores de scroll-margin-top');
    assert.ok(Number(movil) > Number(desktop), 'el margen móvil debe ser mayor que el de escritorio');
  });
});
