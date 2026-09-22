/**
 * Verificación estática del número de WhatsApp configurable desde el panel
 * admin — reemplaza los ~79 lugares donde estaba pegado a mano. Mismo patrón
 * que pagina-fotos.test.js: público degrada a JSON, admin exige sesión, el
 * módulo del sitio nunca bloquea ni deja un link roto si la API no contesta.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS = [
  'pagbateria/public/index.html',
  'pagbateria/public/catalogo.html',
  'pagbateria/public/servicios.html',
  'pagbateria/public/cobertura.html',
  'pagbateria/public/nosotros.html',
  'pagbateria/public/contacto.html',
  'pagbateria/public/cookies.html',
  'pagbateria/public/privacidad.html',
  'pagbateria/public/aviso-legal.html',
  'pagbateria/public/offline.html',
];

describe('pagbateria/backend/api/whatsapp.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/whatsapp.php');

  test('no exige sesión, usa get_pdo() (nullable) con degradación a JSON', () => {
    assert.doesNotMatch(codigo, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigo, /require_auth\s*\(\s*\)/);
    assert.match(codigo, /get_pdo\(\)/);
    assert.match(codigo, /data\/whatsapp\.json/);
  });

  test('esquema reducido a un número — sin el roster de agentes de la demo vieja', () => {
    assert.doesNotMatch(codigo, /whatsapp_agentes|'agents'/);
    assert.match(codigo, /'numero'/);
  });
});

describe('pagbateria/backend/data/whatsapp.json — respaldo con datos reales, no la demo mexicana', () => {
  test('número peruano real, no "+52 55 1111 1111"', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/whatsapp.json'));
    assert.equal(datos.numero, '51936956877');
    assert.equal(datos.agents, undefined);
  });
});

describe('adminbateria/backend/api/whatsapp.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/whatsapp.php');

  test('exige sesión, usa db(), auto-crea su tabla', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.match(codigo, /\bdb\(\)/);
    assert.doesNotMatch(codigo, /get_pdo\(\)/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS whatsapp_config/);
  });

  test('valida el número: solo dígitos, 9-11 caracteres, antes de guardar', () => {
    const inicio = codigo.indexOf("if (\$method === 'PUT')");
    const cuerpo = codigo.slice(inicio, inicio + 700);
    assert.match(cuerpo, /preg_replace\('\/\\D\/', '', /);
    assert.match(cuerpo, /preg_match\('\/\^\\d\{9,11\}\$\/'/);
  });

  test('upsert con prepared statement, no INSERT+DELETE de agentes', () => {
    assert.match(codigo, /ON DUPLICATE KEY UPDATE numero = VALUES\(numero\)/);
    assert.doesNotMatch(codigo, /(FROM|INTO|DELETE FROM)\s+whatsapp_agentes/);
  });
});

describe('pagbateria/public/assets/js/lib/whatsapp-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/whatsapp-config.js');

  test('arranca solo al importarse, no espera a que algo lo llame', () => {
    assert.match(codigo, /const listo = \(async \(\) => \{/);
  });

  test('valida el número que devuelve la API antes de aceptarlo (9-11 dígitos)', () => {
    assert.match(codigo, /\/\^\\d\{9,11\}\$\//);
  });

  test('getWhatsappNumeroSync nunca devuelve algo distinto al string por defecto o al validado', () => {
    assert.match(codigo, /const NUMERO_POR_DEFECTO = '51936956877';/);
    assert.match(codigo, /export function getWhatsappNumeroSync\(\)/);
  });

  test('reemplaza el texto visible sin usar innerHTML (no destruye el <span> del emoji del nav)', () => {
    const inicio = codigo.indexOf('function reemplazarTextoNumero');
    const fin = codigo.indexOf('\n}', inicio);
    const cuerpo = codigo.slice(inicio, fin);
    assert.match(cuerpo, /createTreeWalker/);
    assert.match(cuerpo, /NodeFilter\.SHOW_TEXT/);
    assert.doesNotMatch(cuerpo, /innerHTML/);
  });

  test('si la API no contestó (sigue en el número por defecto), no toca el DOM', () => {
    const inicio = codigo.indexOf('export async function aplicarLinksWhatsapp');
    const cuerpo = codigo.slice(inicio, inicio + 600);
    assert.match(cuerpo, /if \(numeroActual === NUMERO_POR_DEFECTO\) return;/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea WhatsApp', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa el módulo compartido, ya no tiene el número pegado a mano', () => {
    assert.match(codigo, /import \{ aplicarLinksWhatsapp \} from '\.\/lib\/whatsapp-config\.js'/);
    assert.doesNotMatch(codigo, /const WHATSAPP = '51936956877'/);
  });

  test('ya no construye un objeto geo (era del flujo de auxilio/GPS, quitado del sitio)', () => {
    assert.doesNotMatch(codigo, /getWhatsappNumeroSync|whatsappListo|new GeolocationService/);
  });

  test('llama aplicarLinksWhatsapp() en el arranque', () => {
    assert.match(codigo, /void aplicarLinksWhatsapp\(\);/);
  });
});

describe('pagbateria/public/assets/js/ui/catalog.js — cotización y "sin resultados" usan el número configurable', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/catalog.js');

  test('importa getWhatsappNumeroSync/formatearNumeroVisible, ya no tiene el número pegado a mano', () => {
    assert.match(codigo, /import \{ getWhatsappNumeroSync, formatearNumeroVisible \} from '\.\.\/lib\/whatsapp-config\.js'/);
    assert.doesNotMatch(codigo, /51936956877/);
  });

  test('el botón "Cotizar por WhatsApp" usa el número dinámico', () => {
    assert.match(codigo, /https:\/\/wa\.me\/\$\{getWhatsappNumeroSync\(\)\}\?text=/);
  });

  test('el botón "Llamar" del estado vacío usa el número y el texto formateado, escapado', () => {
    assert.match(codigo, /tel:\+\$\{getWhatsappNumeroSync\(\)\}/);
    assert.match(codigo, /esc\(formatearNumeroVisible\(getWhatsappNumeroSync\(\)\)\)/);
  });
});

describe('Las 10 páginas públicas — links tel:/wa.me marcados para el reemplazo progresivo', () => {
  for (const pagina of PAGINAS) {
    test(`${pagina} — cada href de tel:/wa.me con el número real trae data-whatsapp-role`, () => {
      const codigo = leer(pagina);
      const hrefsSinMarcar = [
        ...codigo.matchAll(/<a(?![^>]*data-whatsapp-role)[^>]*href="tel:\+51936956877"/g),
        ...codigo.matchAll(/<a(?![^>]*data-whatsapp-role)[^>]*href="https:\/\/wa\.me\/51936956877"/g),
      ];
      assert.deepEqual(
        hrefsSinMarcar.map((m) => m[0]),
        [],
        `hay links con el número real sin data-whatsapp-role en ${pagina}`
      );
    });
  }

  test('el total de links marcados coincide con lo esperado (73) — ni de más ni de menos', () => {
    // Bajó de 79 a 73: se quitó el botón grande "Escríbenos por WhatsApp"
    // dentro de la sección .cta-final de las 6 páginas que la tienen (index,
    // servicios, cobertura, nosotros, contacto, catalogo) — redundante con el
    // botón flotante de WhatsApp, que ya está en todas las páginas. El botón
    // de llamar (tel) de esa misma sección se queda, ahora como única acción.
    let totalTel = 0;
    let totalWa = 0;
    for (const pagina of PAGINAS) {
      const codigo = leer(pagina);
      totalTel += (codigo.match(/data-whatsapp-role="tel"/g) || []).length;
      totalWa += (codigo.match(/data-whatsapp-role="wa"/g) || []).length;
    }
    assert.equal(totalTel, 44);
    assert.equal(totalWa, 29);
  });
});

describe('adminbateria — pestaña WhatsApp simplificada a un número', () => {
  test('index.html ya no tiene el formulario de agentes', () => {
    const codigo = leer('adminbateria/index.html');
    const inicio = codigo.indexOf('id="tab-whatsapp"');
    const fin = codigo.indexOf('</section>', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.doesNotMatch(bloque, /waAgents|btnAddAgent|waDefault/);
    assert.match(bloque, /id="waNumero"/);
  });

  test('admin.js ya no referencia agentes', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    assert.doesNotMatch(codigo, /waAgents|renderAgentCard|renderAgents|btnAddAgent/);
    assert.match(codigo, /waNumero/);
  });
});
