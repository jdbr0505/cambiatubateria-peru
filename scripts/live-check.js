/**
 * Verificación en vivo contra los servicios reales de geocodificación.
 * Ejecutar: npm run check:live
 *
 * Separado de la suite normal para no golpear las APIs públicas en cada
 * corrida de pruebas — es una cortesía exigida por la política de Nominatim.
 */

import { ReverseGeocoder, createNominatimProvider, bigDataCloudProvider } from '../pagbateria/public/assets/js/geo/reverse-geocoder.js';
import { buildNavigationLinks } from '../pagbateria/public/assets/js/geo/navigation-links.js';

/**
 * Nominatim rechaza (403) a clientes que no se identifican. El navegador envía
 * User-Agent y Referer automáticamente; Node no. Aquí se inyectan para que la
 * verificación refleje las condiciones reales de producción.
 */
const nominatimProvider = createNominatimProvider({
  extraHeaders: {
    'User-Agent': 'CambiaTuBateriaPeru/1.0 (verificacion de despliegue)',
    Referer: 'https://cambiatubateriaperu.com/',
  },
});

const PUNTOS_DE_PRUEBA = [
  { nombre: 'Centro de Lima', lat: -12.0464, lng: -77.0428 },
  { nombre: 'San Isidro',     lat: -12.0977, lng: -77.0365 },
  { nombre: 'Miraflores',     lat: -12.1211, lng: -77.0300 },
];

/** @param {number} ms */
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function probarProveedor(provider, punto) {
  const inicio = Date.now();
  try {
    const controller = new AbortController();
    const resultado = await provider.lookup(punto.lat, punto.lng, controller.signal);
    const ms = Date.now() - inicio;

    if (resultado.ok) {
      console.log(`  ✔ ${provider.name.padEnd(14)} ${String(ms).padStart(5)} ms  →  ${resultado.address}`);
      return true;
    }
    console.log(`  ✖ ${provider.name.padEnd(14)} ${String(ms).padStart(5)} ms  →  ${resultado.error}`);
    return false;
  } catch (error) {
    console.log(`  ✖ ${provider.name.padEnd(14)} excepción: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\nVerificación en vivo de geocodificación inversa (servicios gratuitos)\n');

  let exitos = 0;
  let total = 0;

  for (const punto of PUNTOS_DE_PRUEBA) {
    console.log(`${punto.nombre}  (${punto.lat}, ${punto.lng})`);

    for (const provider of [nominatimProvider, bigDataCloudProvider]) {
      total++;
      if (await probarProveedor(provider, punto)) exitos++;
      await esperar(1200); // respeta el límite de 1 req/s de Nominatim
    }
    console.log('');
  }

  console.log('Cadena completa con respaldo automático:');
  const geocoder = new ReverseGeocoder({ providers: [nominatimProvider, bigDataCloudProvider] });
  const resultado = await geocoder.lookup(-12.0977, -77.0365);
  console.log(`  ${resultado.ok ? '✔' : '✖'} ${resultado.address ?? resultado.error}  [${resultado.provider ?? 'ninguno'}]`);

  console.log(`\nResultado geocodificación: ${exitos}/${total} consultas exitosas.\n`);

  await verificarEnlacesNavegacion();

  if (exitos === 0) {
    console.error('\nNingún proveedor respondió. Revisa la conexión de red.');
    process.exit(1);
  }
}

/**
 * Comprueba que los enlaces generados por el módulo resuelvan de verdad.
 * Se verifican las URLs que produce el código, no URLs escritas a mano —
 * un error de formato en el generador es justo lo que se busca detectar.
 */
async function verificarEnlacesNavegacion() {
  console.log('Enlaces de navegación generados por el módulo:');

  const links = buildNavigationLinks(-12.0977, -77.0365);
  if (!links) {
    console.error('  ✖ El generador devolvió null para coordenadas válidas.');
    process.exit(1);
  }

  const objetivos = [
    ['Google Maps', links.googleMapsNav],
    ['Waze', links.wazeNav],
    ['Apple Maps', links.appleMapsNav],
    ['Pin (solo vista)', links.pin],
  ];

  let ok = 0;

  for (const [nombre, url] of objetivos) {
    try {
      const respuesta = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0' },
      });

      const estado = respuesta.ok ? '✔' : '✖';
      if (respuesta.ok) ok++;
      console.log(`  ${estado} ${nombre.padEnd(18)} HTTP ${respuesta.status}  →  ${url}`);
    } catch (error) {
      console.log(`  ✖ ${nombre.padEnd(18)} ${error.message}`);
    }
    await esperar(400);
  }

  console.log(`\nResultado navegación: ${ok}/${objetivos.length} enlaces válidos.`);
  console.log(`\nURI nativa Android (no verificable por HTTP): ${links.geoUri}`);

  if (ok < objetivos.length) {
    console.error('\nAlgún enlace de navegación no resolvió. Revisar el formato antes de desplegar.');
    process.exit(1);
  }
}

main();
