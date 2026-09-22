/**
 * Pruebas de geocodificación inversa.
 * Usa proveedores simulados: no golpea las APIs reales en cada corrida.
 * Para verificar contra los servicios en vivo: npm run test:live
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReverseGeocoder, OSM_ATTRIBUTION } from '../../../pagbateria/public/assets/js/geo/reverse-geocoder.js';

/**
 * @param {string} name
 * @param {(lat:number,lng:number)=>Promise<any>} impl
 * @param {number} [minIntervalMs]
 */
function fakeProvider(name, impl, minIntervalMs = 0) {
  return { name, minIntervalMs, lookup: (lat, lng) => impl(lat, lng) };
}

describe('Cadena de proveedores', () => {
  test('usa el primer proveedor cuando responde bien', async () => {
    const geocoder = new ReverseGeocoder({
      providers: [
        fakeProvider('primario', async () => ({ ok: true, address: 'Av. Camino Real 391, San Isidro', provider: 'primario' })),
        fakeProvider('respaldo', async () => { throw new Error('no debería llamarse'); }),
      ],
    });

    const result = await geocoder.lookup(-12.0977, -77.0365);

    assert.equal(result.ok, true);
    assert.equal(result.address, 'Av. Camino Real 391, San Isidro');
    assert.equal(result.provider, 'primario');
  });

  test('cae al respaldo si el primario falla', async () => {
    const geocoder = new ReverseGeocoder({
      providers: [
        fakeProvider('primario', async () => { throw new Error('503'); }),
        fakeProvider('respaldo', async () => ({ ok: true, address: 'San Isidro, Lima', provider: 'respaldo' })),
      ],
    });

    const result = await geocoder.lookup(-12.0977, -77.0365);

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'respaldo');
  });

  test('cae al respaldo si el primario responde sin dirección utilizable', async () => {
    const geocoder = new ReverseGeocoder({
      providers: [
        fakeProvider('primario', async () => ({ ok: false, error: 'sin resultados' })),
        fakeProvider('respaldo', async () => ({ ok: true, address: 'Lima', provider: 'respaldo' })),
      ],
    });

    assert.equal((await geocoder.lookup(-12, -77)).provider, 'respaldo');
  });

  test('si todos fallan retorna error controlado, sin lanzar excepción', async () => {
    const geocoder = new ReverseGeocoder({
      providers: [
        fakeProvider('a', async () => { throw new Error('caído'); }),
        fakeProvider('b', async () => { throw new Error('caído'); }),
      ],
    });

    const result = await geocoder.lookup(-12, -77);

    assert.equal(result.ok, false);
    assert.match(result.error, /Ningún proveedor/);
  });
});

describe('Caché', () => {
  test('no vuelve a llamar al proveedor para la misma coordenada', async () => {
    let calls = 0;
    const geocoder = new ReverseGeocoder({
      providers: [fakeProvider('p', async () => { calls++; return { ok: true, address: 'Lima', provider: 'p' }; })],
    });

    await geocoder.lookup(-12.0977, -77.0365);
    await geocoder.lookup(-12.0977, -77.0365);
    await geocoder.lookup(-12.09771, -77.03651); // dentro de la precisión de caché

    assert.equal(calls, 1, 'debe resolverse desde caché tras la primera llamada');
  });

  test('coordenadas lejanas sí generan una nueva consulta', async () => {
    let calls = 0;
    const geocoder = new ReverseGeocoder({
      providers: [fakeProvider('p', async () => { calls++; return { ok: true, address: 'X', provider: 'p' }; })],
    });

    await geocoder.lookup(-12.0977, -77.0365);
    await geocoder.lookup(-12.0464, -77.0428);

    assert.equal(calls, 2);
  });
});

describe('Control de frecuencia (política de Nominatim)', () => {
  test('omite un proveedor si aún no cumple su intervalo mínimo', async () => {
    let primaryCalls = 0;
    const geocoder = new ReverseGeocoder({
      providers: [
        fakeProvider('limitado', async () => { primaryCalls++; return { ok: true, address: 'A', provider: 'limitado' }; }, 5000),
        fakeProvider('libre', async () => ({ ok: true, address: 'B', provider: 'libre' })),
      ],
    });

    const first = await geocoder.lookup(-12.01, -77.01);
    const second = await geocoder.lookup(-12.02, -77.02); // distinta coord: no hay caché

    assert.equal(first.provider, 'limitado');
    assert.equal(second.provider, 'libre', 'la segunda debe saltar al proveedor sin límite');
    assert.equal(primaryCalls, 1, 'el proveedor limitado no debe llamarse dos veces seguidas');
  });
});

describe('Timeout', () => {
  test('no espera más allá del timeout configurado', async () => {
    const geocoder = new ReverseGeocoder({
      timeoutMs: 120,
      providers: [
        fakeProvider('lento', (lat, lng) => new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, address: 'tarde', provider: 'lento' }), 3000);
        })),
      ],
    });

    const startedAt = Date.now();
    const result = await geocoder.lookup(-12, -77);
    const elapsed = Date.now() - startedAt;

    assert.equal(result.ok, false, 'debe rendirse en vez de retener el despacho');
    assert.ok(elapsed < 1500, `debe abortar rápido, tardó ${elapsed} ms`);
  });
});

// La integración con GeolocationService (el flujo de auxilio/GPS del sitio
// público) se quitó junto con ese módulo — ver pagbateria/public/assets/js/main.js.
// ReverseGeocoder queda de pie por su cuenta: lo sigue usando
// scripts/live-check.js (npm run check:live), sin relación con ese flujo.
