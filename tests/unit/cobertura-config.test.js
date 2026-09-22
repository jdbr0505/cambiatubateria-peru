/**
 * Verificación estática de la página Cobertura configurable desde el panel
 * — reportado por el usuario ("veo en la cobertura que no está en el panel
 * administrativo"). La lista de zonas + distritos y los dos títulos de
 * sección ("Cobertura confirmada", "Atendemos siempre") estaban escritos a
 * mano en cobertura.html sin ningún campo en el panel.
 *
 * A diferencia de Nosotros/Servicios (4 tarjetas fijas por slug), las zonas
 * son una lista ABIERTA: el negocio agrega distritos según va creciendo su
 * cobertura, así que el PUT reemplaza la lista entera (mismo patrón que el
 * reordenar de marcas.php), no upsert por slug.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('pagbateria/backend/api/cobertura.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/cobertura.php');

  test('no exige sesión — lo consume cualquier visitante en cada carga', () => {
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /require_write_access|require_auth/);
  });

  test('solo responde GET', () => {
    assert.match(codigo, /if \(\$method !== 'GET'\)/);
  });

  test('usa get_pdo() y degrada al JSON local si la BD no responde', () => {
    assert.match(codigo, /get_pdo\(\)/);
    assert.match(codigo, /cobertura\.json/);
  });

  test('lee de pagina_cobertura y pagina_cobertura_zonas', () => {
    assert.match(codigo, /FROM pagina_cobertura\b/);
    assert.match(codigo, /FROM pagina_cobertura_zonas\b/);
  });

  test('sin zonas guardadas en la BD, cae al respaldo — nunca deja la página sin distritos', () => {
    assert.match(codigo, /Sin zonas guardadas todavía: cae al respaldo/);
  });
});

describe('pagbateria/backend/data/cobertura.json — respaldo con el contenido real', () => {
  const datos = JSON.parse(leer('pagbateria/backend/data/cobertura.json'));

  test('trae los 3 títulos y coincide con lo horneado en cobertura.html', () => {
    assert.equal(datos.distritosTitulo, 'Cobertura confirmada');
    assert.equal(datos.horariosTitulo, 'Atendemos siempre');
  });

  test('trae el FAQ de horarios — resumen abierto por defecto + la pregunta desplegable', () => {
    assert.equal(datos.horarioResumenTitulo, 'Lunes a domingo, incluidos feriados');
    assert.ok(datos.horarioResumenTexto);
    assert.equal(datos.faqPregunta, '¿Atienden de madrugada?');
    assert.ok(datos.faqRespuesta);
  });

  test('trae las 4 zonas reales, incluida Callao', () => {
    const nombres = datos.zonas.map((z) => z.nombre);
    assert.deepEqual(nombres, ['Lima Moderna', 'Lima Centro', 'Lima Norte', 'Callao']);
    assert.deepEqual(datos.zonas.find((z) => z.nombre === 'Callao').distritos, ['Callao']);
    assert.ok(datos.zonas.find((z) => z.nombre === 'Lima Moderna').distritos.includes('San Isidro'));
  });
});

describe('adminbateria/backend/api/cobertura.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/cobertura.php');

  test('exige sesión y CSRF, usa db()', () => {
    assert.match(codigo, /require_write_access\(\);/);
    assert.match(codigo, /\$pdo = db\(\);/);
  });

  test('crea las 2 tablas nuevas, con distritos_bajada como TEXT (texto largo)', () => {
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS pagina_cobertura\b/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS pagina_cobertura_zonas\b/);
    assert.match(codigo, /distritos_bajada TEXT NULL/);
  });

  test('el PUT reemplaza TODAS las zonas (DELETE + INSERT), no upsert por slug — es una lista abierta', () => {
    const inicio = codigo.indexOf("if (isset(\$body['zonas'])");
    const fin = codigo.indexOf('\n  }', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /DELETE FROM pagina_cobertura_zonas/);
    assert.match(bloque, /INSERT INTO pagina_cobertura_zonas/);
    assert.match(bloque, /beginTransaction/);
    assert.match(bloque, /rollBack/);
  });

  test('sin zonas guardadas, pre-rellena con el JSON — mismo patrón que Nosotros/Servicios en una BD recién desplegada', () => {
    assert.match(codigo, /cobertura_defaults\(\)/);
  });

  test('las 4 columnas del FAQ llevan guardia idempotente (information_schema) — instalaciones viejas no tenían pagina_cobertura con estas columnas', () => {
    const inicio = codigo.indexOf('function cobertura_asegurar_columnas_faq');
    const fin = codigo.indexOf('\n}', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /horario_resumen_titulo/);
    assert.match(bloque, /horario_resumen_texto/);
    assert.match(bloque, /faq_pregunta/);
    assert.match(bloque, /faq_respuesta/);
    assert.match(bloque, /information_schema\.columns/);
    assert.match(bloque, /ADD COLUMN/);
    assert.match(codigo, /cobertura_asegurar_columnas_faq\(\$pdo\);/);
  });

  test('el UPDATE y el GET incluyen los 4 campos del FAQ', () => {
    assert.match(codigo, /horario_resumen_titulo = \?/);
    assert.match(codigo, /'horarioResumenTexto'/);
    assert.match(codigo, /'faqPregunta'/);
    assert.match(codigo, /\$valor\('faqRespuesta', 'faq_respuesta'\)/);
  });
});

describe('pagbateria/public/assets/js/lib/cobertura-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/cobertura-config.js');

  test('si no hay ni data-cobertura-rol ni el contenedor de zonas, no pide nada', () => {
    assert.match(codigo, /if \(nodos\.length === 0 && !contenedorZonas\) return;/);
  });

  test('un fetch fallido no rompe nada — el HTML por defecto se queda tal cual', () => {
    assert.match(codigo, /try\s*\{[\s\S]*?catch[\s\S]*?return;/);
  });

  test('reconstruye la lista de zonas con replaceChildren, no innerHTML — sin riesgo de XSS', () => {
    assert.match(codigo, /contenedorZonas\.replaceChildren/);
    assert.doesNotMatch(codigo, /\.innerHTML\s*=/);
  });

  test('sin zonas válidas (BD caída o panel vaciado), NO reemplaza — deja la lista fija del HTML', () => {
    assert.match(codigo, /if \(contenedorZonas && validas\.length > 0\)/);
  });

  test('la zona llamada "Callao" conserva el id="callao" que usa el enlace del pie de página', () => {
    assert.match(codigo, /nombre\.trim\(\)\.toLowerCase\(\) === 'callao'/);
    assert.match(codigo, /div\.id = 'callao'/);
  });

  test('los nombres de distrito se insertan como texto (textContent), no HTML', () => {
    assert.match(codigo, /li\.textContent = d;/);
  });
});

describe('main.js arranca aplicarCobertura', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama aplicarCobertura dentro de revelarContenidoEditable — evita el parpadeo', () => {
    assert.match(codigo, /import \{ aplicarCobertura \} from '\.\/lib\/cobertura-config\.js';/);
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarCobertura\(\)[\s\S]*?\]\)/);
  });
});

describe('base.css — el contenido de cobertura no parpadea', () => {
  const css = leer('pagbateria/public/assets/css/v2/base.css');

  test('[data-cobertura-rol] y [data-testid="distritos"] están en la regla de ocultamiento', () => {
    const inicio = css.indexOf(':root:not([data-contenido-listo]) [data-hero-rol]');
    const fin = css.indexOf('visibility: hidden;', inicio);
    const regla = css.slice(inicio, fin);
    assert.match(regla, /\[data-cobertura-rol\]/);
    assert.match(regla, /\[data-testid="distritos"\]/);
  });
});

describe('pagbateria/public/cobertura.html — la página real marcada', () => {
  const codigo = leer('pagbateria/public/cobertura.html');

  test('los roles de texto están presentes, cada uno una sola vez, incluido el FAQ de horarios', () => {
    for (const rol of ['distritos-titulo', 'distritos-bajada', 'horarios-titulo', 'horario-resumen-titulo', 'horario-resumen-texto', 'faq-pregunta', 'faq-respuesta']) {
      const coincidencias = codigo.match(new RegExp(`data-cobertura-rol="${rol}"`, 'g')) || [];
      assert.equal(coincidencias.length, 1, `${rol} debería aparecer exactamente una vez`);
    }
  });

  test('el <noscript> revela [data-cobertura-rol] y el contenedor de zonas', () => {
    const noscript = codigo.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0] ?? '';
    assert.match(noscript, /\[data-cobertura-rol\]/);
    assert.match(noscript, /\[data-testid="distritos"\]/);
  });
});

describe('Panel admin — pestaña "Cobertura"', () => {
  const html = leer('adminbateria/index.html');
  const js = leer('adminbateria/assets/js/admin.js');

  test('existe la pestaña con los 3 campos de texto, el FAQ de horarios y el grid de zonas', () => {
    assert.match(html, /data-tab="cobertura"/);
    assert.match(html, /id="tab-cobertura"/);
    assert.match(html, /id="covDistritosTitulo"/);
    assert.match(html, /id="covDistritosBajada"/);
    assert.match(html, /id="covHorariosTitulo"/);
    assert.match(html, /id="covHorarioResumenTitulo"/);
    assert.match(html, /id="covHorarioResumenTexto"/);
    assert.match(html, /id="covFaqPregunta"/);
    assert.match(html, /id="covFaqRespuesta"/);
    assert.match(html, /id="coberturaZonasGrid"/);
    assert.match(html, /id="btnAddZona"/);
    assert.match(html, /id="btnSaveCobertura"/);
  });

  test('admin.js define load/render/bind de cobertura y las arranca en el init', () => {
    assert.match(js, /async function loadCobertura\(\)/);
    assert.match(js, /function renderCoberturaZonas\(\)/);
    assert.match(js, /function bindCobertura\(\)/);
    assert.match(js, /loadCobertura\(\); bindCobertura\(\);/);
  });

  test('agregar zona empuja al estado en memoria y vuelve a renderizar — sin recargar de la BD', () => {
    const inicio = js.indexOf("qs('#btnAddZona')");
    const fin = js.indexOf('\n\n', inicio);
    const bloque = js.slice(inicio, fin);
    assert.match(bloque, /coberturaZonas\.push\(\{ nombre: '', distritos: \[\] \}\);/);
    assert.match(bloque, /renderCoberturaZonas\(\)/);
  });

  test('guardar manda los 3 campos + FAQ de horarios + zonas filtrando las vacías', () => {
    const inicio = js.indexOf("qs('#btnSaveCobertura')");
    const fin = js.indexOf('\n}', inicio);
    const bloque = js.slice(inicio, fin);
    assert.match(bloque, /distritosTitulo: sval\('#covDistritosTitulo'\)/);
    assert.match(bloque, /horarioResumenTitulo: sval\('#covHorarioResumenTitulo'\)/);
    assert.match(bloque, /faqPregunta: sval\('#covFaqPregunta'\)/);
    assert.match(bloque, /faqRespuesta: sval\('#covFaqRespuesta'\)/);
    assert.match(bloque, /zonas: coberturaZonas\.filter/);
    assert.match(bloque, /jput\('\/cobertura\.php', payload\)/);
  });

  test('cargar rellena los 4 campos del FAQ de horarios', () => {
    const inicio = js.indexOf('async function loadCobertura()');
    const fin = js.indexOf('\n}', inicio);
    const bloque = js.slice(inicio, fin);
    assert.match(bloque, /setVal\('#covHorarioResumenTitulo', d\.horarioResumenTitulo\)/);
    assert.match(bloque, /setVal\('#covFaqRespuesta', d\.faqRespuesta\)/);
  });
});
