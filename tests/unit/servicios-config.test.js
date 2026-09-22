/**
 * Verificación estática de título/descripción de los 6 servicios,
 * configurables desde el panel admin — tercera pieza de reconectar contenido
 * de texto (WhatsApp, Sitio marca+logo, ahora Servicios). Slots fijos por
 * slug, mismo patrón que pagina_fotos.php: el ícono de cada card sigue
 * siendo un SVG fijo, no editable (no tiene dónde mapear una palabra clave).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function leer(path) {
  return readFileSync(path, 'utf8');
}

const SLUGS = ['auxilio', 'instalacion', 'diagnostico', 'bms', 'reciclaje', 'flotas'];

describe('pagbateria/backend/api/servicios.php — endpoint público', () => {
  const codigo = leer('pagbateria/backend/api/servicios.php');

  test('bug real corregido: ya NO exige sesión en GET', () => {
    const codigoReal = codigo.slice(codigo.indexOf('*/') + 2);
    assert.doesNotMatch(codigoReal, /require_write_access\s*\(\s*\)/);
    assert.doesNotMatch(codigoReal, /require_auth\s*\(\s*\)/);
  });

  test('usa get_pdo() con degradación a JSON, como pagina_fotos.php', () => {
    assert.match(codigo, /get_pdo\(\)/);
    assert.match(codigo, /data\/services\.json/);
  });

  test('lee de pagina_servicios, no de la vieja tabla servicios (lista libre nunca aplicada al sitio real)', () => {
    assert.match(codigo, /FROM pagina_servicios/);
    assert.doesNotMatch(codigo, /FROM servicios\b/);
  });
});

describe('pagbateria/backend/data/services.json — respaldo con el copy real, no la demo genérica', () => {
  test('sin "30 minutos" ni "24/7" — coincide con los 6 slugs y el texto real de servicios.html', () => {
    const datos = JSON.parse(leer('pagbateria/backend/data/services.json'));
    for (const slug of SLUGS) {
      assert.ok(datos[slug]?.title, `falta el slug ${slug}`);
    }
    assert.equal(datos.auxilio.title, 'Auxilio a domicilio');
    assert.equal(datos.bms.title, 'Reprogramación BMS');
    const textoCompleto = JSON.stringify(datos);
    assert.doesNotMatch(textoCompleto, /30 minutos|24\/7|24 horas/);
  });
});

describe('adminbateria/backend/api/servicios.php — endpoint admin', () => {
  const codigo = leer('adminbateria/backend/api/servicios.php');

  test('exige sesión, usa db(), auto-crea pagina_servicios (tabla nueva, no toca la vieja servicios)', () => {
    assert.match(codigo, /require_write_access\s*\(\s*\)/);
    assert.match(codigo, /\bdb\(\)/);
    assert.match(codigo, /CREATE TABLE IF NOT EXISTS pagina_servicios/);
  });

  test('valida el slug contra los 6 fijos — no admite servicios inventados', () => {
    assert.match(codigo, /const SLOTS = \['auxilio', 'instalacion', 'diagnostico', 'bms', 'reciclaje', 'flotas'\]/);
    assert.match(codigo, /in_array\(\$slug, SLOTS, true\)/);
  });

  test('upsert con prepared statement, no DELETE+re-INSERT de toda la lista', () => {
    assert.match(codigo, /ON DUPLICATE KEY UPDATE titulo = VALUES\(titulo\)/);
    assert.doesNotMatch(codigo, /DELETE FROM (pagina_)?servicios/);
  });
});

describe('pagbateria/public/assets/js/lib/servicios-config.js — módulo compartido', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/servicios-config.js');

  test('solo pisa .card__title/.card__text si la API trajo algo — nunca deja una card vacía', () => {
    assert.match(codigo, /if \(titulo && entrada\.title\) titulo\.textContent = entrada\.title;/);
    assert.match(codigo, /if \(texto && entrada\.description\) texto\.textContent = entrada\.description;/);
  });

  test('sin conexión no toca el DOM — el HTML ya trae el texto de hoy', () => {
    assert.match(codigo, /catch \{[\s\S]*?return;[\s\S]*?\}/);
  });
});

