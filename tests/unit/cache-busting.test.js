/**
 * Guarda contra el bug que rompió el sitio para visitantes con el Service
 * Worker viejo: HTML nuevo servido con CSS vieja, que dejaba los SVG sin
 * tamaño (íconos gigantes ocupando la pantalla completa).
 *
 * Dos invariantes que, si se rompen, reproducen el fallo:
 *   1. Todas las páginas piden los assets con el MISMO `?v=`.
 *   2. El Service Worker precachea ESE mismo `?v=` (si no, el modo offline
 *      guarda archivos que ninguna página pide y queda sin estilos).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (p) => readFileSync(p, 'utf8');

const PAGINAS = [
  'index', 'catalogo', 'servicios', 'cobertura',
  'nosotros', 'contacto', 'cookies', 'aviso-legal', 'privacidad',
];
const HOJAS = ['tokens', 'base', 'nav', 'layout', 'components', 'sections'];

const sw = leer('pagbateria/public/sw.js');
const main = leer('pagbateria/public/assets/js/main.js');

/** La versión declarada en el Service Worker manda. */
const versionSw = sw.match(/const ASSET_V = '(\d+)'/)?.[1];

describe('Versionado de assets — HTML y Service Worker en sincronía', () => {
  test('sw.js declara ASSET_V', () => {
    assert.ok(versionSw, 'sw.js debe declarar const ASSET_V');
  });

  for (const p of PAGINAS) {
    test(`${p}.html pide las 6 hojas y main.js con ?v=${versionSw}`, () => {
      const html = leer(`pagbateria/public/${p}.html`);
      for (const hoja of HOJAS) {
        assert.ok(
          html.includes(`assets/css/v2/${hoja}.css?v=${versionSw}`),
          `${p}.html no pide ${hoja}.css con ?v=${versionSw}`,
        );
      }
      assert.ok(
        html.includes(`assets/js/main.js?v=${versionSw}`),
        `${p}.html no pide main.js con ?v=${versionSw}`,
      );
    });
  }

  test('el SHELL del Service Worker precachea las hojas versionadas', () => {
    for (const hoja of HOJAS) {
      assert.match(
        sw,
        new RegExp(`assets/css/v2/${hoja}\\.css\\?v=\\$\\{ASSET_V\\}`),
        `el SHELL no precachea ${hoja}.css versionada`,
      );
    }
  });

  test('la caché del SW se renombra al cambiar de versión', () => {
    assert.match(sw, /const VERSION = 'v\d+'/);
    assert.match(sw, /ctb-shell-\$\{VERSION\}/);
    assert.match(sw, /!k\.endsWith\(VERSION\)/, 'activate debe borrar las cachés de versiones viejas');
  });
});

describe('Estrategia del Service Worker', () => {
  test('los estáticos van por RED primero, nunca caché primero', () => {
    // El patrón viejo (`return cacheada ?? desdeRed`) servía CSS vieja tras
    // cada despliegue. No debe volver.
    assert.doesNotMatch(
      sw,
      /return cacheada \?\? desdeRed/,
      'los estáticos volvieron a caché-primero: reintroduce el bug de estilos viejos',
    );
    assert.match(sw, /fetch\(request, \{ cache: 'no-cache' \}\)/);
  });

  test('la API nunca se cachea', () => {
    assert.match(sw, /if \(esApi\(url\)\) return;/);
  });
});

describe('main.js — recarga una vez cuando el SW nuevo toma el control', () => {
  test('escucha controllerchange', () => {
    assert.match(main, /addEventListener\('controllerchange'/);
  });

  test('no recarga en la primera instalación ni entra en bucle', () => {
    assert.match(main, /habiaControlador/);
    assert.match(main, /yaRecargado/);
  });
});
