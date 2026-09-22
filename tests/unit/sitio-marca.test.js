/**
 * Verificación estática del nombre de marca + logo configurables desde el
 * panel admin — segunda pieza de reconectar el contenido de texto con el
 * sitio real (la primera fue WhatsApp, ver whatsapp-config.test.js). Mismo
 * patrón: público degrada a JSON, admin exige sesión, el módulo del sitio
 * nunca bloquea ni deja un hueco si la API no contesta.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS_CON_NAV = [
  'pagbateria/public/index.html',
  'pagbateria/public/catalogo.html',
  'pagbateria/public/servicios.html',
  'pagbateria/public/cobertura.html',
  'pagbateria/public/nosotros.html',
  'pagbateria/public/contacto.html',
  'pagbateria/public/cookies.html',
  'pagbateria/public/privacidad.html',
  'pagbateria/public/aviso-legal.html',
];

describe('pagbateria/backend/api/sitio.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/sitio.php');

  test('bug real corregido: ya NO exige sesión en GET (antes daba 401 a cualquier visitante)', () => {
    // El código real (fuera del docblock inicial, que documenta el bug con
    // sus propias palabras) no debe tener el guardián.
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigoReal, /require_auth\s*\(\s*\)/);
  });

  test('usa get_pdo() (nullable) con degradación a JSON, como whatsapp.php', () => {
    assert.match(codigo, /get_pdo\(\)/);
    assert.match(codigo, /data\/site\.json/);
  });

  test('esquema reducido a brandName/logoFile — sin metaTitle/metaDescription/nav/footer', () => {
    assert.doesNotMatch(codigo, /'metaTitle'\s*=>|'metaDescription'\s*=>|'nav'\s*=>|footer_text/);
    assert.match(codigo, /'brandName'/);
    assert.match(codigo, /'logoFile'/);
  });
});

describe('pagbateria/backend/data/site.json — respaldo con datos reales, no la demo de otro rubro', () => {
  test('nombre con tilde correcta y logo real, sin "CambiarTuBateria" (typo) ni meta de la demo', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/site.json'));
    assert.equal(datos.brandName, 'CambiaTuBatería');
    assert.equal(datos.logoFile, '/pagbateria/public/assets/img/icons/nav-logo.png');
    assert.equal(datos.metaTitle, undefined);
    assert.equal(datos.nav, undefined);
  });
});

describe('adminbateria/backend/api/sitio.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/sitio.php');

  test('exige sesión, usa db(), auto-crea su tabla', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.match(codigo, /\bdb\(\)/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS sitio_config/);
  });

  test('sigue propagando coreDiscount a productos — es el único campo de este endpoint que ya era real', () => {
    assert.match(codigo, /UPDATE productos SET core_descuento = \?/);
  });

  test('GET/PUT ya no leen/escriben nav[] ni meta/footer — la tabla conserva esas columnas (sin migración) pero el endpoint no las usa', () => {
    // Las columnas meta_title/meta_description/footer_* siguen en el CREATE
    // TABLE a propósito (evita una migración de baja/riesgo en instalaciones
    // existentes) — lo que importa es que GET/PUT no las lean ni escriban.
    const inicioGet = codigo.indexOf("if (\$method === 'GET')");
    const inicioPut = codigo.indexOf("if (\$method === 'PUT')");
    const finPut = codigo.indexOf("send_json(['error' => 'Método no permitido']");
    const logicaGetPut = codigo.slice(inicioGet, finPut);

    assert.doesNotMatch(logicaGetPut, /navegacion/);
    assert.doesNotMatch(logicaGetPut, /'metaTitle'|'metaDescription'|footer_text|footer_email|footer_phone/);
    assert.ok(inicioGet > -1 && inicioPut > -1 && finPut > -1, 'no se encontraron los bloques GET/PUT');
  });

  test('upsert con prepared statement para brand_name/logo_file/core_descuento', () => {
    assert.match(codigo, /ON DUPLICATE KEY UPDATE brand_name = VALUES\(brand_name\)/);
  });
});

describe('pagbateria/public/assets/js/lib/marca-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/marca-config.js');

  test('arranca solo al importarse, no espera a que algo lo llame', () => {
    assert.match(codigo, /const listo = \(async \(\) => \{/);
  });

  test('reemplaza el texto visible sin innerHTML (no destruye <span class="nav__brand-tag"> ni <em>Perú</em>)', () => {
    const inicio = codigo.indexOf('function reemplazarTextoNombre');
    const fin = codigo.indexOf('\n}', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    assert.match(cuerpo, /createTreeWalker/);
    assert.match(cuerpo, /NodeFilter\.SHOW_TEXT/);
    assert.doesNotMatch(cuerpo, /innerHTML/);
  });

  test('el logo solo se reemplaza si la API trajo uno — nunca deja el <img> sin src', () => {
    const inicio = codigo.indexOf('export async function aplicarMarca');
    const cuerpo = codigo.slice(inicio, inicio + 700);
    assert.match(cuerpo, /rol === 'logo' && logoActual/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea marca-config', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa aplicarMarca y lo llama en el arranque', () => {
    assert.match(codigo, /import \{ aplicarMarca \} from '\.\/lib\/marca-config\.js'/);
    assert.match(codigo, /void aplicarMarca\(\);/);
  });
});

describe('Las 9 páginas con navegación — nombre y logo marcados para el reemplazo progresivo', () => {
  for (const pagina of PAGINAS_CON_NAV) {
    test(`${pagina} — nav__brand/footer__brand y nav__logo/footer__logo tienen data-marca-rol`, () => {
      const codigo = leer(pagina);
      const sinMarcar = [
        ...codigo.matchAll(/<a(?![^>]*data-marca-rol)[^>]*class="(?:nav|footer)__brand"/g),
        ...codigo.matchAll(/<img(?![^>]*data-marca-rol)[^>]*class="(?:nav|footer)__logo"/g),
      ];
      assert.deepEqual(
        sinMarcar.map((m) => m[0]),
        [],
        `hay elementos de marca sin data-marca-rol en ${pagina}`
      );
    });
  }

  test('el total coincide con lo esperado: 2 nombres + 2 logos por página × 9 páginas', () => {
    let totalNombre = 0;
    let totalLogo = 0;
    for (const pagina of PAGINAS_CON_NAV) {
      const codigo = leer(pagina);
      totalNombre += (codigo.match(/data-marca-rol="nombre"/g) || []).length;
      totalLogo += (codigo.match(/data-marca-rol="logo"/g) || []).length;
    }
    assert.equal(totalNombre, 18);
    assert.equal(totalLogo, 18);
  });
});

describe('adminbateria — pestaña Sitio sin campos que no tienen efecto', () => {
  test('index.html ya no tiene meta title/description (nunca se aplicaban al sitio real)', () => {
    const codigo = leer('adminbateria/index.html');
    const inicio = codigo.indexOf('id="tab-sitio"');
    const fin = codigo.indexOf('</section>', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.doesNotMatch(bloque, /siteMetaTitle|siteMetaDescription/);
    assert.match(bloque, /id="siteBrandName"/);
    assert.match(bloque, /id="siteLogoFile"/);
  });

  test('admin.js ya no referencia meta/footer en el guardado de Sitio', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    const inicio = codigo.indexOf("qs('#btnSaveSite').addEventListener");
    const fin = codigo.indexOf('\n  });', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.doesNotMatch(bloque, /metaTitle|metaDescription|siteFooter/);
    assert.match(bloque, /brandName:/);
    assert.match(bloque, /logoFile:/);
    assert.match(bloque, /coreDiscount:/);
  });
});
