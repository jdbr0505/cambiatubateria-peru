/**
 * Service Worker — CambiaTuBatería Perú
 *
 * Objetivo del negocio: que el teléfono de la central siga visible aunque el
 * cliente esté varado sin datos móviles. Un conductor con el auto muerto en
 * una zona sin señal es exactamente el caso que este archivo cubre.
 *
 * Estrategia por tipo de recurso, no una sola para todo:
 *   · Navegación → red primero, caché de respaldo. Un precio viejo es peor
 *     que esperar medio segundo.
 *   · Estáticos (CSS/JS/imágenes) → caché primero. Cambian con el despliegue,
 *     no entre visitas.
 *   · API → NUNCA se cachea. Un stock o precio vencido genera un reclamo.
 */

/**
 * Subir esta versión en cada despliegue que toque CSS o JS: al activarse, el
 * Service Worker borra todas las cachés que no terminen en ella y vuelve a
 * pedir todo. Sin ese cambio, los archivos viejos sobreviven al despliegue.
 */
const VERSION = 'v22';
const CACHE_SHELL = `ctb-shell-${VERSION}`;
const CACHE_ESTATICOS = `ctb-static-${VERSION}`;

/**
 * Debe coincidir con el `?v=` de los <link> y <script> del HTML. Las páginas
 * piden `tokens.css?v=<ASSET_V>`; precachear `tokens.css` a secas guardaría un archivo
 * que ninguna página pide, y el modo offline se quedaría sin estilos.
 */
const ASSET_V = '22';

/** Lo mínimo para que la página abra sin red. */
const SHELL = [
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  `./assets/css/v2/tokens.css?v=${ASSET_V}`,
  `./assets/css/v2/base.css?v=${ASSET_V}`,
  `./assets/css/v2/nav.css?v=${ASSET_V}`,
  `./assets/css/v2/layout.css?v=${ASSET_V}`,
  `./assets/css/v2/components.css?v=${ASSET_V}`,
  `./assets/css/v2/sections.css?v=${ASSET_V}`,
  './assets/img/icons/icon-192.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_SHELL)
      // addAll falla entero si un solo archivo falla. Se piden uno por uno
      // para que un 404 en un icono no impida instalar el Service Worker.
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves
          .filter((k) => k.startsWith('ctb-') && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * ¿Es una llamada a la API PHP?
 * @param {URL} url
 */
function esApi(url) {
  return url.pathname.includes('/backend/api/');
}

/**
 * ¿Es un estático servido por nosotros?
 * @param {URL} url
 */
function esEstatico(url) {
  return /\.(css|js|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  // Solo GET del mismo origen. Un POST no se cachea nunca, y las peticiones
  // a Google Fonts o WhatsApp las maneja el navegador.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API queda fuera: precio y stock vencidos generan reclamos reales.
  if (esApi(url)) return;

  // Navegación: red primero. Si no hay red, se sirve lo cacheado y, si
  // tampoco hay, la página de respaldo con el teléfono visible.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_SHELL).then((c) => c.put(request, copia));
          return respuesta;
        })
        .catch(async () => {
          const cacheada = await caches.match(request);
          return cacheada ?? caches.match('./offline.html');
        })
    );
    return;
  }

  // Estáticos: RED primero, caché de respaldo.
  //
  // Antes era caché primero: servía el CSS/JS guardado y revalidaba en segundo
  // plano. El efecto en producción era que tras cada despliegue el visitante
  // recibía el HTML nuevo con los estilos viejos — íconos sin tamaño, logo
  // deformado, módulos que ya no existían — hasta la visita siguiente. Un
  // archivo estático sin versión en el nombre no puede servirse desde caché
  // antes de preguntar por él.
  //
  // Con red primero: online siempre llega lo último (el .htaccess responde 304
  // si no cambió, así que cuesta casi nada) y, sin red, se cae al caché, que es
  // lo que mantiene el sitio usable para alguien varado sin datos.
  if (esEstatico(url)) {
    evento.respondWith((async () => {
      try {
        // `cache: 'no-cache'` obliga a revalidar contra el servidor en vez de
        // aceptar una copia que el navegador haya guardado por heurística
        // (lo que pasaba con los archivos cacheados antes de que el .htaccess
        // enviara Cache-Control). Es una petición condicional: si nada cambió
        // el servidor responde 304 y no se transfiere el archivo.
        const respuesta = await fetch(request, { cache: 'no-cache' });
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_ESTATICOS).then((c) => c.put(request, copia));
        }
        return respuesta;
      } catch (error) {
        const cacheada = await caches.match(request);
        if (cacheada) return cacheada;
        throw error;
      }
    })());
  }
});
