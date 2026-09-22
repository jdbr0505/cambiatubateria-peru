/**
 * Pruebas del cliente del catálogo.
 *
 * Verifican el contrato contra la API PHP: qué forma tiene la respuesta, qué
 * pasa cuando falla la red, y cómo se derivan marcas y modelos de vehículo
 * del campo `compatibility`.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchProductos,
  fetchMarcas,
  fetchMarcasConLogo,
  fetchAnios,
  extraerVehiculos,
  formatearPrecio,
  _resetCacheProductosParaTests,
} from '../../pagbateria/public/assets/js/lib/catalog-api.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  // fetchProductos() sin filtros cachea la promesa durante toda la carga de
  // página (a propósito, ver el comentario en catalog-api.js) — sin
  // limpiarla entre tests, el segundo test que llame fetchProductos() sin
  // filtros recibiría la respuesta cacheada del test anterior en vez de
  // pegarle a su propio mock de fetch.
  _resetCacheProductosParaTests();
});

/** @param {unknown} cuerpo @param {number} [status] */
function responderCon(cuerpo, status = 200) {
  globalThis.fetch = async () => new Response(JSON.stringify(cuerpo), { status });
}

describe('fetchProductos', () => {
  test('devuelve la lista de products.php', async () => {
    responderCon({ products: [{ id: 1, name: 'Varta H8', brand: 'Varta', price: 699 }] });

    const r = await fetchProductos();
    assert.equal(r.ok, true);
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].brand, 'Varta');
  });

  test('devuelve lista vacía si la respuesta no trae products', async () => {
    // Un endpoint que responde 200 con otra forma no debe romper la página.
    responderCon({ error: 'algo raro' });

    const r = await fetchProductos();
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, []);
  });

  test('arma los filtros como parámetros de consulta', async () => {
    let urlPedida = '';
    globalThis.fetch = async (url) => {
      urlPedida = String(url);
      return new Response('{"products":[]}', { status: 200 });
    };

    await fetchProductos({ brand: 'Bosch', make: 'BMW', model: 'X5', year: 2020 });

    assert.match(urlPedida, /brand=Bosch/);
    assert.match(urlPedida, /make=BMW/);
    assert.match(urlPedida, /model=X5/);
    assert.match(urlPedida, /year=2020/);
  });

  test('omite filtros vacíos', async () => {
    let urlPedida = '';
    globalThis.fetch = async (url) => {
      urlPedida = String(url);
      return new Response('{"products":[]}', { status: 200 });
    };

    await fetchProductos({ brand: '', make: undefined, model: 'X5' });

    assert.doesNotMatch(urlPedida, /brand=/, 'un filtro vacío no debe viajar');
    assert.doesNotMatch(urlPedida, /make=/);
    assert.match(urlPedida, /model=X5/);
  });

  test('nunca lanza excepción ante un fallo de red', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };

    const r = await fetchProductos();
    assert.equal(r.ok, false);
    assert.match(r.error, /conexión/i);
  });

  test('traduce un 500 a mensaje presentable', async () => {
    responderCon({}, 500);

    const r = await fetchProductos();
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
  });
});

describe('fetchProductos — caché de la llamada sin filtros', () => {
  // El buscador de la landing, el showcase de destacados, el buscador en
  // cascada del catálogo y el índice del buscador por nombre del nav llaman
  // fetchProductos() sin filtros de forma independiente en la misma carga de
  // página — sin caché, eso son 4 fetches del catálogo completo en vez de 1.
  test('dos llamadas sin filtros en la misma carga de página comparten un solo fetch', async () => {
    let llamadas = 0;
    globalThis.fetch = async () => {
      llamadas += 1;
      return new Response('{"products":[{"id":1}]}', { status: 200 });
    };

    const [a, b] = await Promise.all([fetchProductos(), fetchProductos()]);
    assert.equal(llamadas, 1, 'dos llamadas concurrentes no deben disparar dos fetches');
    assert.deepEqual(a.data, b.data);

    await fetchProductos();
    assert.equal(llamadas, 1, 'una tercera llamada secuencial debe seguir usando la misma caché');
  });

  test('una llamada CON filtros nunca usa la caché de la sin filtros, ni la contamina', async () => {
    let urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return new Response('{"products":[{"id":1}]}', { status: 200 });
    };

    await fetchProductos(); // llena la caché sin filtros
    await fetchProductos({ brand: 'Bosch' }); // no debe reusar esa caché
    assert.equal(urls.length, 2, 'la llamada filtrada debe pedir su propia URL');
    assert.match(urls[1], /brand=Bosch/);
  });

  test('si el fetch sin filtros falla, no queda cacheado el error para siempre', async () => {
    let intento = 0;
    globalThis.fetch = async () => {
      intento += 1;
      if (intento === 1) throw new Error('offline');
      return new Response('{"products":[{"id":1}]}', { status: 200 });
    };

    const primero = await fetchProductos();
    assert.equal(primero.ok, false);

    const segundo = await fetchProductos();
    assert.equal(segundo.ok, true, 'un reintento tras el fallo debe volver a pedir, no repetir el error cacheado');
    assert.equal(intento, 2);
  });
});

describe('fetchMarcas', () => {
  test('lee el campo brands de la respuesta', async () => {
    responderCon({ brands: ['Varta', 'Bosch', 'Etna'] });

    const r = await fetchMarcas();
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, ['Varta', 'Bosch', 'Etna']);
  });
});

