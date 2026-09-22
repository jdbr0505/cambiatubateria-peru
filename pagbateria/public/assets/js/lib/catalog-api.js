// @ts-check
/**
 * @module catalog-api
 * @description Cliente del catálogo contra la API PHP existente.
 *
 * Contrato real de los endpoints (verificado leyendo el PHP, no supuesto):
 *   GET backend/api/products.php            → { products: Producto[] }
 *   GET backend/api/products.php?brand=X    → filtra por marca
 *   GET backend/api/products.php?make=&model=&year=  → filtra por vehículo
 *   GET backend/api/brands.php              → { brands: string[], items?: [] }
 *   GET backend/api/vehiculos.php?make=&model= → { years: number[] }
 *
 * Estos GET son públicos a propósito: `require_write_access()` solo cierra
 * POST/PUT/PATCH/DELETE. Cerrarlos dejaría el catálogo sin productos.
 */

/**
 * @typedef {Object} Producto
 * @property {number} id
 * @property {string} name
 * @property {string} brand
 * @property {number} price
 * @property {number|null} cca
 * @property {number|null} capacity
 * @property {string} type
 * @property {number} coreDiscount - Descuento por entregar la batería usada, en PEN.
 * @property {string} [coreDiscountTexto] - Texto tras el monto (editable en el panel), ej. "entregando tu batería usada".
 * @property {string} [description]
 * @property {string[]} [compatibility] - Ej. ["BMW X5", "Audi Q7"]
 * @property {string|null} [image] - Ruta absoluta ("/pagbateria/public/assets/img/productos/...")
 *   subida desde el panel admin. products.php ya la devuelve (columna `imagen`
 *   o join con `producto_imagenes`) — no todos los productos la tienen.
 */

/**
 * @template T
 * @typedef {{ok: true, data: T} | {ok: false, error: string, status: number}} Result
 */

/**
 * Ruta absoluta, no relativa: el `.htaccess` sirve las páginas desde la raíz
 * del dominio (`/catalogo.html`), no desde `/pagbateria/public/`. Con la
 * relativa `../backend/api`, el navegador pedía `/backend/api/products.php` y
 * recibía 404 — el catálogo mostraba "No pudimos cargar el catálogo" en
 * producción aunque la API respondiera bien. Debe coincidir con el API_BASE
 * de app.js.
 */
const BASE = '/pagbateria/backend/api';

/** Sin datos frescos en este plazo, se muestra lo cacheado. */
const TIMEOUT_MS = 8000;

/**
 * @param {string} url
 * @returns {Promise<Result<any>>}
 */
async function pedir(url) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
    });

    if (!respuesta.ok) {
      return { ok: false, status: respuesta.status, error: `El servidor respondió ${respuesta.status}` };
    }
    return { ok: true, data: await respuesta.json() };
  } catch {
    // Sin conexión es un estado esperado en un celular en la calle, no una
    // excepción. Quien llama decide qué mostrar.
    return { ok: false, status: 0, error: 'Sin conexión. Revisa tu red e intenta otra vez.' };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * La lista SIN filtros se pide desde varios módulos independientes en la
 * misma carga de página (el buscador de la landing, el showcase de
 * destacados, el buscador en cascada del catálogo, el índice del buscador
 * por nombre del nav) — sin esto, cada uno dispara su propio fetch de los
 * ~77 productos completos. Una sola promesa compartida por carga de página;
 * si falla, se limpia para que un reintento (recuperar la red) sí vuelva a
 * pedirla. Las llamadas CON filtros nunca tocan este caché: cada filtro es
 * una consulta distinta al servidor.
 * @type {Promise<Result<Producto[]>>|null}
 */
let cacheSinFiltros = null;

/**
 * Solo para pruebas: cada test necesita una llamada sin filtros fresca
 * contra su propio mock de fetch, sin la caché de una carga de página real
 * de por medio. No se usa en el sitio (ahí el caché debe durar toda la
 * carga de página, a propósito).
 * @returns {void}
 */
export function _resetCacheProductosParaTests() {
  cacheSinFiltros = null;
}

/**
 * Lista de productos, con filtros opcionales.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.brand]
 * @param {string} [filtros.q]
 * @param {string} [filtros.make]
 * @param {string} [filtros.model]
 * @param {number} [filtros.year]
 * @returns {Promise<Result<Producto[]>>}
 */
export async function fetchProductos(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '' && valor !== null) params.set(clave, String(valor));
  }

  const sinFiltros = params.toString() === '';

  if (sinFiltros) {
    if (cacheSinFiltros) return cacheSinFiltros;
    cacheSinFiltros = (async () => {
      const r = await pedir(`${BASE}/products.php`);
      if (!r.ok) return r;
      const lista = Array.isArray(r.data?.products) ? r.data.products : [];
      return { ok: true, data: lista };
    })();
    cacheSinFiltros.then((r) => { if (!r.ok) cacheSinFiltros = null; });
    return cacheSinFiltros;
  }

  const r = await pedir(`${BASE}/products.php?${params}`);
  if (!r.ok) return r;

  const lista = Array.isArray(r.data?.products) ? r.data.products : [];
  return { ok: true, data: lista };
}

