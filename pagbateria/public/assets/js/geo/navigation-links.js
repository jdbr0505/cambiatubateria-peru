/**
 * @module NavigationLinks
 * @description Generación de enlaces de navegación hacia la ubicación del
 * cliente, para Google Maps, Waze y Apple Maps.
 *
 * DISTINCIÓN CLAVE — dos tipos de enlace que no son intercambiables:
 *
 *   · PIN (`?q=lat,lng`)     → muestra un punto en el mapa. Sirve para que el
 *                              operador vea DÓNDE está el cliente.
 *   · NAVEGACIÓN (`dir/...`) → inicia la guía paso a paso desde donde esté el
 *                              técnico. Es lo que el técnico necesita.
 *
 * Confundirlos es el error clásico: el técnico abre el enlace, ve un punto en
 * el mapa y tiene que iniciar la ruta a mano, perdiendo tiempo en una
 * emergencia.
 *
 * @see https://developers.google.com/maps/documentation/urls/get-started
 * @see https://developers.google.com/waze/deeplinks
 */

/**
 * @typedef {Object} NavigationLinks
 * @property {string} googleMapsNav - Navegación paso a paso en Google Maps.
 * @property {string} wazeNav - Navegación paso a paso en Waze.
 * @property {string} appleMapsNav - Navegación paso a paso en Apple Maps (iOS).
 * @property {string} pin - Vista de punto en el mapa, sin iniciar ruta.
 * @property {string} geoUri - URI nativa de Android; deja elegir la app instalada.
 * @property {string} coordsText - Coordenadas legibles para copiar/pegar o dictar por teléfono.
 */

/**
 * Precisión de 6 decimales ≈ 0.11 m. Más decimales solo alargan la URL sin
 * aportar exactitud útil, y ensucian el mensaje de WhatsApp.
 */
const COORD_PRECISION = 6;

/**
 * Valida que un par de coordenadas sea utilizable para navegación.
 *
 * Crítico: una coordenada inválida no rompe la app, genera un enlace que
 * manda al técnico a un punto equivocado (o al Golfo de Guinea, en el caso
 * clásico de 0,0). Es preferible no mostrar enlace a mostrar uno incorrecto.
 *
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {boolean}
 */
export function areValidCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // (0, 0) es el "Null Island": casi siempre indica un GPS que falló, no una
  // ubicación real. Ningún cliente de Lima está en medio del Atlántico.
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Normaliza una coordenada a texto con punto decimal.
 *
 * `toFixed` siempre usa punto, independientemente del locale del dispositivo.
 * Usar interpolación directa de números con locales que emplean coma decimal
 * rompería la URL.
 *
 * @param {number} value
 * @returns {string}
 */
function formatCoord(value) {
  return Number(value.toFixed(COORD_PRECISION)).toString();
}

/**
 * Construye todos los enlaces de navegación para una ubicación.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {Object} [options]
 * @param {'driving'|'walking'|'motorcycle'} [options.travelMode='driving'] - Modo de traslado del técnico.
 * @param {string} [options.label='Cliente'] - Etiqueta del destino en el mapa.
 * @returns {NavigationLinks|null} `null` si las coordenadas son inválidas.
 */
export function buildNavigationLinks(latitude, longitude, options = {}) {
  if (!areValidCoordinates(latitude, longitude)) return null;

  const { travelMode = 'driving', label = 'Cliente' } = options;

  const lat = formatCoord(latitude);
  const lng = formatCoord(longitude);
  const coords = `${lat},${lng}`;
  const encodedCoords = encodeURIComponent(coords);

  return {
    // API oficial de URLs de Google Maps. Multiplataforma: abre la app si está
    // instalada, o el navegador si no.
    googleMapsNav:
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodedCoords}` +
      `&travelmode=${travelMode}`,

    // Enlace universal de Waze. Se prefiere sobre el esquema `waze://` porque
    // este último falla en silencio si la app no está instalada; el universal
    // cae al mapa web de Waze.
    wazeNav: `https://waze.com/ul?ll=${encodedCoords}&navigate=yes`,

    // iOS suele tener Apple Maps como app de mapas por defecto.
    appleMapsNav: `https://maps.apple.com/?daddr=${encodedCoords}&dirflg=d`,

    // Solo muestra el punto, sin iniciar ruta. Para el operador de central.
    pin: `https://www.google.com/maps/search/?api=1&query=${encodedCoords}`,

    // URI nativa de Android: el sistema ofrece elegir entre las apps de mapas
    // instaladas en el dispositivo del técnico.
    geoUri: `geo:${coords}?q=${encodedCoords}(${encodeURIComponent(label)})`,

    // Respaldo humano: si todo falla, el operador puede dictar esto por teléfono.
    coordsText: coords,
  };
}

/**
 * Arma el bloque de texto de navegación que viaja en el mensaje de WhatsApp.
 *
 * DECISIÓN DE DISEÑO — no se detecta la plataforma aquí:
 * este mensaje lo recibe el operador de central y luego lo REENVÍA al técnico.
 * Detectar el sistema operativo serviría para el teléfono del cliente, que no
 * es quien va a navegar. Por eso se incluyen ambos enlaces y decide quien
 * conduce.
 *
 * @param {NavigationLinks} links
 * @param {Object} [options]
 * @param {boolean} [options.includeAppleMaps=false] - Añade Apple Maps; alarga el mensaje.
 * @returns {string}
 */
export function buildNavigationMessageBlock(links, options = {}) {
  const lines = [
    `🧭 Google Maps: ${links.googleMapsNav}`,
    `🚗 Waze: ${links.wazeNav}`,
  ];

  if (options.includeAppleMaps) {
    lines.push(`🍎 Apple Maps: ${links.appleMapsNav}`);
  }

  return lines.join('\n');
}

/**
 * Detecta la plataforma del dispositivo actual.
 *
 * Usar SOLO para decidir qué botón resaltar en la interfaz que ve el usuario
 * en su propio teléfono. Nunca para elegir qué enlace enviar por WhatsApp
 * (ver la nota en `buildNavigationMessageBlock`).
 *
 * @returns {'ios'|'android'|'desktop'}
 */
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';

  const ua = navigator.userAgent ?? '';

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  // iPadOS 13+ se identifica como Macintosh; se distingue por el táctil.
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';

  return 'desktop';
}

/**
 * Devuelve las apps de navegación en el orden más útil para la plataforma
 * detectada, para ordenar los botones de la interfaz.
 *
 * @param {NavigationLinks} links
 * @param {'ios'|'android'|'desktop'} [platform]
 * @returns {Array<{key: string, label: string, url: string}>}
 */
export function getOrderedNavigationApps(links, platform = detectPlatform()) {
  const apps = {
    googleMaps: { key: 'googleMaps', label: 'Google Maps', url: links.googleMapsNav },
    waze: { key: 'waze', label: 'Waze', url: links.wazeNav },
    appleMaps: { key: 'appleMaps', label: 'Apple Maps', url: links.appleMapsNav },
  };

  switch (platform) {
    case 'ios':
      return [apps.waze, apps.googleMaps, apps.appleMaps];
    case 'android':
      return [apps.waze, apps.googleMaps];
    default:
      // En escritorio Waze y Apple Maps aportan poco: no hay app nativa.
      return [apps.googleMaps];
  }
}
