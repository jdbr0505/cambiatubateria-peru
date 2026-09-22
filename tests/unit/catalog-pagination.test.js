/**
 * Verificación estática del renderizado por lotes del catálogo (evita pintar
 * los ~77 productos de una sola vez, sin DOM real disponible en el entorno
 * de pruebas — ver upload-security.test.js para la misma convención).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codigo = readFileSync('pagbateria/public/assets/js/ui/catalog.js', 'utf8');

describe('Catálogo — renderizado por lotes en vez de pintar todo de una vez', () => {
  test('define un tamaño de lote fijo, no renderiza .map(tarjetaProducto) sobre todo el resultado', () => {
    assert.match(codigo, /const LOTE = \d+;/);
    // El patrón viejo (r.data.map(tarjetaProducto).join('')) pintaba todos
    // los resultados de una sola pasada — no debe quedar ningún rastro.
    assert.doesNotMatch(
      codigo,
      /contenedor\.innerHTML = r\.data\.map\(tarjetaProducto\)/,
      'sigue pintando todos los resultados de una sola vez, sin lotes'
    );
  });

  test('pintarSiguienteLote usa slice() para tomar solo el siguiente tramo', () => {
    assert.match(codigo, /resultadoActual\.slice\(cantidadPintada, cantidadPintada \+ LOTE\)/);
  });

  test('agrega tarjetas nuevas con insertAdjacentHTML, no reemplaza el grid entero', () => {
    // Reemplazar innerHTML en cada "cargar más" perdería la posición de
    // scroll y volvería a animar las tarjetas que el usuario ya vio.
    assert.match(codigo, /contenedor\.insertAdjacentHTML\('beforeend',/);
  });

  test('el botón "cargar más" muestra cuántos productos quedan', () => {
    assert.match(codigo, /quedan \$\{restantes\}/);
  });

  test('el botón desaparece cuando ya no quedan productos por pintar', () => {
    assert.match(codigo, /if \(restantes <= 0\) \{\s*existente\?\.remove\(\);/);
  });

  test('revealOnScroll se acota a las tarjetas nuevas (data-revelado), no repinta las ya visibles', () => {
    // Sin esto, cada "cargar más" pondría opacity:0 de nuevo en TODO el
    // selector, incluidas las tarjetas que el usuario ya está viendo.
    assert.match(codigo, /:not\(\[data-revelado\]\)/);
  });

  test('renderCatalogo reinicia el estado de paginación al cambiar de filtro', () => {
    // Desde que existe el buscador, renderCatalogo guarda el resultado crudo y
    // delega el pintado en aplicarBusqueda(), que es quien reinicia el contador
    // — así cambiar de filtro y escribir en el buscador siguen el mismo camino.
    assert.match(codigo, /resultadoCompleto = r\.data;/);
    assert.match(codigo, /aplicarBusqueda\(\);/);
    const bloqueBusqueda = codigo.slice(codigo.indexOf('function aplicarBusqueda'));
    assert.match(bloqueBusqueda, /cantidadPintada = 0;/);
  });
});

describe('Catálogo — foto de producto (products.php ya la devuelve, faltaba consumirla)', () => {
  test('la tarjeta renderiza <img> solo cuando el producto tiene p.image', () => {
    // El <img> va envuelto en .producto__foto-wrap (el recorte 4/3 + overflow
    // vive ahí, no en el <img> — ver sections.css) pero sigue condicionado a
    // p.image igual que antes.
    assert.match(codigo, /const foto = p\.image\s*\n?\s*\?\s*`<div class="producto__foto-wrap"><img[^`]*class="producto__foto"/);
  });

  test('el src de la imagen pasa por esc() — viene de datos editables desde el panel admin', () => {
    assert.match(codigo, /<img src="\$\{esc\(p\.image\)\}"/);
  });

  test('la imagen declara loading="lazy" y width/height (evita CLS)', () => {
    const bloque = codigo.match(/const foto = p\.image[\s\S]*?: '';/)?.[0] ?? '';
    assert.match(bloque, /loading="lazy"/);
    assert.match(bloque, /width="\d+" height="\d+"/);
  });

  test('sin imagen, la tarjeta no deja un <img> vacío o roto', () => {
    const bloque = codigo.match(/const foto = p\.image[\s\S]*?: '';/)?.[0] ?? '';
    assert.match(bloque, /:\s*''\s*;\s*$/);
  });
});

describe('catalog-api.js — Producto documenta el campo image', () => {
  test('el typedef incluye @property image', () => {
    const api = readFileSync('pagbateria/public/assets/js/lib/catalog-api.js', 'utf8');
    assert.match(api, /@property \{string\|null\} \[image\]/);
  });
});
