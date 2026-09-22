/**
 * Verificación estática de "Asesores de WhatsApp": la lista que convierte el
 * botón flotante de WhatsApp en un selector (nombre + rol + número) — pedido
 * del jefe, con una captura de "El Mundo de las Baterías" como referencia.
 * El selector es OBLIGATORIO (no condicional a tener 2+ asesores): con la
 * lista del panel vacía, se arma con una sola fila usando el número
 * principal de siempre (whatsapp-config.js) — nunca vuelve a ser un link
 * directo.
 *
 * IMPORTANTE: esto NO es el viejo roster "agentes por marca de auto" que se
 * quitó en 73a7b44 (esa era una demo de otro rubro, nunca correspondió al
 * negocio) — de ahí que estos tests usen nombres nuevos ("asesor", no
 * "agente") y que exista un test explícito verificando que el vocabulario
 * viejo no vuelva a aparecer.
 *
 * Sin DOM real en este entorno — se lee el código fuente, misma convención
 * que el resto de la suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('adminbateria/backend/api/whatsapp_asesores.php — escritura, con sesión', () => {
  const php = leer('adminbateria/backend/api/whatsapp_asesores.php');

  test('exige sesión y CSRF, como el resto de endpoints admin', () => {
    assert.match(php, /require_write_access\(\);/);
  });

  test('usa db(), no get_pdo()', () => {
    assert.match(php, /\$pdo = db\(\);/);
  });

  test('valida el número: 9 a 11 dígitos, igual que whatsapp.php', () => {
    assert.match(php, /\/\^\\d\{9,11\}\$\//);
  });

  test('el nombre es obligatorio en alta y edición', () => {
    const post = php.slice(php.indexOf("if (\$method === 'POST')"), php.indexOf("if (\$method === 'PUT')"));
    assert.match(post, /El nombre es obligatorio/);
  });

  test('crea la tabla si no existe', () => {
    assert.match(php, /CREATE TABLE IF NOT EXISTS whatsapp_asesores/);
  });

  test('soporta reordenar en bloque (order: [{id, orden}]), mismo patrón que marcas.php', () => {
    assert.match(php, /isset\(\$body\['order'\]\) && is_array\(\$body\['order'\]\)/);
  });

  test('DELETE por id', () => {
    assert.match(php, /if \(\$method === 'DELETE'\)/);
    assert.match(php, /DELETE FROM whatsapp_asesores WHERE id = \?/);
  });
});

describe('pagbateria/backend/api/whatsapp_asesores.php — lectura pública, sin sesión', () => {
  const php = leer('pagbateria/backend/api/whatsapp_asesores.php');

  test('no exige autenticación', () => {
    assert.doesNotMatch(php, /require_write_access|require_auth/);
  });

  test('solo responde GET', () => {
    assert.match(php, /if \(\$method !== 'GET'\)/);
  });

  test('solo trae los activos, ordenados', () => {
    assert.match(php, /WHERE activo = 1 ORDER BY orden, id/);
  });

  test('usa get_pdo() y degrada al JSON local si la BD no responde', () => {
    assert.match(php, /get_pdo\(\)/);
    assert.match(php, /whatsapp_asesores\.json/);
  });
});

describe('pagbateria/backend/data/whatsapp_asesores.json — respaldo sin BD', () => {
  const json = JSON.parse(leer('pagbateria/backend/data/whatsapp_asesores.json'));

  test('vacío por defecto — sin configurar, el botón flotante sigue siendo un link directo', () => {
    assert.deepEqual(json.asesores, []);
  });
});

describe('whatsapp-asesores.js — selector del botón flotante, mejora progresiva', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/whatsapp-asesores.js');

  test('si el botón flotante no existe, no pide nada', () => {
    assert.match(codigo, /if \(!\(original instanceof HTMLAnchorElement\)\) return;/);
  });

  test('el selector es obligatorio: sin asesores del panel, arma una fila de respaldo con el número principal', () => {
    assert.match(codigo, /if \(asesores\.length === 0\) \{/);
    assert.match(codigo, /asesores\.push\(\{ nombre: 'Atención al cliente', numero: getWhatsappNumeroSync\(\) \}\);/);
  });

  test('ya no existe el umbral viejo de 2+ asesores para mostrar el selector', () => {
    assert.doesNotMatch(codigo, /if \(asesores\.length < 2\) return;/);
  });

  test('un fetch fallido no rompe nada — sigue armando el respaldo, no aborta', () => {
    const bloque = codigo.slice(codigo.indexOf('try {'), codigo.indexOf('const asesores ='));
    assert.match(bloque, /catch \{/);
    assert.doesNotMatch(bloque, /catch \{\s*\n\s*return;/);
  });

  test('usa el número principal de whatsapp-config.js para el respaldo', () => {
    assert.match(codigo, /import \{ getWhatsappNumeroSync, whatsappListo \} from '\.\.\/lib\/whatsapp-config\.js';/);
    assert.match(codigo, /await whatsappListo\(\);/);
  });

  test('valida cada asesor (nombre no vacío, número 9-11 dígitos) antes de mostrarlo', () => {
    assert.match(codigo, /\/\^\\d\{9,11\}\$\/\.test\(a\.numero\)/);
  });

  test('escapa nombre/rol antes de insertarlos por innerHTML', () => {
    assert.match(codigo, /function esc\(/);
    assert.match(codigo, /esc\(/);
  });

  test('el panel se cierra con Escape y clic afuera, no solo con el botón de cerrar', () => {
    assert.match(codigo, /key === 'Escape'/);
    assert.match(codigo, /alClicFuera/);
  });
});

describe('main.js arranca initWhatsappAsesores', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama initWhatsappAsesores', () => {
    assert.match(codigo, /import \{ initWhatsappAsesores \} from '\.\/ui\/whatsapp-asesores\.js';/);
    assert.match(codigo, /initWhatsappAsesores\(\);/);
  });
});

describe('Panel admin — tarjeta "Asesores" dentro de la pestaña WhatsApp', () => {
  const html = leer('adminbateria/index.html');
  const js = leer('adminbateria/assets/js/admin.js');

  test('existen los campos de alta y el botón de agregar, dentro de #tab-whatsapp', () => {
    const inicio = html.indexOf('id="tab-whatsapp"');
    const fin = html.indexOf('</section>', html.indexOf('</section>', inicio) + 1);
    const bloque = html.slice(inicio, fin);
    assert.match(bloque, /id="waAsesoresGrid"/);
    assert.match(bloque, /id="waAsesorNombre"/);
    assert.match(bloque, /id="waAsesorRol"/);
    assert.match(bloque, /id="waAsesorNumero"/);
    assert.match(bloque, /id="btnAddAsesor"/);
  });

  test('admin.js define load/render/bind de asesores y los arranca en el init', () => {
    assert.match(js, /async function loadAsesores\(\)/);
    assert.match(js, /function renderAsesores\(\)/);
    assert.match(js, /function bindAsesores\(\)/);
    assert.match(js, /loadAsesores\(\); bindAsesores\(\);/);
  });

  test('el reordenar usa el mismo endpoint con { order }, sin duplicar lógica', () => {
    assert.match(js, /async function guardarOrdenAsesores\(\)/);
    assert.match(js, /jput\('\/whatsapp_asesores\.php', \{ order \}\)/);
  });

  test('NO reintroduce el vocabulario del viejo roster de "agentes por marca de auto" (removido en 73a7b44)', () => {
    assert.doesNotMatch(html, /waAgents|btnAddAgent|waDefault/);
    assert.doesNotMatch(js, /waAgents|renderAgentCard|renderAgents|btnAddAgent/);
  });
});
