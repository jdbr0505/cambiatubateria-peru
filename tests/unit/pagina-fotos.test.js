/**
 * Verificación estática de "Fotos de página": la pestaña del panel admin que
 * reemplaza a "Vehículos Premium" (premium.html ya no existe) y que por fin
 * conecta las fotos del sitio público con algo editable desde el panel — antes
 * reemplazar una foto exigía tocar el HTML a mano.
 *
 * Sin DOM real en este entorno — se lee el código fuente, misma convención
 * que el resto de la suite (ver upload-security.test.js).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const SLOTS = ['hero', 'catalogo', 'servicios', 'cobertura', 'nosotros', 'contacto'];

describe('adminbateria/backend/api/pagina_fotos.php — escritura, con sesión', () => {
  const php = leer('adminbateria/backend/api/pagina_fotos.php');

  test('exige sesión y CSRF, como el resto de endpoints admin', () => {
    assert.match(php, /require_write_access\(\);/);
  });

  test('usa db(), no get_pdo() — este es el backend admin, no el público', () => {
    // La distinción de los dos backends es a propósito (ver docs/HANDOFF.md): mezclar
    // get_pdo() (degrada) con db() (lanza) convierte errores capturados en
    // fatales para el que no corresponde.
    assert.match(php, /\$pdo = db\(\);/);
  });

  test('valida el slug contra la lista fija de slots — no acepta cualquier valor', () => {
    for (const slot of SLOTS) {
      assert.match(php, new RegExp(`'${slot}'`), `falta el slot "${slot}" en SLOTS`);
    }
    assert.match(php, /in_array\(\$slug, SLOTS, true\)/);
  });

  test('el upsert usa ON DUPLICATE KEY UPDATE, no borra e inserta', () => {
    assert.match(php, /ON DUPLICATE KEY UPDATE/);
  });

  test('crea la tabla si no existe, mismo patrón CREATE TABLE IF NOT EXISTS del resto de endpoints admin', () => {
    assert.match(php, /CREATE TABLE IF NOT EXISTS pagina_fotos/);
  });
});

describe('pagbateria/backend/api/pagina_fotos.php — lectura pública, sin sesión', () => {
  const php = leer('pagbateria/backend/api/pagina_fotos.php');

  test('no exige autenticación — lo consume cualquier visitante en cada carga', () => {
    assert.doesNotMatch(php, /require_write_access|require_auth/);
  });

  test('solo responde GET', () => {
    assert.match(php, /if \(\$method !== 'GET'\)/);
  });

  test('usa get_pdo() y degrada al JSON local si la BD no responde', () => {
    assert.match(php, /get_pdo\(\)/);
    assert.match(php, /pagina_fotos\.json/);
  });
});

describe('pagbateria/backend/data/pagina_fotos.json — respaldo sin BD', () => {
  const json = JSON.parse(leer('pagbateria/backend/data/pagina_fotos.json'));

  test('trae los 6 slots, cada uno con path y alt', () => {
    for (const slot of SLOTS) {
      assert.ok(json[slot]?.path, `falta path para "${slot}"`);
      assert.ok(json[slot]?.alt, `falta alt para "${slot}"`);
    }
  });

  test('los valores por defecto son justo las fotos que ya están en el HTML hoy — un', () => {
    // reemplazo sin efecto visible si la BD nunca llega a tener datos propios.
    assert.match(json.hero.path, /hero-instalacion\.jpg$/);
    assert.match(json.catalogo.path, /hero-instalacion\.jpg$/); // misma foto de la portada por defecto
    assert.match(json.servicios.path, /servicios-instalacion\.jpg$/);
    assert.match(json.cobertura.path, /cobertura-lima\.jpg$/);
    assert.match(json.nosotros.path, /nosotros-equipo\.jpg$/);
    assert.match(json.contacto.path, /nosotros-equipo\.jpg$/); // reutilizada, ver contacto.html
  });
});

describe('upload.php — nuevo tipo "pagina" para las fotos de página', () => {
  const php = leer('adminbateria/backend/api/upload.php');

  test("el mapa de tipos incluye 'pagina' apuntando a assets/img/optimizadas/", () => {
    assert.match(php, /'pagina' => __DIR__ \. '\/\.\.\/\.\.\/\.\.\/pagbateria\/public\/assets\/img\/optimizadas\/'/);
  });

  test('el mensaje de error incluye el nuevo tipo', () => {
    assert.match(php, /pagina/);
  });
});

describe('pagina-fotos.js — mejora progresiva en el sitio público', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/pagina-fotos.js');

  test('si no hay ningún [data-foto-slug] en la página, no pide nada', () => {
    assert.match(codigo, /if \(nodos\.length === 0\) return;/);
  });

  test('un fetch fallido no rompe nada — el <img> se queda con su src del HTML', () => {
    assert.match(codigo, /try\s*\{[\s\S]*?catch[\s\S]*?return;/);
  });

  test('solo reemplaza el src cuando el slot tiene un path real', () => {
    assert.match(codigo, /if \(!entrada\?\.path\) return;/);
    assert.match(codigo, /nodo\.src = entrada\.path;/);
  });

  test('si el path de la API es la MISMA foto que ya trae el HTML (misma base, distinta ruta), no toca .src — reportado por el usuario: parpadeo visible en Nosotros y Contacto', () => {
    // pagina_fotos.php guarda rutas absolutas ("/pagbateria/public/assets/img/...")
    // mientras el HTML trae rutas relativas ("assets/img/..."). El .htaccess hace
    // que las dos sirvan el mismo archivo, pero como strings de URL son distintas:
    // reasignar nodo.src sin comparar primero aborta la descarga en curso y arranca
    // otra por la ruta nueva — mismo píxel final, parpadeo real en el camino. La
    // comparación por "stem" (nombre base, sin ruta ni sufijo de tamaño) debe
    // aplicar SIEMPRE, no solo cuando el nodo tiene srcset (antes solo el hero).
    const inicio = codigo.indexOf('const stem = ');
    assert.ok(inicio !== -1, 'falta la función stem() de comparación');
    const finForEach = codigo.indexOf('nodos.forEach');
    const cuerpo = codigo.slice(finForEach);
    assert.match(cuerpo, /if \(stem\(entrada\.path\) === stem\(nodo\.getAttribute\('src'\) \|\| ''\)\) return;/);
    // Esa comparación debe estar ANTES del `if (nodo.srcset)`, no adentro — si no,
    // vuelve a aplicar solo al hero y el bug reaparece en el resto de fotos.
    const iStem = cuerpo.indexOf('if (stem(entrada.path)');
    const iSrcset = cuerpo.indexOf('if (nodo.srcset)');
    assert.ok(iStem !== -1 && iSrcset !== -1 && iStem < iSrcset, 'la comparación stem debe aplicarse antes del branch de srcset, a TODAS las fotos');
  });

  test('cuando la foto SÍ cambia, espera a que termine de cargar antes de resolver — reportado otra vez, con BD real: la sección se revelaba con la foto nueva a medio bajar', () => {
    // Sin BD local, la foto nunca cambia de verdad (siempre coincide con el
    // default por el fix de arriba) — este bug solo se reproducía en
    // producción, con una foto real distinta subida desde el panel. La
    // promesa de initPaginaFotos() resolvía en cuanto se asignaba .src, sin
    // esperar el evento load — revelarContenidoEditable() quitaba
    // visibility:hidden con la descarga todavía en curso.
    const finForEach = codigo.indexOf('nodos.forEach');
    const cuerpo = codigo.slice(finForEach);
    assert.match(cuerpo, /cargas\.push\(new Promise/);
    assert.match(cuerpo, /addEventListener\('load', \(\) => resolve\(\), \{ once: true \}\)/);
    assert.match(cuerpo, /addEventListener\('error', \(\) => resolve\(\), \{ once: true \}\)/);
    // El push() del load-listener debe ir ANTES de asignar nodo.src — si no,
    // el evento 'load' puede dispararse (con la foto en caché del navegador)
    // antes de que el listener exista, y la promesa nunca resuelve.
    const iPush = cuerpo.indexOf('cargas.push');
    const iSrcAssign = cuerpo.indexOf('nodo.src = entrada.path;');
    assert.ok(iPush !== -1 && iSrcAssign !== -1 && iPush < iSrcAssign, 'el listener debe registrarse antes de asignar nodo.src');
    assert.match(codigo, /await Promise\.allSettled\(cargas\);/);
  });
});

describe('base.css — TODAS las fotos de página se ocultan hasta cargar el valor real, hero incluido', () => {
  test('[data-foto-slug] ya no excluye "hero" — el jefe confirmó que el parpadeo seguía viéndose ahí también', () => {
    const css = leer('pagbateria/public/assets/css/v2/base.css');
    // Acota a la regla real (selectores hasta "visibility: hidden;"), no al
    // comentario de arriba, que sí menciona "hero" a propósito al explicar
    // la decisión anterior.
    const inicio = css.indexOf(':root:not([data-contenido-listo]) [data-hero-rol]');
    const fin = css.indexOf('visibility: hidden;', inicio);
    const regla = css.slice(inicio, fin);
    assert.match(regla, /\[data-foto-slug\],/, 'debe ocultar TODOS los data-foto-slug, sin :not([data-foto-slug="hero"])');
    assert.doesNotMatch(regla, /data-foto-slug="hero"/, 'ya no debe quedar la exclusión del hero en la regla de ocultamiento');
  });

  test('index.html — el <noscript> revela [data-foto-slug] igual que el resto (incluye la foto del hero)', () => {
    const html = leer('pagbateria/public/index.html');
    const noscript = html.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0] ?? '';
    assert.match(noscript, /\[data-foto-slug\]/);
  });
});

describe('main.js arranca initPaginaFotos', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('importa y llama initPaginaFotos', () => {
    assert.match(codigo, /import \{ initPaginaFotos \} from '\.\/ui\/pagina-fotos\.js';/);
    // Entra al arranque dentro de revelarContenidoEditable([...]) — main.js
    // oculta por CSS su contenido hasta que esa promesa resuelve, para no
    // mostrar primero la foto por defecto y luego la editada (parpadeo).
    assert.match(codigo, /revelarContenidoEditable\(\[[\s\S]*?initPaginaFotos\(\)[\s\S]*?\]\)/);
  });
});

describe('Los <img> del sitio público llevan su data-foto-slug', () => {
  const paginas = {
    'pagbateria/public/index.html': ['hero'],
    'pagbateria/public/catalogo.html': ['catalogo'],
    'pagbateria/public/servicios.html': ['servicios'],
    'pagbateria/public/cobertura.html': ['cobertura'],
    'pagbateria/public/nosotros.html': ['nosotros'],
    'pagbateria/public/contacto.html': ['contacto'],
  };

  for (const [pagina, slots] of Object.entries(paginas)) {
    const html = leer(pagina);
    for (const slot of slots) {
      test(`${pagina} — tiene data-foto-slug="${slot}"`, () => {
        assert.match(html, new RegExp(`data-foto-slug="${slot}"`));
      });
    }
  }
});

describe('Panel admin — "Vehículos Premium" reemplazado por "Fotos de página"', () => {
  const html = leer('adminbateria/index.html');
  const js = leer('adminbateria/assets/js/admin.js');

  test('ya no queda ningún rastro de la pestaña Premium en el HTML', () => {
    assert.doesNotMatch(html, /tab-vehiculos|vehiclesGrid|Vehículos Premium|vehMarca|vehTitulo|vehImagen/);
  });

  test('ya no queda ninguna función de Vehículos Premium en el JS', () => {
    assert.doesNotMatch(js, /loadVehicles|renderVehicles|bindVehicles|vehiculos_primun|ensureVehActivoInline/);
  });

  test('el endpoint vehiculos_primun.php ya no existe', () => {
    assert.throws(() => leer('adminbateria/backend/api/vehiculos_primun.php'));
  });

  test('existe la nueva pestaña "Fotos" con su grid y botón de actualizar', () => {
    assert.match(html, /data-tab="fotos"/);
    assert.match(html, /id="tab-fotos"/);
    assert.match(html, /id="fotosGrid"/);
    assert.match(html, /id="btnFotosRefresh"/);
  });

  test('admin.js define los 6 slots y las funciones loadFotos/renderFotos/bindFotos', () => {
    assert.match(js, /const FOTOS_SLOTS = \[/);
    for (const slot of SLOTS) {
      assert.match(js, new RegExp(`slug: '${slot}'`), `falta el slot "${slot}" en FOTOS_SLOTS`);
    }
    assert.match(js, /function loadFotos\(\)/);
    assert.match(js, /function renderFotos\(items\)/);
    assert.match(js, /function bindFotos\(\)/);
  });

  test('la subida usa tipo=pagina, no tipo=vehiculo', () => {
    const bloque = js.slice(js.indexOf('const FOTOS_SLOTS'), js.indexOf('async function jget'));
    assert.match(bloque, /fd\.append\('tipo', 'pagina'\)/);
  });

  test('se arranca loadFotos()/bindFotos() en el init, no loadVehicles()', () => {
    assert.match(js, /loadFotos\(\); bindFotos\(\);/);
  });
});