/**
 * Marcas de batería disponibles.
 * @returns {Promise<Result<string[]>>}
 */
export async function fetchMarcas() {
  const r = await pedir(`${BASE}/brands.php`);
  if (!r.ok) return r;

  const marcas = Array.isArray(r.data?.brands) ? r.data.brands : [];
  return { ok: true, data: marcas };
}

/**
 * @typedef {Object} MarcaConLogo
 * @property {string} name
 * @property {string|null} logoPath
 */

/**
 * Marcas con su logo, para el marquee del home. `brands.php` ya trae este
 * detalle en `items` (fetchMarcas() solo expone los nombres).
 *
 * `items` SOLO existe cuando la BD responde: si `get_pdo()` devuelve null,
 * brands.php cae al JSON de respaldo y manda únicamente `brands` (nombres).
 * Verificado contra un servidor PHP real sin MySQL: sin este respaldo el
 * marquee del home se quedaba vacío justo cuando la BD falla, que es cuando
 * menos conviene que la portada se vea rota. El marquee ya sabe dibujar una
 * marca sin logo (pinta el nombre), así que degradar es mejor que desaparecer.
 * @returns {Promise<Result<MarcaConLogo[]>>}
 */
export async function fetchMarcasConLogo() {
  const r = await pedir(`${BASE}/brands.php`);
  if (!r.ok) return r;

  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  if (items.length > 0) {
    return {
      ok: true,
      data: items.map((it) => ({
        name: String(it.name ?? ''),
        // El panel admin a veces guarda la ruta con backslash de Windows
        // (dato viejo, ver docs/HANDOFF.md) — se normaliza acá porque romper
        // el logo de una marca real es peor que una URL con / de más.
        logoPath: it.logoPath ? String(it.logoPath).replace(/\\/g, '/') : null,
      })),
    };
  }

  const nombres = Array.isArray(r.data?.brands) ? r.data.brands : [];
  return {
    ok: true,
    data: nombres.map((nombre) => ({ name: String(nombre ?? ''), logoPath: null })),
  };
}

/**
 * Años disponibles para un vehículo.
 * @param {string} make
 * @param {string} model
 * @returns {Promise<Result<number[]>>}
 */
export async function fetchAnios(make, model) {
  const params = new URLSearchParams({ make, model });
  const r = await pedir(`${BASE}/vehiculos.php?${params}`);
  if (!r.ok) return r;

  const anios = Array.isArray(r.data?.years) ? r.data.years : [];
  return { ok: true, data: anios };
}

/**
 * Extrae marcas y modelos de vehículo del campo `compatibility` de los productos.
 *
 * No existe endpoint público de marcas/modelos de vehículo: `vehiculos.php`
 * solo devuelve años. La compatibilidad viene como cadenas del tipo
 * "BMW X5", donde la primera palabra es la marca y el resto el modelo.
 *
 * Es frágil con marcas de dos palabras (Mercedes-Benz va con guion, así que
 * funciona; "Land Rover" no). Se corrige el día que exista un endpoint real.
 *
 * @param {Producto[]} productos
 * @returns {Map<string, Set<string>>} marca → modelos
 */
export function extraerVehiculos(productos) {
  /** @type {Map<string, Set<string>>} */
  const mapa = new Map();

  for (const p of productos) {
    for (const entrada of p.compatibility ?? []) {
      const texto = String(entrada).trim();
      if (!texto) continue;

      const espacio = texto.indexOf(' ');
      if (espacio < 1) continue;

      const marca = texto.slice(0, espacio);
      const modelo = texto.slice(espacio + 1).trim();
      if (!modelo) continue;

      if (!mapa.has(marca)) mapa.set(marca, new Set());
      mapa.get(marca)?.add(modelo);
    }
  }

  return mapa;
}

/**
 * Formatea un precio en soles.
 *
 * El campo `price` viene en SOLES, no en centimos: el `formatPEN()` del
 * `app.js` actual lo pasa directo a `Intl.NumberFormat` sin dividir. Los
 * valores del catalogo (6990, 5490) son precios reales de baterias premium
 * en el mercado peruano.
 *
 * Se compone a mano en vez de `style: 'currency'` porque Intl produce
 * "S/ 6,990.00" con espacio no separable en unos entornos y "PEN 6,990.00"
 * en otros -- inconsistencia que el cliente ve.
 *
 * El espacio entre "S/" y el numero es no separable (a proposito): un
 * salto de linea justo ahi ("S/" al final de una linea, "6,990.00" al
 * inicio de la siguiente) deja el precio ilegible a primera vista, justo
 * el dato que mas rapido necesita leerse en una tarjeta.
 *
 * @param {number} soles
 * @returns {string}
 */
export function formatearPrecio(soles) {
  const valor = Number(soles) || 0;
  return `S/\u00A0${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
