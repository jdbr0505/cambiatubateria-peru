// @ts-check
/**
 * @module whatsapp-config
 * @description Número de WhatsApp configurable desde el panel admin (pestaña
 * WhatsApp), en vez de estar pegado a mano en ~80 lugares del sitio.
 *
 * Mejora progresiva, mismo patrón que pagina-fotos.js: el HTML ya trae el
 * número de hoy como valor por defecto en cada link. Si la API no responde,
 * la página se ve exactamente igual — nunca hay un link roto esperando a JS.
 */

const BASE = '/pagbateria/backend/api';

/** Valor de hoy, tal cual está horneado en el HTML — plan B si la API falla. */
const NUMERO_POR_DEFECTO = '51936956877';

let numeroActual = NUMERO_POR_DEFECTO;

/**
 * Arranca en cuanto este módulo se importa por primera vez — no hace falta
 * que cada página llame a nada para que el número quede listo antes de que
 * catalog.js arme las tarjetas de producto.
 * @type {Promise<void>}
 */
const listo = (async () => {
  try {
    const r = await fetch(`${BASE}/whatsapp.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return;
    const datos = await r.json();
    // 9-11 dígitos: cubre el formato peruano (9) con margen, sin aceptar
    // basura que rompería los enlaces tel:/wa.me en todas las páginas a la vez.
    if (typeof datos?.numero === 'string' && /^\d{9,11}$/.test(datos.numero)) {
      numeroActual = datos.numero;
    }
  } catch {
    // Sin conexión: se queda con NUMERO_POR_DEFECTO.
  }
})();

/**
 * Número tal cual está ahora mismo. Puede ser el por-defecto si la API
 * todavía no contestó — nunca null, nunca vacío.
 * @returns {string}
 */
export function getWhatsappNumeroSync() {
  return numeroActual;
}

/**
 * Se resuelve cuando la API ya contestó (con éxito o no). Para código que sí
 * puede esperar un instante antes de usar el número, en vez de leer el valor
 * por defecto a ciegas.
 * @returns {Promise<void>}
 */
export function whatsappListo() {
  return listo;
}

/** Cómo se ve el número por defecto hoy en nav/footer/botones — "936 956 877". */
const TEXTO_POR_DEFECTO = '936 956 877';

/**
 * Agrupa de a 3 dígitos, igual que el texto ya horneado en el HTML. Si el
 * número trae código de país de 2 dígitos (11 dígitos en total, como el
 * "51" de Perú), se muestra solo la parte local — igual que hoy.
 * @param {string} numero
 * @returns {string}
 */
export function formatearNumeroVisible(numero) {
  const local = numero.length === 11 ? numero.slice(2) : numero;
  return local.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/**
 * Reemplaza SOLO el texto (nunca innerHTML) dentro de un nodo, para no
 * destruir estructura como el <span aria-hidden="true">📞</span> que
 * precede al número en el link del nav.
 * @param {HTMLElement} nodo
 * @param {string} formateado
 * @returns {void}
 */
function reemplazarTextoNumero(nodo, formateado) {
  const walker = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  /** @type {Node|null} */
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (textNode.nodeValue?.includes(TEXTO_POR_DEFECTO)) {
      textNode.nodeValue = textNode.nodeValue.replace(TEXTO_POR_DEFECTO, formateado);
    }
  }
}

/**
 * Reescribe los links estáticos ya horneados en el HTML:
 *   <a data-whatsapp-role="tel" href="tel:+51936956877">...936 956 877</a>
 *   <a data-whatsapp-role="wa" href="https://wa.me/51936956877">
 *   <a data-whatsapp-role="wa" href="https://wa.me/51936956877?text=...">
 * El texto visible ("936 956 877" en nav, footer y algunos botones) se
 * actualiza junto con el href — mostrar el link correcto pero el número
 * viejo como texto sería la misma incoherencia que esto viene a resolver.
 * El mensaje prellenado (?text=...), cuando el link ya lo trae, se conserva
 * tal cual — solo se reemplaza el número, no toda la URL.
 * @returns {Promise<void>}
 */
export async function aplicarLinksWhatsapp() {
  const nodos = document.querySelectorAll('[data-whatsapp-role]');
  if (nodos.length === 0) return;

  await listo;
  if (numeroActual === NUMERO_POR_DEFECTO) return; // nada que cambiar

  const formateado = formatearNumeroVisible(numeroActual);

  nodos.forEach((nodo) => {
    if (!(nodo instanceof HTMLAnchorElement)) return;
    const rol = nodo.dataset.whatsappRole;
    if (rol === 'tel') {
      nodo.href = `tel:+${numeroActual}`;
      reemplazarTextoNumero(nodo, formateado);
    } else if (rol === 'wa') {
      const sufijo = nodo.href.split('?')[1];
      nodo.href = `https://wa.me/${numeroActual}` + (sufijo ? `?${sufijo}` : '');
    }
  });
}
