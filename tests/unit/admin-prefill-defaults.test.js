/**
 * En producción, las tablas del panel (pagina_hero, pagina_fotos,
 * pagina_nosotros) arrancan vacías: nadie ha guardado nada aún. Antes los
 * GET del admin leían SOLO la tabla, así que el panel salía en blanco aunque
 * el sitio público mostrara contenido (este usa el respaldo JSON, el admin
 * no lo hacía). Ahora los GET del admin pre-rellenan con los mismos JSON por
 * defecto — verificación estática de que ese respaldo está en su lugar.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('adminbateria/backend/api/hero.php — pre-rellena con hero.json', () => {
  const codigo = leer('adminbateria/backend/api/hero.php');

  test('cuando no hay fila, lee data/hero.json', () => {
    assert.match(codigo, /if \(!\$fila\)/);
    assert.match(codigo, /data\/hero\.json/);
  });

  test('devuelve la forma que espera el frontend (badge, titulo, bajada)', () => {
    assert.match(codigo, /'badge'\s*=>/);
    assert.match(codigo, /'titulo'\s*=>/);
    assert.match(codigo, /'bajada'\s*=>/);
  });
});

describe('adminbateria/backend/api/pagina_fotos.php — superpone pagina_fotos.json', () => {
  const codigo = leer('adminbateria/backend/api/pagina_fotos.php');

  test('la base son los defaults del JSON y encima van las filas de la BD', () => {
    assert.match(codigo, /data\/pagina_fotos\.json/);
    // El JSON se lee ANTES del SELECT, para que la BD lo pueda pisar.
    assert.ok(
      codigo.indexOf('pagina_fotos.json') < codigo.indexOf("SELECT slug, path, alt FROM pagina_fotos"),
      'el respaldo JSON debe leerse antes de las filas de la BD'
    );
  });
});

describe('adminbateria/backend/api/servicios.php — superpone services.json', () => {
  const codigo = leer('adminbateria/backend/api/servicios.php');

  test('la base son los defaults del JSON y encima van las filas de la BD', () => {
    assert.match(codigo, /data\/services\.json/);
    assert.ok(
      codigo.indexOf('services.json') < codigo.indexOf('SELECT slug, titulo, descripcion FROM pagina_servicios'),
      'el respaldo JSON debe leerse antes de las filas de la BD'
    );
  });
});

describe('adminbateria/backend/api/nosotros.php — superpone nosotros.json', () => {
  const codigo = leer('adminbateria/backend/api/nosotros.php');

  test('carga los defaults de data/nosotros.json', () => {
    assert.match(codigo, /function nosotros_defaults/);
    assert.match(codigo, /data\/nosotros\.json/);
  });

  test('cada campo cae al default solo si la BD no lo tiene (?? por campo)', () => {
    assert.match(codigo, /\$row\['hero_titulo'\]\s*\?\?\s*\$def\['heroTitulo'\]/);
    assert.match(codigo, /\$row\['equipo_bajada'\]\s*\?\?\s*\$def\['equipoBajada'\]/);
  });
});