describe('fetchMarcasConLogo', () => {
  test('usa items cuando la BD responde, con su logo', async () => {
    responderCon({
      brands: ['Varta', 'Bosch'],
      items: [
        { name: 'Varta', logoPath: 'uploads/varta.png' },
        { name: 'Bosch', logoPath: null },
      ],
    });

    const r = await fetchMarcasConLogo();
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, [
      { name: 'Varta', logoPath: 'uploads/varta.png' },
      { name: 'Bosch', logoPath: null },
    ]);
  });

  test('normaliza el backslash de Windows en logoPath', async () => {
    responderCon({ items: [{ name: 'Etna', logoPath: 'uploads\\marcas\\etna.png' }] });

    const r = await fetchMarcasConLogo();
    assert.equal(r.data[0].logoPath, 'uploads/marcas/etna.png');
  });

  test('cae a los nombres de brands cuando la BD no responde y no hay items', async () => {
    // brands.php solo manda `items` si get_pdo() devolvió una conexión. Sin
    // BD cae al JSON de respaldo y manda únicamente `brands`. Verificado
    // contra un servidor PHP real sin MySQL: antes de este respaldo el
    // marquee del home quedaba vacío justo cuando la BD falla.
    responderCon({ brands: ['ACDelco', 'Bosch', 'Varta'] });

    const r = await fetchMarcasConLogo();
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, [
      { name: 'ACDelco', logoPath: null },
      { name: 'Bosch', logoPath: null },
      { name: 'Varta', logoPath: null },
    ]);
  });

  test('devuelve lista vacía si la respuesta no trae ni items ni brands', async () => {
    responderCon({ error: 'algo raro' });

    const r = await fetchMarcasConLogo();
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, []);
  });
});

describe('fetchAnios', () => {
  test('lee el campo years de vehiculos.php', async () => {
    responderCon({ years: [2020, 2021, 2022] });

    const r = await fetchAnios('BMW', 'X5');
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, [2020, 2021, 2022]);
  });

  test('devuelve vacío cuando la base no tiene años, sin fallar', async () => {
    // vehiculos.php responde {years: []} si la tabla de compatibilidad no
    // existe. Eso es un estado válido, no un error.
    responderCon({ years: [] });

    const r = await fetchAnios('BMW', 'X5');
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, []);
  });
});

describe('extraerVehiculos', () => {
  test('separa marca y modelo de las cadenas de compatibilidad', () => {
    const mapa = extraerVehiculos([
      { compatibility: ['BMW X5', 'BMW X3', 'Audi Q7'] },
    ]);

    assert.deepEqual([...mapa.keys()].sort(), ['Audi', 'BMW']);
    assert.deepEqual([...(mapa.get('BMW') ?? [])].sort(), ['X3', 'X5']);
  });

  test('agrupa modelos de varios productos bajo la misma marca', () => {
    const mapa = extraerVehiculos([
      { compatibility: ['Toyota Corolla'] },
      { compatibility: ['Toyota Yaris', 'Toyota Corolla'] },
    ]);

    // El Set elimina el duplicado de Corolla.
    assert.deepEqual([...(mapa.get('Toyota') ?? [])].sort(), ['Corolla', 'Yaris']);
  });

  test('maneja modelos de varias palabras', () => {
    const mapa = extraerVehiculos([{ compatibility: ['Mercedes-Benz Clase C'] }]);
    assert.deepEqual([...(mapa.get('Mercedes-Benz') ?? [])], ['Clase C']);
  });

  test('descarta entradas sin modelo', () => {
    // Una marca suelta sin modelo no sirve para filtrar.
    const mapa = extraerVehiculos([{ compatibility: ['BMW', '', '   ', 'Audi Q7'] }]);
    assert.deepEqual([...mapa.keys()], ['Audi']);
  });

  test('no falla si el producto no trae compatibilidad', () => {
    const mapa = extraerVehiculos([{ id: 1, name: 'X' }]);
    assert.equal(mapa.size, 0);
  });
});

describe('formatearPrecio', () => {
  test('trata el valor como soles, no como céntimos', () => {
    // El app.js actual pasa `price` directo a Intl sin dividir: 6990 en el
    // catálogo son S/ 6,990.00, no S/ 69.90. Dividir mostraría precios falsos.
    assert.match(formatearPrecio(6990), /6[,.]990[.,]00/);
  });

  test('siempre muestra dos decimales', () => {
    assert.match(formatearPrecio(699), /699[.,]00/);
  });

  test('no rompe con valores inválidos', () => {
    assert.match(formatearPrecio(NaN), /0[.,]00/);
    assert.match(formatearPrecio(undefined), /0[.,]00/);
  });

  test('usa un espacio no separable entre "S/" y el número', () => {
    // Un espacio normal permite que el navegador parta la línea justo ahí
    // ("S/" al final, la cifra al inicio de la siguiente) — el precio es el
    // dato que más rápido necesita leerse en una tarjeta de producto.
    const precio = formatearPrecio(6990);
    assert.ok(precio.includes('\u00A0'), 'debe contener U+00A0 (nbsp) tras "S/"');
    assert.ok(!/S\/ \d/.test(precio), 'no debe quedar un espacio normal entre "S/" y el número');
  });
});
