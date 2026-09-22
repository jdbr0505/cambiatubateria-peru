/**
 * Pruebas de generación de enlaces de navegación.
 *
 * Un enlace mal formado no rompe la página: manda al técnico a otro lugar.
 * Por eso estas pruebas verifican el contenido exacto de cada URL, no solo
 * que exista.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNavigationLinks,
  buildNavigationMessageBlock,
  areValidCoordinates,
  detectPlatform,
  getOrderedNavigationApps,
} from '../../../pagbateria/public/assets/js/geo/navigation-links.js';

// San Isidro, Lima.
const LAT = -12.0977;
const LNG = -77.0365;

describe('Validación de coordenadas', () => {
  test('acepta coordenadas válidas de Lima', () => {
    assert.equal(areValidCoordinates(LAT, LNG), true);
  });

  test('rechaza valores fuera de rango', () => {
    assert.equal(areValidCoordinates(91, 0), false, 'latitud > 90');
    assert.equal(areValidCoordinates(-91, 0), false, 'latitud < -90');
    assert.equal(areValidCoordinates(0, 181), false, 'longitud > 180');
    assert.equal(areValidCoordinates(0, -181), false, 'longitud < -180');
  });

  test('rechaza NaN, Infinity y no-números', () => {
    assert.equal(areValidCoordinates(NaN, LNG), false);
    assert.equal(areValidCoordinates(LAT, Infinity), false);
    assert.equal(areValidCoordinates('−12.09', LNG), false, 'strings no son válidos');
    assert.equal(areValidCoordinates(null, null), false);
    assert.equal(areValidCoordinates(undefined, undefined), false);
  });

  test('rechaza (0,0) — indica GPS fallido, no una ubicación real', () => {
    assert.equal(areValidCoordinates(0, 0), false);
  });
});

describe('Construcción de enlaces', () => {
  test('retorna null ante coordenadas inválidas en vez de un enlace erróneo', () => {
    assert.equal(buildNavigationLinks(0, 0), null);
    assert.equal(buildNavigationLinks(NaN, LNG), null);
    assert.equal(buildNavigationLinks(999, 999), null);
  });

  test('Google Maps usa la URL API oficial en modo navegación', () => {
    const links = buildNavigationLinks(LAT, LNG);

    assert.match(links.googleMapsNav, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
    assert.match(links.googleMapsNav, /destination=-12\.0977%2C-77\.0365/);
    assert.match(links.googleMapsNav, /travelmode=driving/);
  });

  test('Waze usa el enlace universal, no el esquema waze://', () => {
    const links = buildNavigationLinks(LAT, LNG);

    assert.match(links.wazeNav, /^https:\/\/waze\.com\/ul\?/);
    assert.doesNotMatch(links.wazeNav, /^waze:\/\//, 'waze:// falla en silencio sin la app');
    assert.match(links.wazeNav, /navigate=yes/, 'sin navigate=yes solo muestra el punto');
  });

  test('el pin es distinto del enlace de navegación', () => {
    const links = buildNavigationLinks(LAT, LNG);

    assert.match(links.pin, /maps\/search\//, 'el pin solo muestra ubicación');
    assert.match(links.googleMapsNav, /maps\/dir\//, 'la navegación inicia la ruta');
    assert.notEqual(links.pin, links.googleMapsNav);
  });

  test('acepta modo de traslado personalizado', () => {
    const links = buildNavigationLinks(LAT, LNG, { travelMode: 'motorcycle' });
    assert.match(links.googleMapsNav, /travelmode=motorcycle/);
  });

  test('la URI geo incluye etiqueta legible del destino', () => {
    const links = buildNavigationLinks(LAT, LNG, { label: 'Cliente varado' });

    assert.match(links.geoUri, /^geo:-12\.0977,-77\.0365/);
    assert.match(links.geoUri, /Cliente%20varado/);
  });

  test('coordsText queda listo para dictar por teléfono', () => {
    const links = buildNavigationLinks(LAT, LNG);
    assert.equal(links.coordsText, '-12.0977,-77.0365');
  });
});

describe('Formato numérico', () => {
  test('recorta a 6 decimales sin notación científica', () => {
    const links = buildNavigationLinks(-12.097712345678, -77.036512345678);

    assert.equal(links.coordsText, '-12.097712,-77.036512');
    assert.doesNotMatch(links.coordsText, /e[+-]/i);
  });

  test('elimina ceros finales innecesarios', () => {
    const links = buildNavigationLinks(-12.5, -77.25);
    assert.equal(links.coordsText, '-12.5,-77.25');
  });

  test('usa punto decimal, nunca coma', () => {
    const links = buildNavigationLinks(LAT, LNG);

    // La coma separa lat de lng; no debe aparecer como separador decimal.
    assert.equal(links.coordsText.split(',').length, 2);
    assert.match(links.coordsText, /^-?\d+\.\d+,-?\d+\.\d+$/);
  });

  test('funciona con coordenadas muy pequeñas cerca del ecuador', () => {
    const links = buildNavigationLinks(0.000123, -0.000456);

    assert.ok(links, 'no debe confundirse con Null Island');
    assert.equal(links.coordsText, '0.000123,-0.000456');
  });
});

describe('Bloque de mensaje para WhatsApp', () => {
  test('incluye Google Maps y Waze por defecto', () => {
    const bloque = buildNavigationMessageBlock(buildNavigationLinks(LAT, LNG));

    assert.match(bloque, /Google Maps: https/);
    assert.match(bloque, /Waze: https/);
    assert.doesNotMatch(bloque, /Apple Maps/, 'Apple Maps es opcional');
  });

  test('agrega Apple Maps solo si se solicita', () => {
    const bloque = buildNavigationMessageBlock(buildNavigationLinks(LAT, LNG), {
      includeAppleMaps: true,
    });

    assert.match(bloque, /Apple Maps: https/);
  });

  test('cada enlace ocupa su propia línea para que WhatsApp los haga clicables', () => {
    const bloque = buildNavigationMessageBlock(buildNavigationLinks(LAT, LNG));
    const lineas = bloque.split('\n').filter(Boolean);

    assert.equal(lineas.length, 2);
    lineas.forEach((linea) => {
      assert.equal((linea.match(/https/g) ?? []).length, 1, `una URL por línea: ${linea}`);
    });
  });
});

describe('Detección de plataforma y orden de apps', () => {
  afterEach(() => {
    delete globalThis.navigator;
  });

  function setUserAgent(userAgent, maxTouchPoints = 0) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent, maxTouchPoints },
      writable: true,
      configurable: true,
    });
  }

  test('detecta iPhone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    assert.equal(detectPlatform(), 'ios');
  });

  test('detecta iPad moderno, que se declara Macintosh', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
    assert.equal(detectPlatform(), 'ios');
  });

  test('no confunde una Mac de escritorio con iPad', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
    assert.equal(detectPlatform(), 'desktop');
  });

  test('detecta Android', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-G991B)');
    assert.equal(detectPlatform(), 'android');
  });

  test('en escritorio solo ofrece Google Maps', () => {
    const apps = getOrderedNavigationApps(buildNavigationLinks(LAT, LNG), 'desktop');

    assert.equal(apps.length, 1);
    assert.equal(apps[0].key, 'googleMaps');
  });

  test('en Android prioriza Waze', () => {
    const apps = getOrderedNavigationApps(buildNavigationLinks(LAT, LNG), 'android');

    assert.equal(apps[0].key, 'waze');
    assert.equal(apps.length, 2);
  });

  test('en iOS incluye Apple Maps al final', () => {
    const apps = getOrderedNavigationApps(buildNavigationLinks(LAT, LNG), 'ios');

    assert.equal(apps.length, 3);
    assert.equal(apps.at(-1).key, 'appleMaps');
  });
});
