/**
 * @module ReverseGeocoder
 * @description Conversión de coordenadas a dirección legible usando servicios
 * gratuitos sin clave de API ni costo recurrente.
 *
 * Estrategia de cadena de proveedores:
 *   1. Nominatim (OpenStreetMap) — nivel de calle y número. Mejor para despacho.
 *   2. BigDataCloud — nivel de distrito. Sin límite de uso, respaldo confiable.
 *   3. Ninguno — el payload conserva coordenadas y enlace de mapa, que ya
 *      bastan para que el técnico navegue.
 *
 * El geocoding es SIEMPRE opcional y con timeout corto: nunca debe retrasar
 * el envío del auxilio. Si tarda o falla, el despacho sale igual.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

/**
 * @typedef {Object} GeocodeResult
 * @property {boolean} ok
 * @property {string} [address] - Dirección formateada legible.
 * @property {string} [provider] - Proveedor que respondió.
 * @property {string} [attribution] - Atribución legal requerida, si aplica.
 * @property {string} [error]
 */

/**
 * @typedef {Object} GeocodeProvider
 * @property {string} name
 * @property {number} minIntervalMs - Intervalo mínimo entre llamadas (política del servicio).
 * @property {(lat: number, lng: number, signal: AbortSignal) => Promise<GeocodeResult>} lookup
 */

/** Atribución obligatoria por la licencia ODbL de OpenStreetMap. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Crea el proveedor Nominatim (OpenStreetMap).
 *
 * Gratuito y sin clave. Su política de uso exige:
 *   · Máximo 1 petición por segundo (se respeta con `minIntervalMs`).
 *   · Identificar la aplicación mediante User-Agent o Referer.
 *   · Mostrar la atribución de OpenStreetMap.
 *   · No usarlo para volumen masivo ni autocompletado en tiempo real.
 *
 * IMPORTANTE sobre la identificación: Nominatim responde 403 a clientes que
 * no se identifican. Desde el NAVEGADOR esto se resuelve solo — el navegador
 * envía su propio User-Agent y el Referer del sitio, y `User-Agent` es un
 * header prohibido que JavaScript no puede sobrescribir. Desde Node (pruebas,
 * SSR) hay que inyectarlo explícitamente vía `extraHeaders`, o la petición
 * será rechazada.
 *
 * Para el volumen de este negocio (decenas de auxilios al día) el uso está
 * holgadamente dentro de la política.
 *
 * @param {Object} [options]
 * @param {Record<string,string>} [options.extraHeaders] - Solo para entornos sin navegador.
 * @returns {GeocodeProvider}
 */
