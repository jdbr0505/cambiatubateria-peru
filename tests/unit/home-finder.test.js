/**
 * Buscador horizontal por vehículo en la landing — pedido explícito del
 * jefe: "colocar los filtros en formato horizontal dentro de la página
 * principal así como en la sección del catálogo... si colocas esa
 * funcionalidad quites el botón de 'Ver todo el catálogo'".
 *
 * Reutiliza el mismo cableado en cascada (Marca→Modelo→Año) que ya existía
 * en catalogo.html, en vez de duplicar esa lógica — ver initBuscadorVehiculo
 * en catalog.js.
 *
 * Sin DOM real en este entorno — se lee el código fuente, misma convención
 * que el resto de la suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('catalog.js — initBuscadorVehiculo es reutilizable, no exclusivo del catálogo', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/catalog.js');

  test('exporta initBuscadorVehiculo con un callback de qué hacer al enviar', () => {
    assert.match(codigo, /export async function initBuscadorVehiculo\(form, alEnviar\)/);
  });

  test('initBuscadorCascada (catálogo) filtra en sitio y sube a la rejilla — no navega', () => {
    const inicio = codigo.indexOf('async function initBuscadorCascada()');
    const fin = codigo.indexOf('\n}', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /initBuscadorVehiculo\(form, \(seleccion\) => \{/);
    assert.match(bloque, /renderCatalogo\(seleccion\)/);
    assert.match(bloque, /scrollIntoView/);
    assert.doesNotMatch(bloque, /location\.href/);
  });

  test('renderCatalogo acepta un contenedor destino — reutilizable fuera del grid del catálogo', () => {
    assert.match(
      codigo,
      /export async function renderCatalogo\(filtros = \{\}, contenedorDestino = '\[data-testid="catalogo-grid"\]'\)/
    );
    assert.match(codigo, /contenedorSelector = contenedorDestino;/);
  });

  test('aplicarBusqueda/pintarSiguienteLote/actualizarBotonCargarMas leen el contenedor compartido, no el testid a mano', () => {
    for (const fn of ['function aplicarBusqueda()', 'function pintarSiguienteLote()', 'function actualizarBotonCargarMas()']) {
      const inicio = codigo.indexOf(fn);
      assert.notEqual(inicio, -1, `no se encontró ${fn}`);
      const fin = codigo.indexOf('\n}', inicio);
      const bloque = codigo.slice(inicio, fin);
      assert.match(bloque, /document\.querySelector\(contenedorSelector\)/, `${fn} debe leer contenedorSelector`);
      assert.doesNotMatch(bloque, /data-testid="catalogo-grid"/, `${fn} no debe tener el testid pegado a mano`);
    }
  });

  test('initCatalogo lee make/model/year de la URL, además de marca (batería) por separado', () => {
    const inicio = codigo.indexOf('export function initCatalogo()');
    const bloque = codigo.slice(inicio);
    assert.match(bloque, /params\.get\('marca'\)/);
    assert.match(bloque, /params\.get\('make'\)/);
    assert.match(bloque, /params\.get\('model'\)/);
    assert.match(bloque, /params\.get\('year'\)/);
  });
});

describe('home-finder.js — busca en su propia sección, no navega a otra página', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/home-finder.js');

  test('no hace nada en catalogo.html — esa página ya tiene su propio buscador', () => {
    assert.match(codigo, /if \(document\.querySelector\('\[data-testid="catalogo-grid"\]'\)\) return;/);
  });

  test('reutiliza initBuscadorVehiculo Y renderCatalogo de catalog.js, no reimplementa nada', () => {
    assert.match(codigo, /import \{ initBuscadorVehiculo, renderCatalogo \} from '\.\/catalog\.js';/);
  });

  test('al enviar, pinta los resultados en la vitrina de "Nuestro catálogo" — nunca navega', () => {
    assert.match(codigo, /renderCatalogo\(seleccion, DESTINO\)/);
    assert.match(codigo, /DESTINO = '\[data-testid="catalogo-preview"\]'/);
    assert.match(codigo, /scrollIntoView/);
    assert.doesNotMatch(codigo, /location\.href/);
  });
});

describe('main.js arranca initHomeFinder', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama initHomeFinder', () => {
    assert.match(codigo, /import \{ initHomeFinder \} from '\.\/ui\/home-finder\.js';/);
    assert.match(codigo, /initHomeFinder\(\);/);
  });
});

describe('index.html — buscador horizontal en la sección de catálogo destacado', () => {
  const html = leer('pagbateria/public/index.html');

  test('tiene el mismo formulario y testids que catalogo.html (Marca/Modelo/Año/Enviar)', () => {
    const inicio = html.indexOf('data-testid="section-catalogo-preview"');
    const fin = html.indexOf('</section>', inicio);
    const bloque = html.slice(inicio, fin);
    assert.match(bloque, /data-testid="finder-form"/);
    assert.match(bloque, /data-testid="finder-marca"/);
    assert.match(bloque, /data-testid="finder-modelo"/);
    assert.match(bloque, /data-testid="finder-anio"/);
    assert.match(bloque, /data-testid="finder-submit"/);
  });

  test('el modelo y el año arrancan disabled — se habilitan en cascada', () => {
    const inicio = html.indexOf('data-testid="finder-form"');
    const fin = html.indexOf('</form>', inicio);
    const bloque = html.slice(inicio, fin);
    assert.match(bloque, /data-testid="finder-modelo" disabled/);
    assert.match(bloque, /data-testid="finder-anio" disabled/);
  });

  test('ya no tiene el botón "Ver todo el catálogo" — el buscador lo reemplaza', () => {
    assert.doesNotMatch(html, /data-testid="catalogo-preview-ver-todo"/);
  });
});

describe('CSS — .finder es horizontal desde tablet, apilado en móvil', () => {
  const css = leer('pagbateria/public/assets/css/v2/sections.css');

  test('en móvil (base) es una sola columna', () => {
    const bloque = css.match(/\.finder \{[\s\S]*?\}/)?.[0] ?? '';
    assert.match(bloque, /grid-template-columns:\s*1fr/);
  });

  test('desde 768px, 3 campos a partes iguales + el botón a su ancho', () => {
    assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.finder\s*\{\s*[\s\S]*?grid-template-columns:\s*repeat\(3, 1fr\) auto;/);
  });

  test('el catálogo lo acota (convive con la barra de búsqueda); la landing usa el ancho completo', () => {
    assert.match(css, /\.finder--catalogo\s*\{[\s\S]*?max-width:\s*56rem;/);
    assert.match(css, /\.finder--landing\s*\{/);
  });
});
