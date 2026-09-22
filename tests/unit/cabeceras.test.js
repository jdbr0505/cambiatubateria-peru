/**
 * Verificación estática de "Cabeceras/bloques de texto": título/bajada del
 * encabezado oscuro (.hero--page) de Catálogo, Servicios, Cobertura y
 * Contacto, más 3 bloques intermedios sumados después a pedido del usuario
 * ("estos textos también sean editables"): "Cómo trabajamos" de Servicios,
 * y la franja "Sin sorpresas" + "Nuestro catálogo" de Inicio. Nosotros ya
 * tenía nosotros.php — no se tocó.
 *
 * Sin DOM real en este entorno — se lee el código fuente, misma convención
 * que el resto de la suite (ver pagina-fotos.test.js).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

/** "servicios-trabajo" -> "ServiciosTrabajo", para construir ids de campo. */
const cap = (s) => s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

const PAGINAS = ['catalogo', 'servicios', 'cobertura', 'contacto'];
const BLOQUES = [...PAGINAS, 'servicios-trabajo', 'inicio-franja', 'inicio-catalogo'];

describe('adminbateria/backend/api/cabeceras.php — escritura, con sesión', () => {
  const php = leer('adminbateria/backend/api/cabeceras.php');

  test('exige sesión y CSRF, como el resto de endpoints admin', () => {
    assert.match(php, /require_write_access\(\);/);
  });

  test('usa db(), no get_pdo() — este es el backend admin, no el público', () => {
    assert.match(php, /\$pdo = db\(\);/);
  });

  test('valida el bloque contra la lista fija — no acepta cualquier valor', () => {
    for (const bloque of BLOQUES) {
      assert.match(php, new RegExp(`'${bloque}'`), `falta "${bloque}" en PAGINAS`);
    }
    assert.match(php, /in_array\(\$pagina, PAGINAS, true\)/);
  });

  test('el upsert usa ON DUPLICATE KEY UPDATE, no borra e inserta', () => {
    assert.match(php, /ON DUPLICATE KEY UPDATE/);
  });

  test('crea la tabla si no existe, mismo patrón que pagina_fotos', () => {
    assert.match(php, /CREATE TABLE IF NOT EXISTS pagina_cabeceras/);
  });

  test('el GET pre-rellena con el JSON por defecto cuando falta un bloque', () => {
    assert.match(php, /cabeceras\.json/);
  });
});

describe('pagbateria/backend/api/cabeceras.php — lectura pública, sin sesión', () => {
  const php = leer('pagbateria/backend/api/cabeceras.php');

  test('no exige autenticación — lo consume cualquier visitante en cada carga', () => {
    assert.doesNotMatch(php, /require_write_access|require_auth/);
  });

  test('solo responde GET', () => {
    assert.match(php, /if \(\$method !== 'GET'\)/);
  });

  test('usa get_pdo() y degrada al JSON local si la BD no responde', () => {
    assert.match(php, /get_pdo\(\)/);
    assert.match(php, /cabeceras\.json/);
  });
});

describe('pagbateria/backend/data/cabeceras.json — respaldo sin BD', () => {
  const json = JSON.parse(leer('pagbateria/backend/data/cabeceras.json'));

  test('trae los 4 bloques de cabecera original, cada uno con titulo y bajada', () => {
    for (const pagina of PAGINAS) {
      assert.ok(json[pagina]?.titulo, `falta titulo para "${pagina}"`);
      assert.ok(json[pagina]?.bajada, `falta bajada para "${pagina}"`);
    }
  });

  test('los valores por defecto son justo los textos que ya están en el HTML hoy', () => {
    assert.equal(json.catalogo.titulo, 'Baterías con instalación incluida');
    assert.equal(json.servicios.titulo, 'Todo lo que hacemos, donde estés');
    assert.equal(json.cobertura.titulo, 'Lima Metropolitana y Callao');
    assert.equal(json.contacto.titulo, 'Hablemos');
  });

  test('trae los 3 bloques nuevos — inicio-franja no lleva bajada (una sola línea)', () => {
    assert.ok(json['servicios-trabajo']?.titulo);
    assert.ok(json['servicios-trabajo']?.bajada);
    assert.ok(json['inicio-franja']?.titulo);
    assert.equal(json['inicio-franja'].bajada, null);
    assert.ok(json['inicio-catalogo']?.titulo);
    assert.ok(json['inicio-catalogo']?.bajada);
  });
});

describe('cabeceras-config.js — mejora progresiva en el sitio público', () => {
  const codigo = leer('pagbateria/public/assets/js/lib/cabeceras-config.js');

  test('si no hay ningún [data-cabecera-rol] en la página, no pide nada', () => {
    assert.match(codigo, /if \(nodos\.length === 0\) return;/);
  });

  test('un fetch fallido no rompe nada — el texto se queda con el del HTML', () => {
    assert.match(codigo, /try\s*\{[\s\S]*?catch[\s\S]*?return;/);
  });

  test('solo reemplaza el texto cuando hay un valor real', () => {
    assert.match(codigo, /if \(valor\) nodo\.textContent = valor;/);
  });

  test('no tiene ninguna lista de páginas hardcodeada — cualquier data-cabecera-rol se resuelve solo', () => {
    assert.doesNotMatch(codigo, /'catalogo'|'servicios'|'cobertura'|'contacto'/);
  });
});

describe('main.js arranca aplicarCabeceras', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama aplicarCabeceras', () => {
    assert.match(codigo, /import \{ aplicarCabeceras \} from '\.\/lib\/cabeceras-config\.js';/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero el valor por defecto y luego el editado (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?aplicarCabeceras\(\)[\s\S]*?\]\)/);
  });
});

