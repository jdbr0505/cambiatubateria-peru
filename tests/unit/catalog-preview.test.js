/**
 * Verificación estática del apartado de baterías destacadas en la landing
 * (sin DOM real en el entorno de pruebas — misma convención que
 * catalog-pagination.test.js).
 *
 * Antes de esto, la página de inicio no mostraba ni una sola batería: solo el
 * buscador. Estas pruebas fijan que el showcase exista, reutilice la tarjeta
 * real del catálogo (DRY) y degrade sin dejar un hueco si la API no responde.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulo = readFileSync('pagbateria/public/assets/js/ui/catalog-preview.js', 'utf8');
const catalogo = readFileSync('pagbateria/public/assets/js/ui/catalog.js', 'utf8');
const main = readFileSync('pagbateria/public/assets/js/main.js', 'utf8');
const index = readFileSync('pagbateria/public/index.html', 'utf8');

describe('catalog-preview.js — showcase de baterías en la landing', () => {
  test('reutiliza tarjetaProducto del catálogo en vez de duplicar el markup', () => {
    assert.match(modulo, /import \{ tarjetaProducto \} from '\.\/catalog\.js'/);
    // Y catalog.js debe exportarla, no dejarla privada.
    assert.match(catalogo, /export function tarjetaProducto/);
  });

  test('solo muestra productos con foto (una vitrina vive de la imagen)', () => {
    assert.match(modulo, /\.filter\(\(p\) => p\.image\)/);
  });

  test('reparte por marca para no mostrar 8 baterías de la misma', () => {
    assert.match(modulo, /porMarca/);
    assert.match(modulo, /const DESTACADAS = \d+;/);
  });

  test('si la API falla, oculta la sección entera en vez de dejar un error en la home', () => {
    assert.match(modulo, /\.closest\('section'\)/);
    assert.match(modulo, /\.hidden = true/);
  });
});

describe('main.js — el showcase arranca en la landing', () => {
  test('importa e invoca initCatalogoPreview', () => {
    assert.match(main, /import \{ initCatalogoPreview \} from '\.\/ui\/catalog-preview\.js'/);
    assert.match(main, /initCatalogoPreview\(\)/);
  });
});

describe('index.html — la sección existe y lleva al catálogo completo', () => {
  test('tiene el contenedor del showcase', () => {
    assert.match(index, /data-testid="catalogo-preview"/);
    assert.match(index, /data-testid="section-catalogo-preview"/);
  });

  test('el botón "ver todo" se quitó — el buscador horizontal lo reemplaza, la nav sigue llevando a catalogo.html', () => {
    assert.doesNotMatch(index, /data-testid="catalogo-preview-ver-todo"/);
    assert.match(index, /href="catalogo\.html"/);
  });
});