describe('pagbateria/public/assets/js/main.js — cablea servicios-config', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa aplicarServicios y lo llama en el arranque', () => {
    assert.match(codigo, /import \{ aplicarServicios \} from '\.\/lib\/servicios-config\.js'/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero el valor por defecto y luego el editado (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarServicios\(\)[\s\S]*?\]\)/);
  });
});

describe('pagbateria/public/servicios.html — las 6 cards marcadas para el reemplazo progresivo', () => {
  const codigo = leer('pagbateria/public/servicios.html');

  test('cada slug tiene exactamente una card, en el mismo orden que SERVICIOS_SLOTS del admin', () => {
    for (const slug of SLUGS) {
      const coincidencias = codigo.match(new RegExp(`data-servicio-slug="${slug}"`, 'g')) || [];
      assert.equal(coincidencias.length, 1, `${slug} debería aparecer exactamente una vez`);
    }
  });

  test('la card de BMS (sin id de ancla) también quedó marcada — no se olvidó por no tener id', () => {
    assert.match(codigo, /<article class="card" data-servicio-slug="bms">/);
  });

  test('las cards que sí son ancla de deep-link conservan su id además del slug', () => {
    assert.match(codigo, /<article class="card" id="auxilio" data-servicio-slug="auxilio">/);
    assert.match(codigo, /<article class="card" id="flotas" data-servicio-slug="flotas">/);
  });
});

describe('adminbateria — pestaña Servicios con 6 slots fijos, no lista libre', () => {
  test('index.html ya no tiene "+ Servicio" (agregar/quitar arbitrario)', () => {
    const codigo = leer('adminbateria/index.html');
    const inicio = codigo.indexOf('id="tab-servicios"');
    const fin = codigo.indexOf('</section>', inicio);
    const bloque = codigo.slice(inicio, fin);
    assert.doesNotMatch(bloque, /btnAddService|servicesList/);
    assert.match(bloque, /id="serviciosGrid"/);
  });

  test('admin.js define los 6 slugs en el mismo orden que las cards reales', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    const inicio = codigo.indexOf('const SERVICIOS_SLOTS');
    const fin = codigo.indexOf('];', inicio);
    const bloque = codigo.slice(inicio, fin);
    const orden = SLUGS.map((s) => bloque.indexOf(`slug: '${s}'`));
    assert.ok(orden.every((i) => i > -1), 'faltan slugs en SERVICIOS_SLOTS');
    assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'el orden de los slugs no coincide con las cards');
  });

  test('cada slot guarda con su propio botón, sin depender de un "Guardar todo" global', () => {
    const codigo = leer('adminbateria/assets/js/admin.js');
    const inicio = codigo.indexOf('function renderServicios');
    const fin = codigo.indexOf('\nfunction ', inicio + 10);
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /jput\('\/servicios\.php', \{ slug: slot\.slug, title: inTitle\.value\.trim\(\), description: inDesc\.value\.trim\(\) \}\)/);
  });
});

describe('Los 4 módulos de contenido público piden sin caché — bug real encontrado probando esta fase', () => {
  // Verificado en vivo: sin cache:'no-store', un cambio guardado en el panel
  // podía quedar invisible para el visitante porque el navegador reusaba una
  // respuesta vieja de la misma URL (las respuestas PHP no llevan
  // Cache-Control — .htaccess solo cubre html/css/js, no .php). Afecta a los
  // 4 módulos por igual, incluida pagina-fotos.js de la Fase 1.
  const modulos = [
    'pagbateria/public/assets/js/lib/whatsapp-config.js',
    'pagbateria/public/assets/js/lib/marca-config.js',
    'pagbateria/public/assets/js/lib/servicios-config.js',
    'pagbateria/public/assets/js/ui/pagina-fotos.js',
  ];

  for (const modulo of modulos) {
    test(`${modulo} — su fetch principal pide cache: 'no-store'`, () => {
      const codigo = leer(modulo);
      assert.match(codigo, /cache:\s*'no-store'/, `${modulo} no fuerza no-store en su fetch`);
    });
  }
});