describe('Las páginas llevan su data-cabecera-rol', () => {
  const paginas = {
    'pagbateria/public/catalogo.html': 'catalogo',
    'pagbateria/public/servicios.html': 'servicios',
    'pagbateria/public/cobertura.html': 'cobertura',
    'pagbateria/public/contacto.html': 'contacto',
  };

  for (const [pagina, slug] of Object.entries(paginas)) {
    const html = leer(pagina);
    test(`${pagina} — título y bajada llevan data-cabecera-rol="${slug}-*"`, () => {
      assert.match(html, new RegExp(`data-cabecera-rol="${slug}-titulo"`));
      assert.match(html, new RegExp(`data-cabecera-rol="${slug}-bajada"`));
    });
  }

  test('servicios.html — "Cómo trabajamos" también lleva su data-cabecera-rol', () => {
    const html = leer('pagbateria/public/servicios.html');
    assert.match(html, /data-cabecera-rol="servicios-trabajo-titulo"/);
    assert.match(html, /data-cabecera-rol="servicios-trabajo-bajada"/);
  });

  test('index.html — franja "Sin sorpresas" y "Nuestro catálogo" llevan su data-cabecera-rol', () => {
    const html = leer('pagbateria/public/index.html');
    assert.match(html, /data-cabecera-rol="inicio-franja-titulo"/);
    assert.match(html, /data-cabecera-rol="inicio-catalogo-titulo"/);
    assert.match(html, /data-cabecera-rol="inicio-catalogo-bajada"/);
    // El <noscript> debe revelar estos nodos igual que en las otras páginas.
    assert.match(html, /<noscript><style>[^<]*\[data-cabecera-rol\]/);
  });

  test('la franja "Sin sorpresas" ya NO tiene <em> — aplicarCabeceras() pisa el nodo entero con textContent, y el JSON respaldo ya trae un valor real desde la primera carga: con <em> adentro, el énfasis se perdía en cuanto la API contestaba (que es siempre)', () => {
    const html = leer('pagbateria/public/index.html');
    const inicio = html.indexOf('data-cabecera-rol="inicio-franja-titulo"');
    const fin = html.indexOf('</p>', inicio);
    const bloque = html.slice(inicio, fin);
    assert.doesNotMatch(bloque, /<em>/);
    const css = leer('pagbateria/public/assets/css/v2/sections.css');
    assert.doesNotMatch(css, /\.franja-marca__titulo em/);
  });

  test('nosotros.html NO lleva data-cabecera-rol — tiene su propio sistema (nosotros.php)', () => {
    assert.doesNotMatch(leer('pagbateria/public/nosotros.html'), /data-cabecera-rol/);
  });
});

describe('Panel admin — pestaña "Cabeceras"', () => {
  const html = leer('adminbateria/index.html');
  const js = leer('adminbateria/assets/js/admin.js');

  test('existe la pestaña con los campos de los 7 bloques y botón de guardar', () => {
    assert.match(html, /data-tab="cabeceras"/);
    assert.match(html, /id="tab-cabeceras"/);
    for (const bloque of PAGINAS) {
      assert.match(html, new RegExp(`id="cab${cap(bloque)}Titulo"`), `falta el input de título para ${bloque}`);
      assert.match(html, new RegExp(`id="cab${cap(bloque)}Bajada"`), `falta el input de bajada para ${bloque}`);
    }
    assert.match(html, /id="cabServiciosTrabajoTitulo"/);
    assert.match(html, /id="cabServiciosTrabajoBajada"/);
    assert.match(html, /id="cabInicioFranjaTitulo"/);
    assert.match(html, /id="cabInicioCatalogoTitulo"/);
    assert.match(html, /id="cabInicioCatalogoBajada"/);
    assert.match(html, /id="btnSaveCabeceras"/);
  });

  test('admin.js define loadCabeceras/bindCabeceras y las arranca en el init', () => {
    assert.match(js, /function loadCabeceras\(\)/);
    assert.match(js, /function bindCabeceras\(\)/);
    assert.match(js, /loadCabeceras\(\); bindCabeceras\(\);/);
  });

  test('CABECERAS_PAGINAS incluye los 7 bloques, capCabecera arma bien el id de slugs con guion', () => {
    assert.match(js, /const CABECERAS_PAGINAS = \[[^\]]*'servicios-trabajo'[^\]]*'inicio-franja'[^\]]*'inicio-catalogo'[^\]]*\]/);
    assert.match(js, /const capCabecera = \(s\) => s\.split\('-'\)/);
  });

  test('bindCabeceras guarda cada bloque con su propio PUT — el endpoint no acepta un lote', () => {
    // Ventana amplia: el bloque incluye comentarios y manejo de errores por
    // página (no todo-o-nada). El test valida el mecanismo, no el número exacto
    // de líneas.
    const inicio = js.indexOf('function bindCabeceras');
    const fin = js.indexOf('\n}\n', inicio);
    const bloque = js.slice(inicio, fin);
    assert.match(bloque, /for \(const pagina of CABECERAS_PAGINAS\)/);
    assert.match(bloque, /jput\('\/cabeceras\.php', \{ pagina, titulo, bajada \}\)/);
  });

  test('bindCabeceras muestra el error real del servidor y sigue con las demás si una falla', () => {
    const inicio = js.indexOf('function bindCabeceras');
    const fin = js.indexOf('\n}\n', inicio);
    const bloque = js.slice(inicio, fin);
    // El bucle no aborta al primer error: cada PUT tiene su propio try/catch.
    assert.match(bloque, /try\s*\{[\s\S]*?await jput\([\s\S]*?catch/);
    // Y el status final incluye el mensaje real de la excepción, no un genérico.
    assert.match(bloque, /e\?\.message/);
  });
});
