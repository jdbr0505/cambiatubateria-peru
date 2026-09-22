// @ts-check
/**
 * @module analytics
 * @description Eventos de conversión para Google Analytics 4 / Google Ads.
 *
 * Solo 3 eventos, los que de verdad representan un lead para este negocio:
 * llamar, escribir por WhatsApp, o enviar la ubicación desde el flujo de
 * auxilio. Una vista de página no es una conversión — un clic en el teléfono
 * sí. Medir de más diluye la señal que Google Ads necesita para pujar bien.
 *
 * Si gtag no cargó (bloqueador de anuncios, GA4 sin configurar todavía) esto
 * no debe romper nada — la función queda como no-op silencioso.
 */

/**
 * @param {string} nombre
 * @param {Record<string, string>} [parametros]
 * @returns {void}
 */
function evento(nombre, parametros) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', nombre, parametros);
}

/**
 * Delega clics en toda la página: no hace falta enganchar cada botón de
 * teléfono/WhatsApp uno por uno (aparecen repetidos en nav, footer, barra
 * fija) — un solo listener en document los cubre a todos, incluidos los que
 * se agregan después vía JS (el marquee, el catálogo).
 * @returns {void}
 */
function initClicsTelefonoWhatsapp() {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const enlace = target.closest('a[href]');
    if (!(enlace instanceof HTMLAnchorElement)) return;

    if (enlace.href.startsWith('tel:')) {
      evento('phone_click', { ubicacion: enlace.dataset.testid ?? enlace.href });
      return;
    }
    if (enlace.href.includes('wa.me')) {
      evento('whatsapp_click', { ubicacion: enlace.dataset.testid ?? 'enlace' });
    }
  });
}

/**
 * Arranca el tracking de conversión. Se llama una vez desde main.js.
 * @returns {void}
 */
export function initAnalytics() {
  initClicsTelefonoWhatsapp();
}
