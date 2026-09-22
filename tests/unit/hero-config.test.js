/**
 * Verificación estática del texto del hero configurable desde el panel
 * admin. Reducido a 3 campos (badge, título, bajada): el CTA de GPS
 * (ctaTexto/ctaSubtexto) y el link "Ver todo el catálogo" (catalogoTexto)
 * se quitaron junto con los botones que editaban — ver hero-landing.test.js
 * y home-finder.test.js para esas dos remociones. El título sigue siendo un
 * caso especial: trae <br>+<em> que un valor de texto plano no puede
 * reproducir, por eso solo se pisa cuando el admin guardó uno explícito.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('pagbateria/backend/api/hero.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/hero.php');

  test('bug real corregido: ya NO exige sesión en GET', () => {
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigoReal, /require_auth\s*\(\s*\)/);
  });

  test('lee de pagina_hero (fila única), no del carrusel hero_slides/hero_botones', () => {
    assert.match(codigo, /FROM pagina_hero/);
    assert.doesNotMatch(codigo, /hero_slides|hero_botones/);
  });

  test('esquema son 3 campos de texto, sin "buttons" ni "slides"', () => {
    assert.match(codigo, /'badge'/);
    assert.match(codigo, /'titulo'/);
    assert.match(codigo, /'bajada'/);
    assert.doesNotMatch(codigo, /'buttons'|'slides'/);
  });

  test('ya no trae ctaTexto/ctaSubtexto (GPS) ni catalogoTexto en el código activo — ambos botones se quitaron del home', () => {
    // Solo el código, no el comentario de cabecera que explica qué se quitó.
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /ctaTexto|ctaSubtexto|cta_texto|cta_subtexto/);
    assert.doesNotMatch(codigoReal, /catalogoTexto|catalogo_texto/);
  });
});

describe('pagbateria/backend/data/hero.json — respaldo, titulo en null a propósito', () => {
  test('titulo es null — el HTML trae <br>+<em> que un valor de texto no puede reproducir', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/hero.json'));
    assert.equal(datos.titulo, null);
    assert.ok(datos.badge);
    assert.ok(datos.bajada);
    assert.doesNotMatch(JSON.stringify(datos), /ctaTexto|catalogoTexto/);
  });
});

describe('adminbateria/backend/api/hero.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/hero.php');

  test('exige sesión, usa db(), auto-crea pagina_hero (tabla nueva, no toca hero_slides)', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.match(codigo, /\bdb\(\)/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS pagina_hero/);
    assert.doesNotMatch(codigo, /DELETE FROM hero_/);
  });

  test('upsert de una sola fila (id=1), no reemplazo de lista', () => {
    assert.match(codigo, /ON DUPLICATE KEY UPDATE badge = VALUES\(badge\)/);
  });

  test('actualización parcial: un campo no enviado conserva el valor anterior, no lo borra', () => {
    const inicio = codigo.indexOf('$valor = function');
    const fin = codigo.indexOf('};', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    assert.match(cuerpo, /if \(!array_key_exists\(\$campoJson, \$body\)\) return \$cur\[\$campoDb\] \?\? null;/);
  });

  test('ya no acepta ni guarda ctaTexto/ctaSubtexto/catalogoTexto', () => {
    assert.doesNotMatch(codigo, /ctaTexto|ctaSubtexto|catalogoTexto/);
  });
});

describe('pagbateria/public/assets/js/lib/hero-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/hero-config.js');

  test('solo pisa un rol si su valor es verdadero — nunca vacía badge/título/bajada', () => {
    assert.match(codigo, /if \(valor\) nodo\.textContent = valor;/);
  });

  test('pide sin caché (mismo bug que ya se encontró en los otros 3 módulos)', () => {
    assert.match(codigo, /cache:\s*'no-store'/);
  });

  test('mapea los 3 roles que quedan — ya no cta-texto/cta-subtexto/catalogo-texto (botones removidos)', () => {
    const inicio = codigo.indexOf('const mapa = {');
    const fin = codigo.indexOf('};', inicio);
    const bloque = codigo.slice(inicio, fin);
    for (const rol of ['badge', 'titulo', 'bajada']) {
      assert.match(bloque, new RegExp(rol));
    }
    assert.doesNotMatch(bloque, /cta-texto|cta-subtexto|catalogo-texto/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea hero-config', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa aplicarHero y lo llama en el arranque', () => {
    assert.match(codigo, /import \{ aplicarHero \} from '\.\/lib\/hero-config\.js'/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero el valor por defecto y luego el editado (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarHero\(\)[\s\S]*?\]\)/);
  });
});

describe('pagbateria/public/index.html — 3 roles marcados; GPS y catálogo-texto se quitaron', () => {
  const codigo = leer('pagbateria/public/index.html');

  test('los 3 roles que quedan están presentes, cada uno una sola vez', () => {
    for (const rol of ['badge', 'titulo', 'bajada']) {
      const coincidencias = codigo.match(new RegExp(`data-hero-rol="${rol}"`, 'g')) || [];
      assert.equal(coincidencias.length, 1, `${rol} debería aparecer exactamente una vez`);
    }
    assert.doesNotMatch(codigo, /data-hero-rol="cta-texto"|data-hero-rol="cta-subtexto"|data-hero-rol="catalogo-texto"/);
  });

  test('el botón de GPS ya no existe en ningún lado', () => {
    assert.doesNotMatch(codigo, /data-testid="hero-cta-auxilio"/);
    assert.doesNotMatch(codigo, /gps-cta/);
  });

  test('el botón "Ver todo el catálogo" ya no existe — lo reemplazó el buscador horizontal por vehículo', () => {
    assert.doesNotMatch(codigo, /data-testid="catalogo-preview-ver-todo"/);
    assert.doesNotMatch(codigo, /Ver todo el catálogo/);
  });

  test('el título conserva <br> y <em> en el HTML por defecto — solo se pierde si el admin guarda uno propio', () => {
    const inicio = codigo.indexOf('data-hero-rol="titulo"');
    const fin = codigo.indexOf('</h1>', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /<br>/);
    assert.match(bloque, /<em>[^<]+<\/em>/);
  });
});

describe('adminbateria — pestaña Hero sin editor de carrusel ni campos de GPS', () => {
  test('index.html ya no tiene el editor de slides, el modal huérfano, ni los campos de GPS', () => {
    const codigo = leer('adminbateria/index.html');
    assert.doesNotMatch(codigo, /heroEditGrid|btnAddSlide|modalSlide|smBackground/);
    assert.doesNotMatch(codigo, /id="heroCtaTexto"|id="heroCtaSubtexto"/);
    assert.match(codigo, /id="heroTitulo"/);
  });

  test('admin.js ya no tiene renderHeroEditor/setHeroState/openSlideModal ni la variable HERO', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    assert.doesNotMatch(codigo, /function renderHeroEditor|function setHeroState|function openSlideModal|let HERO\b/);
  });

  test('bindHero manda los 3 campos en un solo PUT, sin depender de slides[] ni de los campos de GPS', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    const inicio = codigo.indexOf('function bindHero()');
    const fin = codigo.indexOf('\n}', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /badge: sval\('#heroBadge'\)/);
    assert.match(bloque, /jput\('\/hero\.php', payload\)/);
    assert.doesNotMatch(bloque, /catalogoTexto|heroCatalogoTexto|ctaTexto|ctaSubtexto/);
  });
});
