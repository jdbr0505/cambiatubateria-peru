/**
 * El panel admin ("Marcas") maneja nombre, logo y orden de las marcas en la
 * tabla `marcas`, pero la tira de logos del hero (`.logos-strip` en
 * index.html) era una lista fija: reordenar en el admin no cambiaba nada en
 * la página real. Esta verificación estática cubre la reconexión.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('pagbateria/backend/api/brands.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/brands.php');

  test('GET no exige sesión (require_write_access solo cierra escritura)', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigo, /require_auth\s*\(\s*\)/);
  });

  test('ordena por orden y trae logo_path, con respaldo a JSON si la BD falla', () => {
    assert.match(codigo, /ORDER BY orden, nombre/);
    assert.match(codigo, /logo_path/);
    assert.match(codigo, /db_available\(\)/);
  });

  test('si falta la columna orden, degrada sin 500 (reintenta sin orden), no hace DDL', () => {
    assert.match(codigo, /catch \(Throwable \$e\)/);
    assert.match(codigo, /SELECT nombre, logo_path, 0 AS orden FROM marcas ORDER BY nombre/);
    assert.doesNotMatch(codigo, /ALTER TABLE/);
  });
});

describe('adminbateria/backend/api/marcas.php — asegura la columna orden', () => {
  const codigo = leer('adminbateria/backend/api/marcas.php');

  test('crea la columna orden si falta (consulta information_schema, luego ALTER)', () => {
    assert.match(codigo, /function ensure_orden_column/);
    assert.match(codigo, /information_schema\.columns/);
    assert.match(codigo, /ALTER TABLE marcas ADD COLUMN orden INT DEFAULT 0/);
    assert.match(codigo, /ensure_orden_column\(\$pdo\)/);
  });
});

describe('pagbateria/public/assets/js/lib/marcas-lista-config.js — módulo nuevo', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/marcas-lista-config.js');

  test('pide sin caché', () => {
    assert.match(codigo, /cache:\s*'no-store'/);
  });

  test('busca la lista por data-testid="marcas-list", no por clase', () => {
    assert.match(codigo, /\[data-testid="marcas-list"\]/);
  });

  test('solo reemplaza la lista si hay al menos una marca con logo', () => {
    assert.match(codigo, /conLogo\.length === 0\) return;/);
    assert.match(codigo, /filter\(\(it\) => it\.name && it\.logoPath\)/);
  });

  test('normaliza backslash de Windows en logo_path, igual que catalog-api.js', () => {
    assert.match(codigo, /replace\(\/\\\\\/g, '\/'\)/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea marcas-lista-config', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa aplicarMarcasLista y lo llama en el arranque', () => {
    assert.match(codigo, /import \{ aplicarMarcasLista \} from '\.\/lib\/marcas-lista-config\.js'/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero el valor por defecto y luego el editado (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarMarcasLista\(\)[\s\S]*?\]\)/);
  });

  test('ya no queda el comentario viejo de "tira de marcas es HTML fijo"', () => {
    assert.doesNotMatch(codigo, /La tira de marcas ahora es HTML fijo/);
  });
});

describe('pagbateria/public/index.html — la fila fija sigue siendo el respaldo', () => {
  const codigo = leer('pagbateria/public/index.html');

  test('el <ul> de marcas conserva data-testid="marcas-list" para que el módulo lo encuentre', () => {
    assert.match(codigo, /<ul class="logos-strip" data-testid="marcas-list">/);
  });

  test('siguen las 8 marcas escritas como respaldo (nada se borró del HTML)', () => {
    const coincidencias = codigo.match(/class="logos-strip__item"/g) || [];
    assert.equal(coincidencias.length, 8);
  });
});

describe('adminbateria/assets/js/admin.js — guardar orden manda PUT con order[]', () => {
  const codigo = leer('adminbateria/assets/js/admin.js');

  test('btnSaveBrandOrder manda { order: [{ name, order }] } por PUT a /marcas.php', () => {
    const inicio = codigo.indexOf("qs('#btnSaveBrandOrder')");
    const fin = codigo.indexOf('\n  }', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /order: rows\.map\(\(r, i\) => \(\{ name: r\.nombre, order: i \}\)\)/);
    assert.match(bloque, /jput\('\/marcas\.php', body\)/);
  });
});
