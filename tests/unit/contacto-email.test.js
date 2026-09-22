/**
 * Verificación estática del correo de contacto configurable desde el panel.
 * La pestaña "Ubicación" del admin (adminbateria/backend/api/contacto.php,
 * tabla contacto_info) existía desde antes pero no tenía ningún consumidor
 * en el sitio público — el jefe editaba el correo ahí y no pasaba nada en
 * la página real. Este endpoint público + contacto-config.js conectan por
 * fin ese campo, mismo patrón de mejora progresiva que hero/cabeceras/etc.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS_CON_FOOTER = [
  'pagbateria/public/index.html',
  'pagbateria/public/catalogo.html',
  'pagbateria/public/servicios.html',
  'pagbateria/public/cobertura.html',
  'pagbateria/public/nosotros.html',
  'pagbateria/public/contacto.html',
  'pagbateria/public/cookies.html',
  'pagbateria/public/aviso-legal.html',
  'pagbateria/public/privacidad.html',
];

describe('pagbateria/backend/api/contacto.php — lectura pública, sin sesión', () => {
  const php = leer('pagbateria/backend/api/contacto.php');

  test('no exige autenticación — lo consume cualquier visitante en cada carga', () => {
    assert.doesNotMatch(php, /require_write_access|require_auth/);
  });

  test('solo responde GET', () => {
    assert.match(php, /if \(\$method !== 'GET'\)/);
  });

  test('lee de la misma tabla contacto_info que ya usa el admin (contacto_info, columna email)', () => {
    assert.match(php, /FROM contacto_info WHERE id = 1/);
    assert.match(php, /SELECT email/);
  });

  test('usa get_pdo() y degrada al JSON local si la BD no responde', () => {
    assert.match(php, /get_pdo\(\)/);
    assert.match(php, /contacto\.json/);
  });

  test('solo expone email — dirección/horario/RUC siguen sin consumidor, fuera de alcance', () => {
    const codigoReal = php.slice(php.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /direccion|horario|ruc/i);
  });
});

describe('pagbateria/backend/data/contacto.json — respaldo sin BD', () => {
  test('trae el correo real, no un placeholder', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/contacto.json'));
    assert.match(datos.values.email, /@cambiatubateriaperu\.com$/);
  });
});

describe('contacto-config.js — mejora progresiva en el sitio público', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/contacto-config.js');

  test('si no hay ningún data-contacto-rol en la página, no pide nada', () => {
    assert.match(codigo, /if \(nodosTexto\.length === 0 && nodosLink\.length === 0\) return;/);
  });

  test('un fetch fallido no rompe nada — el correo del HTML se queda tal cual', () => {
    assert.match(codigo, /try\s*\{[\s\S]*?catch[\s\S]*?return;/);
  });

  test('dos roles distintos: "email-texto" cambia texto+href, "email-link" solo el href', () => {
    assert.match(codigo, /data-contacto-rol="email-texto"/);
    assert.match(codigo, /data-contacto-rol="email-link"/);
    // email-texto: el bloque debe tocar tanto .href como .textContent
    const bloqueTexto = codigo.slice(codigo.indexOf('nodosTexto.forEach'), codigo.indexOf('nodosLink.forEach'));
    assert.match(bloqueTexto, /\.href = `mailto:\$\{email\}`/);
    assert.match(bloqueTexto, /\.textContent = email/);
    // email-link: el bloque NO debe tocar textContent (el label "Escríbenos" se queda)
    const bloqueLink = codigo.slice(codigo.indexOf('nodosLink.forEach'));
    assert.doesNotMatch(bloqueLink, /textContent/);
  });
});

describe('main.js arranca aplicarContacto', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama aplicarContacto dentro de revelarContenidoEditable — evita el parpadeo', () => {
    assert.match(codigo, /import \{ aplicarContacto \} from '\.\/lib\/contacto-config\.js';/);
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarContacto\(\)[\s\S]*?\]\)/);
  });
});

describe('base.css — el correo-texto no parpadea, el correo-link (href) sí puede', () => {
  const css = leer('pagbateria/public/assets/css/v2/base.css');

  test('[data-contacto-rol="email-texto"] está oculto hasta data-contenido-listo', () => {
    assert.match(css, /\[data-contacto-rol="email-texto"\]/);
  });

  test('[data-contacto-rol="email-link"] NO está en la lista de ocultos — solo cambia el href, sin texto que parpadee', () => {
    const bloque = css.slice(css.indexOf(':root:not([data-contenido-listo]) [data-hero-rol]'), css.indexOf('visibility: hidden;'));
    assert.doesNotMatch(bloque, /email-link/);
  });
});

describe('Cada mención visible del correo en las 9 páginas con footer trae data-contacto-rol', () => {
  for (const pagina of PAGINAS_CON_FOOTER) {
    test(`${pagina} — el link "Escríbenos" del pie trae data-contacto-rol="email-link"`, () => {
      const html = leer(pagina);
      assert.match(html, /data-contacto-rol="email-link" href="mailto:contacto@cambiatubateriaperu\.com">Escríbenos<\/a>/);
    });
  }

  test('contacto.html — la tarjeta "Correo" trae data-contacto-rol="email-texto"', () => {
    const html = leer('pagbateria/public/contacto.html');
    assert.match(html, /data-contacto-rol="email-texto" href="mailto:contacto@cambiatubateriaperu\.com">contacto@cambiatubateriaperu\.com<\/a>/);
  });

  test('aviso-legal.html, cookies.html, privacidad.html — el correo escrito como texto también trae data-contacto-rol="email-texto"', () => {
    for (const pagina of ['pagbateria/public/aviso-legal.html', 'pagbateria/public/cookies.html', 'pagbateria/public/privacidad.html']) {
      const html = leer(pagina);
      const menciones = html.match(/contacto@cambiatubateriaperu\.com/g) || [];
      const marcadas = html.match(/data-contacto-rol="email-texto"[^>]*>contacto@cambiatubateriaperu\.com/g) || [];
      // Cada página tiene 2 menciones: el link "Escríbenos" del pie (email-link,
      // sin el correo como texto) y al menos una mención del correo como texto
      // visible (email-texto) en el cuerpo legal.
      assert.ok(marcadas.length >= 1, `${pagina}: ninguna mención del correo como texto está marcada`);
      assert.ok(menciones.length >= marcadas.length);
    }
  });
});
