// @ts-check
/**
 * @module servicios-config
 * @description Título y descripción de los 6 servicios, configurables desde
 * el panel admin (pestaña "Servicios"), en vez de estar pegados a mano en
 * servicios.html. Mismo patrón que pagina-fotos.js: mejora progresiva, el
 * HTML ya trae el texto de hoy como valor por defecto en cada card.
 *
 * A diferencia de whatsapp-config.js/marca-config.js, no hace falta un
 * TreeWalker: .card__title y .card__text son texto plano sin markup
 * anidado que preservar.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @returns {Promise<void>}
 */
export async function aplicarServicios() {
  const nodos = document.querySelectorAll('[data-servicio-slug]');
  if (nodos.length === 0) return;

  /** @type {{ items?: Record<string, { title?: string, description?: string }> } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/servicios.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: el título/descripción por defecto que ya trae el HTML se queda tal cual.
    return;
  }

  const items = datos?.items ?? {};
  nodos.forEach((nodo) => {
    const slug = /** @type {HTMLElement} */ (nodo).dataset.servicioSlug;
    const entrada = slug ? items[slug] : undefined;
    if (!entrada) return;

    const titulo = nodo.querySelector('.card__title');
    const texto = nodo.querySelector('.card__text');
    if (titulo && entrada.title) titulo.textContent = entrada.title;
    if (texto && entrada.description) texto.textContent = entrada.description;
  });
}
