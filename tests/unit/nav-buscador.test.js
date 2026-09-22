/**
 * Verificación estática del buscador de la barra de navegación.
 *
 * El campo de búsqueda vivía dentro del catálogo: para buscar una batería
 * concreta había que llegar primero al catálogo. Ahora vive en la barra, en
 * todas las páginas, y despliega un panel con las baterías que coinciden
 * (foto, modelo, marca y precio).
 *
 * Igual que el resto de la suite, se verifica leyendo el código fuente: no hay
 * DOM en este entorno (ver upload-security.test.js para la misma convención).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS = [
  'index.html', 'catalogo.html', 'servicios.html', 'cobertura.html',
  'nosotros.html', 'contacto.html', 'cookies.html', 'aviso-legal.html', 'privacidad.html',
];

describe('El buscador está en la barra, en todas las páginas', () => {
  for (const pagina of PAGINAS) {
    const html = leer(`pagbateria/public/${pagina}`);

    test(`${pagina} — lleva el formulario de búsqueda en la barra`, () => {
      assert.match(html, /<form class="nav__search"[^>]*data-testid="nav-search"/);
    });

    test(`${pagina} — el formulario es un GET real a catalogo.html`, () => {
      // Sin JavaScript el buscador debe seguir funcionando: es la diferencia
      // entre "no encuentro nada" y una página de catálogo filtrada.
      const form = html.match(/<form class="nav__search"[\s\S]*?>/)?.[0] ?? '';
      assert.match(form, /action="catalogo\.html"/);
      assert.match(form, /method="get"/);
      assert.match(html, /<input type="search" id="buscador-input" name="q"/);
    });

    test(`${pagina} — un solo id="buscador-input" (dos romperían el <label for>)`, () => {
      // El \s inicial es obligatorio: sin él, `data-testid="buscador-input"`
      // contiene la cadena `id="buscador-input"` y el conteo da 2 siempre.
      const veces = (html.match(/\sid="buscador-input"/g) ?? []).length;
      assert.equal(veces, 1, `${pagina} tiene ${veces} campos con el mismo id`);
    });

    test(`${pagina} — el campo se anuncia como combobox del panel de resultados`, () => {
      assert.match(html, /role="combobox"/);
      assert.match(html, /aria-controls="nav-search-panel"/);
      assert.match(html, /aria-autocomplete="list"/);
      // El destino del aria-controls tiene que existir en la misma página.
      assert.match(html, /id="nav-search-panel"[^>]*/);
    });

    test(`${pagina} — el panel arranca oculto y con rol de listbox`, () => {
      const panel = html.match(/<div class="nav__search-panel"[\s\S]*?>/)?.[0] ?? '';
      assert.match(panel, /role="listbox"/);
      assert.match(panel, /hidden/);
    });
  }
});

