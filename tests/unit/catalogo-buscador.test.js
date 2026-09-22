/**
 * Verificación estática del buscador de productos del catálogo
 * (sin DOM en el entorno de pruebas — misma convención que el resto).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codigo = readFileSync('pagbateria/public/assets/js/ui/catalog.js', 'utf8');
const html = readFileSync('pagbateria/public/catalogo.html', 'utf8');

describe('catalogo.html — el buscador está en la página', () => {
  test('tiene el campo de búsqueda con etiqueta accesible', () => {
    assert.match(html, /data-testid="buscador-input"/);
    assert.match(html, /<label class="visually-hidden" for="buscador-input">/);
  });

  test('tiene botón de limpiar', () => {
    assert.match(html, /data-testid="buscador-limpiar"/);
  });

  test('ya no muestra el conteo "N baterías": flotaba suelto sobre la foto del buscador', () => {
    assert.doesNotMatch(html, /data-testid="buscador-conteo"/);
    assert.doesNotMatch(codigo, /function actualizarConteo/);
  });
});

describe('catalog.js — filtra en memoria, sin volver a pedir a la API', () => {
  test('guarda el resultado completo aparte del filtrado', () => {
    assert.match(codigo, /let resultadoCompleto/);
    assert.match(codigo, /resultadoCompleto = r\.data/);
  });

  test('filtra por nombre y por marca', () => {
    assert.match(codigo, /resultadoCompleto\.filter\(\(p\) => normalizar\(`\$\{p\.name\} \$\{p\.brand\}`\)\.includes\(termino\)\)/);
  });

  test('ignora tildes y mayúsculas al comparar', () => {
    // Sin esto, "bateria etna" no encuentra "Batería Etna".
    assert.match(codigo, /\.toLowerCase\(\)/);
    assert.match(codigo, /\.normalize\('NFD'\)/);
    assert.match(codigo, /0x300/);
    assert.match(codigo, /0x36f/);
  });

  test('no dispara una petición nueva por cada tecla', () => {
    const bloque = codigo.slice(codigo.indexOf('function aplicarBusqueda'), codigo.indexOf('function actualizarUrlBusqueda'));
    assert.doesNotMatch(bloque, /fetchProductos|await pedir/, 'el buscador debe filtrar lo ya cargado');
  });

  test('el buscador arranca junto al catálogo', () => {
    assert.match(codigo, /initBuscadorProductos\(\);/);
  });

  test('escapa el término al mostrarlo en el estado vacío', () => {
    // El texto lo escribe el usuario: sin escapar, entra por innerHTML.
    assert.match(codigo, /esc\(terminoBusqueda\.trim\(\)\)/);
  });
});
