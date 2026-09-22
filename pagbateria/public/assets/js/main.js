// @ts-check
/**
 * @module main
 * @description Punto de entrada del sitio público.
 *
 * Hasta hace poco cableaba acá el flujo de auxilio por GPS (pulsar botón →
 * capturar ubicación → abrir WhatsApp/panel con las coordenadas → rastreo en
 * vivo del técnico). Se quitó del todo, a pedido explícito del jefe:
 * WhatsApp es ahora 100% el canal de contacto. Se fue con él: el botón
 * público, esta plomería, los módulos geolocation-module.js/
 * live-tracking-ui.js/live-tracking.js/tracking-transports.js/live-map.js,
 * los endpoints auxilio.php/auxilio_estado.php/tecnico_posicion.php, la
 * página tecnico-rastreo.html, y la pestaña "Auxilio" + su backend en el
 * panel admin. reverse-geocoder.js y navigation-links.js se conservan: los
 * sigue usando scripts/live-check.js (npm run check:live), sin relación con
 * el flujo que se quitó.
 */

import { initNav } from './ui/nav.js';
import { initButtons } from './ui/button.js';
import { revealOnScroll } from './motion/springs.js';
import { initCatalogo } from './ui/catalog.js';
import { initCatalogoPreview } from './ui/catalog-preview.js';
import { initBuscadorPanel } from './ui/search-panel.js';
import { initCookieConsent } from './ui/cookie-consent.js';
import { initPaginaFotos } from './ui/pagina-fotos.js';
import { initWhatsappAsesores } from './ui/whatsapp-asesores.js';
import { initHomeFinder } from './ui/home-finder.js';
import { initAnalytics } from './lib/analytics.js';
import { aplicarLinksWhatsapp } from './lib/whatsapp-config.js';
import { aplicarMarca } from './lib/marca-config.js';
import { aplicarServicios } from './lib/servicios-config.js';
import { aplicarHero } from './lib/hero-config.js';
import { aplicarNosotros } from './lib/nosotros-config.js';
import { aplicarCabeceras } from './lib/cabeceras-config.js';
import { aplicarMarcasLista } from './lib/marcas-lista-config.js';
import { aplicarContacto } from './lib/contacto-config.js';
import { aplicarCobertura } from './lib/cobertura-config.js';

/**
 * Revela el contenido editable desde el panel (hero, cabeceras, servicios,
 * nosotros, fotos de página, tira de marcas, correo de contacto, zonas de
 * cobertura) recién
 * cuando los módulos de mejora progresiva ya intentaron aplicar el valor
 * real de la API — antes
 * se pintaba primero el texto/foto por defecto horneado en el HTML y, un
 * instante después, el reemplazo (si el panel tenía algo distinto): un
 * parpadeo "versión vieja → versión nueva" que delataba que el sitio se
 * editó recién. base.css oculta esos nodos (visibility:hidden, sin afectar
 * el layout) hasta que <html> lleva data-contenido-listo.
 *
 * Falla segura con Promise.race: si algo cuelga (red lenta, promesa que
 * nunca resuelve), un timeout revela el contenido de todas formas — nunca
 * se queda invisible para siempre, ni bloquea más de FALLBACK_MS.
 *
 * @param {Promise<unknown>[]} promesas
 * @returns {Promise<void>}
 */
async function revelarContenidoEditable(promesas) {
  const FALLBACK_MS = 900;
  await Promise.race([
    Promise.allSettled(promesas),
    new Promise((resolve) => setTimeout(resolve, FALLBACK_MS)),
  ]);
  document.documentElement.setAttribute('data-contenido-listo', '');
}

/**
 * Registra el Service Worker.
 *
 * Se espera al evento `load` para no competir por ancho de banda con el
 * render inicial: el registro del SW no es urgente, el First Contentful Paint
 * sí — y ese FCP es lo que sostiene el Quality Score que abarata los clics.
 *
 * @returns {void}
 */
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// no permite Service Workers; solo se registra sobre http(s).
  if (location.protocol === 'file:') return;

  // ¿Ya había un Service Worker mandando cuando cargó esta página? Si lo había,
  // los archivos de ESTA carga los sirvió él — la versión vieja. Cuando el
  // nuevo tome el control hay que recargar una vez, o el visitante se queda
  // mirando el HTML nuevo con los estilos viejos: íconos gigantes sin tamaño,
  // secciones sin maquetar. Es exactamente el bug que reportaron desde otras
  // computadoras mientras el servidor ya tenía todo correcto.
  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  let yaRecargado = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // En la primera visita de la vida no había controlador: el cambio es la
    // instalación normal, no un reemplazo, y recargar ahí sería un parpadeo
    // gratis. El guardia también evita cualquier bucle de recargas.
    if (!habiaControlador || yaRecargado) return;
    yaRecargado = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Un SW que no registra no rompe el sitio: solo pierde el modo offline.
      // No hay nada que el usuario deba hacer, así que se falla en silencio.
    });
  });
}

// Arranque. Cada init falla en silencio si su elemento no está en la página,
// así el mismo bundle sirve para todas las páginas del sitio.
initNav();
initAnalytics();
initButtons();
// El buscador de la barra es un <form method="get" action="catalogo.html">: en
// las páginas que no son el catálogo funciona sin una línea de JS. En el
// catálogo lo toma initCatalogo() para filtrar en vivo, sin recargar.
initCatalogo();
initBuscadorPanel();
void initCatalogoPreview();
// Buscador horizontal por vehículo de la landing — no hace nada en
// catalogo.html, que ya tiene el suyo propio vía initCatalogo().
void initHomeFinder();
// Mismo patrón: los ~80 links tel:/wa.me ya traen el número de hoy escrito
// en el propio HTML, esto solo los reemplaza si el panel admin lo cambió.
// No entra en revelarContenidoEditable(): el teléfono se edita una sola vez
// en la vida del sitio y aparece en TODAS las páginas — ocultarlo ahí
// costaría rendimiento en cada visita para un parpadeo que casi nadie ve.
void aplicarLinksWhatsapp();
// El botón flotante de WhatsApp siempre abre el selector de asesores — ver
// whatsapp-asesores.js. Tampoco entra en revelarContenidoEditable(): no
// reemplaza texto visible de entrada, convierte el botón en su lugar.
void initWhatsappAsesores();
// Nombre/logo de marca (nav + pie, todas las páginas): mismo motivo que el
// teléfono — se edita una sola vez, no vale ocultarlo en cada visita. Corre
// en paralelo, sin esperar ni ser esperado por revelarContenidoEditable().
void aplicarMarca();
// Estos sí reemplazan texto/foto ya pintados por el HTML por defecto: se
// ocultan por CSS (base.css) hasta que esta promesa resuelve, para no
// mostrar la versión vieja ni un instante — ver revelarContenidoEditable().
void revelarContenidoEditable([
  initPaginaFotos(),
  aplicarServicios(),
  aplicarHero(),
  aplicarNosotros(),
  aplicarCabeceras(),
  aplicarMarcasLista(),
  aplicarContacto(),
  aplicarCobertura(),
]);
initCookieConsent();
initServiceWorker();
// .service-icons__item ya no entra acá: ahora vive dentro del hero, que
// tiene su propia entrada en CSS (hero-enter en la fila completa). Sumarle
// esta segunda animación por ítem competía con esa y el bug real era que
// solo el primer ítem terminaba de revelarse — los demás se quedaban en
// opacity:0 fijado por este mismo script, esperando un IntersectionObserver
// que no llegaba a completar el resto a tiempo.
revealOnScroll('.card, .districts li, .faq__item, .promo-banner');
