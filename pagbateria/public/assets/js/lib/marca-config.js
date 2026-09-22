// @ts-check
/**
 * @module marca-config
 * @description Nombre y logo de marca configurables desde el panel admin
 * (pestaña "Logo-título"), en vez de estar pegados a mano en nav+footer de
 * cada página. Mismo patrón que whatsapp-config.js: mejora progresiva,
 * arranca al importarse, nunca bloquea ni deja un hueco si la API no
 * contesta.
 */

const BASE = '/pagbateria/backend/api';

/** Valor de hoy, tal cual está horneado en el HTML — plan B si la API falla. */
const NOMBRE_POR_DEFECTO = 'CambiaTuBatería';

let nombreActual = NOMBRE_POR_DEFECTO;
/** @type {string|null} */
let logoActual = null;

/** @type {Promise<void>} */
const listo = (async () => {
  try {
    const r = await fetch(`${BASE}/sitio.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return;
    const datos = await r.json();
    if (typeof datos?.brandName === 'string' && datos.brandName.trim()) {
      nombreActual = datos.brandName.trim();
    }
    if (typeof datos?.logoFile === 'string' && datos.logoFile.trim()) {
      logoActual = datos.logoFile.trim();
    }
  } catch {
    // Sin conexión: se queda con NOMBRE_POR_DEFECTO y sin logo nuevo.
  }
})();

/**
 * Reemplaza SOLO el texto (nunca innerHTML), para no destruir estructura
 * como el <span class="nav__brand-tag">Perú</span> o el <em>Perú</em> del
 * footer que acompañan al nombre.
 * @param {HTMLElement} nodo
 * @returns {void}
 */
function reemplazarTextoNombre(nodo) {
  const walker = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  /** @type {Node|null} */
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (textNode.nodeValue?.includes(NOMBRE_POR_DEFECTO)) {
      textNode.nodeValue = textNode.nodeValue.replace(NOMBRE_POR_DEFECTO, nombreActual);
    }
  }
}

/**
 * Reescribe nombre y logo en los links ya horneados en el HTML:
 *   <a data-marca-rol="nombre" class="nav__brand">...CambiaTuBatería...</a>
 *   <img data-marca-rol="logo" class="nav__logo" src="...">
 * @returns {Promise<void>}
 */
export async function aplicarMarca() {
  const nodos = document.querySelectorAll('[data-marca-rol]');
  if (nodos.length === 0) return;

  await listo;

  nodos.forEach((nodo) => {
    const rol = /** @type {HTMLElement} */ (nodo).dataset.marcaRol;
    if (rol === 'nombre' && nombreActual !== NOMBRE_POR_DEFECTO) {
      reemplazarTextoNombre(/** @type {HTMLElement} */ (nodo));
    } else if (rol === 'logo' && logoActual && nodo instanceof HTMLImageElement) {
      nodo.src = logoActual;
    }
  });
}