export function createNominatimProvider(options = {}) {
  return {
    name: 'nominatim',
    minIntervalMs: 1100,

    async lookup(lat, lng, signal) {
      const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es&zoom=18`;

      const response = await fetch(url, {
        signal,
        headers: { Accept: 'application/json', ...options.extraHeaders },
      });

      if (!response.ok) {
        return { ok: false, error: `Nominatim respondió ${response.status}` };
      }

      const data = await response.json();
      const address = formatNominatimAddress(data);

      return address
        ? { ok: true, address, provider: 'nominatim', attribution: OSM_ATTRIBUTION }
        : { ok: false, error: 'Nominatim no devolvió dirección utilizable' };
    },
  };
}

/**
 * Proveedor Nominatim listo para usar en el navegador.
 * @type {GeocodeProvider}
 */
export const nominatimProvider = createNominatimProvider();

/**
 * Proveedor BigDataCloud (endpoint cliente).
 *
 * Gratuito, sin clave, sin límite declarado y pensado para uso desde el
 * navegador. Menor detalle que Nominatim (llega a distrito, no a calle),
 * por eso actúa como respaldo.
 *
 * @type {GeocodeProvider}
 */
export const bigDataCloudProvider = {
  name: 'bigdatacloud',
  minIntervalMs: 0,

  async lookup(lat, lng, signal) {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${lat}&longitude=${lng}&localityLanguage=es`;

    const response = await fetch(url, { signal });
    if (!response.ok) {
      return { ok: false, error: `BigDataCloud respondió ${response.status}` };
    }

    const data = await response.json();
    const parts = [data.locality, data.city, data.principalSubdivision].filter(
      (p) => p && p.trim()
    );
    const address = [...new Set(parts)].join(', ');

    return address
      ? { ok: true, address, provider: 'bigdatacloud' }
      : { ok: false, error: 'BigDataCloud no devolvió dirección utilizable' };
  },
};

/**
 * Arma una dirección legible priorizando calle y número, que es lo que
 * necesita el técnico para llegar.
 *
 * @param {Object} data - Respuesta cruda de Nominatim.
 * @returns {string}
 */
function formatNominatimAddress(data) {
  const a = data?.address;
  if (!a) return data?.display_name ?? '';

  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const area = a.neighbourhood || a.suburb || a.city_district;
  const district = a.city || a.town || a.village;

  const parts = [street, area, district].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : (data.display_name ?? '');
}

/**
 * Servicio de geocodificación inversa con cadena de proveedores, caché,
 * control de frecuencia y timeout.
 */
export class ReverseGeocoder {
  /**
   * @param {Object} [config]
   * @param {GeocodeProvider[]} [config.providers] - Orden de preferencia.
   * @param {number} [config.timeoutMs=4000] - Tope de espera total. Vencido, se despacha sin dirección.
   * @param {number} [config.cachePrecision=4] - Decimales para agrupar en caché (4 ≈ 11 m).
   */
  constructor(config = {}) {
    this.providers = config.providers ?? [nominatimProvider, bigDataCloudProvider];
    this.timeoutMs = config.timeoutMs ?? 4000;
    this.cachePrecision = config.cachePrecision ?? 4;

    /** @type {Map<string, GeocodeResult>} */
    this._cache = new Map();
    /** @type {Map<string, number>} */
    this._lastCallAt = new Map();
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @returns {string}
   * @private
   */
  _cacheKey(lat, lng) {
    return `${lat.toFixed(this.cachePrecision)},${lng.toFixed(this.cachePrecision)}`;
  }

  /**
   * Verifica si el proveedor respeta su intervalo mínimo entre llamadas.
   * @param {GeocodeProvider} provider
   * @returns {boolean}
   * @private
   */
  _isThrottled(provider) {
    if (!provider.minIntervalMs) return false;
    const last = this._lastCallAt.get(provider.name);
    return last !== undefined && Date.now() - last < provider.minIntervalMs;
  }

  /**
   * Convierte coordenadas a dirección legible. Recorre los proveedores en
   * orden hasta que uno responda. Nunca lanza excepción ni excede el timeout.
   *
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<GeocodeResult>}
   */
  async lookup(lat, lng) {
    const key = this._cacheKey(lat, lng);
    const cached = this._cache.get(key);
    if (cached) return cached;

    const controller = new AbortController();
    let timer;

    // El timeout se aplica en el orquestador, no se delega a los proveedores.
    // Un proveedor que ignore la señal de aborto (o un parseo lento) no debe
    // poder retener el despacho de un auxilio.
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, error: 'Tiempo de espera agotado en geocodificación.' });
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([
        this._runProviderChain(lat, lng, controller.signal),
        timeoutPromise,
      ]);

      if (result.ok) this._cache.set(key, result);
      return result;
    } finally {
      clearTimeout(timer);
      controller.abort(); // libera cualquier fetch pendiente
    }
  }

  /**
   * Recorre los proveedores en orden hasta obtener una dirección utilizable.
   * @param {number} lat
   * @param {number} lng
   * @param {AbortSignal} signal
   * @returns {Promise<GeocodeResult>}
   * @private
   */
  async _runProviderChain(lat, lng, signal) {
    for (const provider of this.providers) {
      if (signal.aborted) break;
      if (this._isThrottled(provider)) continue;

      try {
        this._lastCallAt.set(provider.name, Date.now());
        const result = await provider.lookup(lat, lng, signal);
        if (result.ok) return result;
      } catch {
        // Proveedor caído, bloqueo CORS o aborto: se intenta el siguiente.
        if (signal.aborted) break;
      }
    }

    return { ok: false, error: 'Ningún proveedor de geocodificación respondió.' };
  }
}