describe('catalogo.html — el buscador viejo ya no está duplicado', () => {
  const html = leer('pagbateria/public/catalogo.html');

  test('no queda el bloque .buscador dentro del contenido', () => {
    // Dos campos de búsqueda en la misma página (uno en la barra y otro en el
    // cuerpo) es la clase de duplicado que deja al usuario escribiendo en el
    // que no filtra.
    assert.doesNotMatch(html, /class="buscador"/);
    assert.doesNotMatch(html, /class="buscador__input"/);
  });

  test('el conteo de resultados se quitó: flotaba suelto sobre la foto, desconectado de la tarjeta del buscador', () => {
    assert.doesNotMatch(html, /data-testid="buscador-conteo"/);
  });

  test('no repite el encabezado "Catálogo" dos veces', () => {
    // La cabecera de página ya dice Catálogo; un segundo section-head con el
    // mismo eyebrow era el desorden que se reportó.
    const veces = (html.match(/class="eyebrow">Catálogo</g) ?? []).length;
    assert.equal(veces, 1, `aparece ${veces} veces el eyebrow "Catálogo"`);
  });

  test('el buscador por vehículo va centrado y acotado, no pegado a la izquierda', () => {
    assert.match(html, /class="finder finder--catalogo"/);
    const css = leer('pagbateria/public/assets/css/v2/sections.css');
    const bloque = css.match(/\.finder--catalogo\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(bloque, /margin-inline:\s*auto/);
  });
});

describe('search-panel.js — panel de resultados con foto', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/search-panel.js');

  test('pide el catálogo una sola vez y filtra en memoria', () => {
    // Una consulta al servidor por cada tecla sería pedir 77 productos que ya
    // están en memoria.
    assert.match(codigo, /function asegurarCatalogo/);
    assert.match(codigo, /if \(catalogo\) return Promise\.resolve\(\);/);
    assert.match(codigo, /if \(cargando\) return cargando;/);
  });

  test('reintenta si la primera carga falló, en vez de quedarse muerto', () => {
    assert.match(codigo, /catalogo = r\.ok \? r\.data : null;/);
  });

  test('cada fila muestra foto, nombre, marca y precio', () => {
    assert.match(codigo, /class="nav__search-foto"/);
    assert.match(codigo, /class="nav__search-item-nombre"/);
    assert.match(codigo, /class="nav__search-item-marca"/);
    assert.match(codigo, /class="nav__search-item-precio"/);
    assert.match(codigo, /formatearPrecio\(p\.price\)/);
  });

  test('sin foto cargada, pinta un recuadro y no un <img> roto', () => {
    assert.match(codigo, /nav__search-foto--vacia/);
    assert.match(codigo, /p\.image\s*\n?\s*\?/);
  });

  test('cada resultado es un enlace real, no un div con onclick', () => {
    // Un <a href> soporta clic central, "abrir en pestaña nueva" y el teclado
    // sin escribir una línea extra.
    assert.match(codigo, /<a class="nav__search-item"[\s\S]*?href="catalogo\.html\?q=\$\{encodeURIComponent/);
  });

  test('todo lo que viene de la API pasa por esc()', () => {
    // name, brand e image los edita el panel admin: son datos ajenos al
    // código y van directo a innerHTML.
    assert.match(codigo, /esc\(p\.name\)/);
    assert.match(codigo, /esc\(p\.brand\)/);
    assert.match(codigo, /esc\(p\.image\)/);
    // También el término que escribe el visitante, en el estado vacío.
    assert.match(codigo, /Sin coincidencias para "\$\{esc\(entrada\.value\.trim\(\)\)\}"/);
  });

  test('espera a que el usuario deje de escribir antes de filtrar', () => {
    assert.match(codigo, /const ESPERA_MS = \d+;/);
    assert.match(codigo, /window\.clearTimeout\(temporizador\)/);
  });

  test('exige un mínimo de letras y acota los resultados', () => {
    // Con una sola letra, "e" devuelve casi el catálogo completo.
    assert.match(codigo, /const MINIMO_LETRAS = [2-9];/);
    assert.match(codigo, /const MAX_RESULTADOS = \d+;/);
    assert.match(codigo, /\.slice\(0, MAX_RESULTADOS\)/);
  });

  test('la búsqueda ignora tildes y mayúsculas', () => {
    assert.match(codigo, /\.toLowerCase\(\)/);
    assert.match(codigo, /\.normalize\('NFD'\)/);
    assert.match(codigo, /codigo < 0x300 \|\| codigo > 0x36f/);
  });

  test('se maneja con teclado: flechas, Enter y Escape', () => {
    assert.match(codigo, /e\.key === 'Escape'/);
    assert.match(codigo, /e\.key === 'ArrowDown'/);
    assert.match(codigo, /e\.key === 'ArrowUp'/);
    assert.match(codigo, /e\.key === 'Enter'/);
    assert.match(codigo, /aria-activedescendant/);
  });

  test('anuncia el estado del desplegable con aria-expanded', () => {
    assert.match(codigo, /setAttribute\('aria-expanded', 'true'\)/);
    assert.match(codigo, /setAttribute\('aria-expanded', 'false'\)/);
  });

  test('un clic fuera lo cierra', () => {
    assert.match(codigo, /document\.addEventListener\('click'/);
    assert.match(codigo, /formulario\.contains\(destino\)/);
  });
});

describe('catalog.js — en el catálogo el buscador filtra sin recargar', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/catalog.js');

  test('toma el término inicial de ?q= en la URL', () => {
    // Es lo que hace que llegar desde otra página (o recargar, o compartir el
    // enlace) muestre el catálogo ya filtrado.
    assert.match(codigo, /new URLSearchParams\(location\.search\)\.get\('q'\)/);
  });

  test('intercepta el envío del formulario para no recargar la misma página', () => {
    assert.match(codigo, /formulario\?\.addEventListener\('submit'/);
    assert.match(codigo, /e\.preventDefault\(\);/);
  });

  test('refleja el término en la URL sin apilar historial', () => {
    const bloque = codigo.slice(codigo.indexOf('function actualizarUrlBusqueda'));
    assert.match(bloque, /history\.replaceState/);
    assert.match(bloque, /url\.searchParams\.set\('q'/);
    assert.match(bloque, /url\.searchParams\.delete\('q'\)/);
  });
});

describe('main.js — el buscador de marca de la landing se fue', () => {
  const codigo = leer('pagbateria/public/assets/js/main.js');

  test('ya no existe initBuscadorLanding', () => {
    // La sección "Elige tu marca y mira el catálogo" no cumplía ninguna
    // función que el buscador de la barra no cubra mejor.
    assert.doesNotMatch(codigo, /initBuscadorLanding/);
  });

  test('arranca el panel de resultados', () => {
    assert.match(codigo, /import \{ initBuscadorPanel \} from '\.\/ui\/search-panel\.js';/);
    assert.match(codigo, /initBuscadorPanel\(\);/);
  });

  test('no queda importado fetchMarcas sin usar', () => {
    const importa = /import \{[^}]*fetchMarcas[^}]*\} from '\.\/lib\/catalog-api\.js'/.test(codigo);
    const usa = /fetchMarcas\(/.test(codigo);
    assert.equal(importa, usa, 'fetchMarcas se importa pero ya no se usa');
  });
});
