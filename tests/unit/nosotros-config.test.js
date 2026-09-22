/**
 * Verificación estática de la página Nosotros configurable desde el panel
 * admin. La cita editorial ("Preferimos perder una venta...") y la sección
 * "Cómo trabajamos" (4 tarjetas) se quitaron de nosotros.html por pedido
 * explícito del jefe — redundaban con Servicios y con la franja de
 * confianza del hero. La página real quedó en 2 secciones: portada
 * (H1 + bajada) y "El equipo" (título + bajada, la descripción del
 * negocio), ambas ya editables desde el panel.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('pagbateria/backend/api/nosotros.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/nosotros.php');

  test('bug real corregido: ya NO exige sesión en GET', () => {
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigoReal, /require_auth\s*\(\s*\)/);
  });

  test('lee de pagina_nosotros, no de nosotros/nosotros_bullets/pagina_nosotros_cards', () => {
    assert.match(codigo, /FROM pagina_nosotros\b/);
    assert.doesNotMatch(codigo, /FROM nosotros\b/);
    assert.doesNotMatch(codigo, /FROM nosotros_bullets\b/);
    assert.doesNotMatch(codigo, /FROM pagina_nosotros_cards\b/);
  });

  test('esquema son 4 campos de texto — portada + El equipo, sin trabajo/cita/cards/mision/vision', () => {
    assert.match(codigo, /'heroTitulo'/);
    assert.match(codigo, /'equipoBajada'/);
    assert.doesNotMatch(codigo, /'trabajoTitulo'|'trabajoBajada'|'citaTexto'/);
    assert.doesNotMatch(codigo, /'mision'|'vision'/);
    assert.doesNotMatch(codigo, /NOSOTROS_SLOTS/);
  });
});

describe('pagbateria/backend/data/nosotros.json — respaldo con contenido real', () => {
  test('trae los 4 campos, nada de trabajo/cita/cards/mision/vision', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/nosotros.json'));
    assert.ok(datos.heroTitulo);
    assert.ok(datos.heroBajada);
    assert.ok(datos.equipoTitulo);
    assert.ok(datos.equipoBajada);
    assert.equal(datos.trabajoTitulo, undefined);
    assert.equal(datos.citaTexto, undefined);
    assert.equal(datos.cards, undefined);
    assert.equal(datos.mision, undefined);
    assert.equal(datos.vision, undefined);
  });
});

describe('adminbateria/backend/api/nosotros.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/nosotros.php');

  test('exige sesión, usa db(), auto-crea pagina_nosotros — ya no crea pagina_nosotros_cards', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.match(codigo, /\bdb\(\)/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS pagina_nosotros\b/);
    assert.doesNotMatch(codigo, /CREATE TABLE IF NOT EXISTS pagina_nosotros_cards\b/);
  });

  test('actualización parcial: un campo no enviado conserva el valor anterior', () => {
    const inicio = codigo.indexOf('$valor = function');
    const fin = codigo.indexOf('};', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    assert.match(cuerpo, /if \(!array_key_exists\(\$campoJson, \$body\)\) return \$cur\[\$campoDb\] \?\? null;/);
  });

  test('el jefe pidió texto largo: las bajadas siguen siendo TEXT, no VARCHAR corto', () => {
    assert.match(codigo, /hero_bajada TEXT NULL/);
    assert.match(codigo, /equipo_bajada TEXT NULL/);
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /trabajo_bajada|cita_texto/);
  });

  test('ya no queda columna trabajo/cita en el CREATE TABLE ni en el UPDATE', () => {
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /trabajo_titulo|trabajo_bajada|cita_texto/);
  });
});

describe('pagbateria/public/assets/js/lib/nosotros-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/nosotros-config.js');

  test('solo pisa un rol si su valor es verdadero', () => {
    assert.match(codigo, /if \(valor\) nodo\.textContent = valor;/);
  });

  test('pide sin caché', () => {
    assert.match(codigo, /cache:\s*'no-store'/);
  });

  test('ya no busca tarjetas por data-nosotros-slug — esas 4 tarjetas se quitaron de la página', () => {
    assert.doesNotMatch(codigo, /nosotrosSlug|data-nosotros-slug/);
  });

  test('el mapa de roles ya no incluye trabajo-titulo/trabajo-bajada/cita-texto', () => {
    assert.doesNotMatch(codigo, /'trabajo-titulo'|'trabajo-bajada'|'cita-texto'/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea nosotros-config', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa aplicarNosotros y lo llama en el arranque', () => {
    assert.match(codigo, /import \{ aplicarNosotros \} from '\.\/lib\/nosotros-config\.js'/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero el valor por defecto y luego el editado (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarNosotros\(\)[\s\S]*?\]\)/);
  });
});

describe('pagbateria/public/nosotros.html — la página real marcada', () => {
  const codigo = leer('pagbateria/public/nosotros.html');

  test('las 2 cabeceras (4 roles) están presentes, cada una una sola vez', () => {
    for (const rol of ['hero-titulo', 'hero-bajada', 'equipo-titulo', 'equipo-bajada']) {
      const coincidencias = codigo.match(new RegExp(`data-nosotros-rol="${rol}"`, 'g')) || [];
      assert.equal(coincidencias.length, 1, `${rol} debería aparecer exactamente una vez`);
    }
  });

  test('ya no queda ningún rastro de mision/vision en el HTML real', () => {
    assert.doesNotMatch(codigo, /misi[oó]n|visi[oó]n/i);
  });

  test('la cita editorial y "Cómo trabajamos" se quitaron por completo — redundaban con Servicios', () => {
    assert.doesNotMatch(codigo, /quote-band/);
    assert.doesNotMatch(codigo, /Preferimos perder una venta/);
    assert.doesNotMatch(codigo, /Cómo trabajamos/);
    assert.doesNotMatch(codigo, /data-nosotros-slug/);
    assert.doesNotMatch(codigo, /El equipo de CambiaTuBatería/);
  });

  test('la página pasa directo de "El equipo" al CTA final — solo 2 secciones más el header', () => {
    const secciones = codigo.match(/<section class="section[^"]*"/g) ?? [];
    assert.equal(secciones.length, 2, `hay ${secciones.length} <section>, se esperaban 2 (equipo + cta-final)`);
  });
});

describe('pagbateria/public/assets/css/v2/sections.css — sin CSS huérfano de quote-band', () => {
  test('la regla .quote-band se quitó junto con la sección', () => {
    const css = leer('pagbateria/public/assets/css/v2/sections.css');
    assert.doesNotMatch(css, /\.quote-band/);
  });
});

describe('adminbateria — pestaña Nosotros simplificada a 2 secciones', () => {
  test('index.html ya no tiene los campos de trabajo/cita/cards', () => {
    const codigo = leer('adminbateria/index.html');
    assert.doesNotMatch(codigo, /aboutMisionText|aboutVisionText|btnAddBulletMision|btnAddBulletVision/);
    assert.doesNotMatch(codigo, /aboutTrabajoTitulo|aboutTrabajoBajada|aboutCitaTexto|aboutCardsGrid/);
    assert.match(codigo, /id="aboutHeroTitulo"/);
    assert.match(codigo, /id="aboutEquipoTitulo"/);
  });

  test('admin.js ya no tiene renderAboutCards/collectAboutCards/NOSOTROS_SLOTS', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    assert.doesNotMatch(codigo, /function renderAboutBullets|function collectBullets\(/);
    assert.doesNotMatch(codigo, /renderAboutCards|collectAboutCards|NOSOTROS_SLOTS/);
  });

  test('bindAbout manda solo los 4 campos de portada + El equipo', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    const inicio = codigo.indexOf('function bindAbout()');
    const fin = codigo.indexOf('\n}', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /heroTitulo: val\('#aboutHeroTitulo'\)/);
    assert.match(bloque, /equipoBajada: val\('#aboutEquipoBajada'\)/);
    assert.doesNotMatch(bloque, /citaTexto|trabajoTitulo|collectAboutCards/);
    assert.match(bloque, /jput\('\/nosotros\.php', payload\)/);
  });
});
