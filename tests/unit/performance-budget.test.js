/**
 * Puerta de rendimiento: pesa el bundle real contra el presupuesto.
 *
 * No es cosmético. El presupuesto de rendimiento (FCP < 0.8 s, carga < 1.2 s)
 * alimenta el Quality Score de Google Ads, que decide cuánto cuesta cada clic.
 * Una landing que engorda se paga en dinero todos los días. Este test corta
 * ese engorde antes de que llegue a producción, no después.
 *
 * Los límites están MUY por encima del tamaño actual a propósito: son un techo
 * que dispara una alarma temprana, no una meta ajustada. Si un cambio los roza,
 * es señal de que entró una dependencia pesada sin querer.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const RAIZ = 'pagbateria/public/assets';

/** @param {string[]} rutas */
function pesoGzip(rutas) {
  const juntos = rutas.map((r) => readFileSync(r)).join('\n');
  return gzipSync(Buffer.from(juntos), { level: 9 }).length;
}

/** @param {string} dir @param {RegExp} filtro */
function archivosDe(dir, filtro) {
  return readdirSync(dir).filter((f) => filtro.test(f)).map((f) => join(dir, f));
}

describe('Presupuesto de rendimiento (gzip)', () => {
  test('el CSS del sistema v2 no supera 30 KB', () => {
    const css = archivosDe(`${RAIZ}/css/v2`, /\.css$/);
    const kb = pesoGzip(css) / 1024;
    // Presupuesto web para landing: 30 KB de CSS comprimido.
    assert.ok(kb < 30, `CSS v2: ${kb.toFixed(1)} KB comprimido, límite 30 KB`);
  });

  test('el JavaScript de la interfaz no supera 60 KB', () => {
    const js = [
      `${RAIZ}/js/main.js`,
      ...archivosDe(`${RAIZ}/js/ui`, /\.js$/),
      ...archivosDe(`${RAIZ}/js/motion`, /\.js$/),
      ...archivosDe(`${RAIZ}/js/lib`, /\.js$/),
    ];
    const kb = pesoGzip(js) / 1024;
    // 60 KB deja margen amplio: hoy anda por 15. Sirve para atrapar una
    // librería pesada que entre por descuido.
    assert.ok(kb < 60, `JS interfaz: ${kb.toFixed(1)} KB comprimido, límite 60 KB`);
  });

  test('los módulos de geolocalización no superan 40 KB', () => {
    const geo = archivosDe(`${RAIZ}/js/geo`, /\.js$/);
    const kb = pesoGzip(geo) / 1024;
    assert.ok(kb < 40, `Geo: ${kb.toFixed(1)} KB comprimido, límite 40 KB`);
  });
});

describe('El bundle no arrastra dependencias pesadas', () => {
  test('ningún módulo importa una librería de node_modules', () => {
    // El sitio no tiene paso de compilación: un import de node_modules no se
    // resuelve en el navegador y rompería la página en producción.
    const dirs = ['js/main.js', 'js/ui', 'js/motion', 'js/lib'];
    const infractores = [];

    for (const d of dirs) {
      const ruta = join(RAIZ, d);
      const archivos = d.endsWith('.js') ? [ruta] : archivosDe(ruta, /\.js$/);
      for (const a of archivos) {
        const src = readFileSync(a, 'utf8');
        // import ... from 'algo' donde 'algo' no empieza por . ni /
        const bareImports = src.match(/from\s+['"]([^.\/][^'"]*)['"]/g) ?? [];
        if (bareImports.length > 0) infractores.push(`${a}: ${bareImports.join(', ')}`);
      }
    }

    assert.deepEqual(infractores, [], `imports sin resolver en el navegador:\n${infractores.join('\n')}`);
  });
});

describe('PWA lista para instalar', () => {
  test('el manifest declara los campos que exige la instalación', () => {
    const manifest = JSON.parse(readFileSync('pagbateria/public/manifest.webmanifest', 'utf8'));

    assert.ok(manifest.name, 'name es obligatorio');
    assert.ok(manifest.start_url, 'start_url es obligatorio');
    assert.equal(manifest.display, 'standalone', 'debe abrir como app, no como pestaña');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'al menos dos iconos');

    // Chrome exige un icono de 512 y uno maskable para el prompt de instalación.
    const tam = manifest.icons.map((i) => i.sizes);
    assert.ok(tam.includes('512x512'), 'falta el icono de 512x512');
    const maskable = manifest.icons.some((i) => String(i.purpose).includes('maskable'));
    assert.ok(maskable, 'falta un icono maskable, sin él Android recorta el logo');
  });

  test('el Service Worker no cachea la API', () => {
    const sw = readFileSync('pagbateria/public/sw.js', 'utf8');
    // Un precio o stock cacheado genera un reclamo real. La API queda fuera.
    assert.match(sw, /backend\/api/, 'debe reconocer las rutas de la API');
    assert.match(sw, /esApi|\/backend\/api\//, 'debe tener una guarda que excluya la API del cacheo');
  });

  test('existe la página offline con el teléfono visible', () => {
    const offline = readFileSync('pagbateria/public/offline.html', 'utf8');
    // El objetivo del modo offline es que el cliente varado siga pudiendo
    // llamar. Sin el enlace tel: la página offline no sirve de nada.
    assert.match(offline, /tel:\+?51/, 'la página offline debe tener un enlace de llamada');
  });

  test('el Service Worker pide los estáticos a la red antes que a la caché', () => {
    // Regresión real: con "caché primero", tras un despliegue el visitante
    // recibía el HTML nuevo con el CSS viejo (íconos sin tamaño, logo
    // deformado). Los estáticos no llevan versión en el nombre, así que no
    // pueden servirse desde caché sin preguntar antes por ellos.
    const sw = readFileSync('pagbateria/public/sw.js', 'utf8');
    const bloque = sw.split('if (esEstatico(url))')[1] ?? '';
    assert.ok(bloque, 'no se encontró el manejo de estáticos en el Service Worker');

    const posFetch = bloque.indexOf('await fetch(request');
    const posCache = bloque.indexOf('caches.match(request)');
    assert.ok(posFetch > -1, 'los estáticos deben pedirse a la red');
    assert.ok(posCache > -1, 'debe quedar la caché como respaldo sin red');
    assert.ok(
      posFetch < posCache,
      'la red debe consultarse antes que la caché, o se sirve CSS/JS viejo tras cada despliegue'
    );
  });

  test('la versión del Service Worker se movió del valor original', () => {
    // Si VERSION no sube, activate() no borra las cachés viejas y los archivos
    // del despliegue anterior sobreviven.
    const sw = readFileSync('pagbateria/public/sw.js', 'utf8');
    const m = sw.match(/const VERSION = '(v\d+)'/);
    assert.ok(m, 'sw.js debe declarar una VERSION');
    const numero = Number(m[1].slice(1));
    assert.ok(numero >= 3, `VERSION es ${m[1]}; debe subir en cada despliegue que toque CSS o JS`);
  });
});
