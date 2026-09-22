// @ts-check
/**
 * @module hero-config
 * @description Texto del hero (badge, título, bajada) configurable desde el
 * panel admin (pestaña "Hero"). Mismo patrón que servicios-config.js: mejora
 * progresiva, solo pisa lo que la API trae con un valor real.
 *
 * El título es un caso especial: en el HTML tiene <br> y <em> ("¿Tu auto<br>
 * no <em>arranca</em>?") que un valor de texto plano no puede reproducir.
 * Por eso el respaldo (hero.json) trae "titulo": null — nunca se toca a
 * menos que el admin haya guardado uno explícitamente, y en ese caso se
 * acepta perder el salto de línea y el énfasis a cambio de texto editable.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @returns {Promise<void>}
 */
export async function aplicarHero() {
  const nodos = document.querySelectorAll('[data-hero-rol]');
  if (nodos.length === 0) return;

  /** @type {Record<string, string|null>|null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/hero.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: el texto por defecto que ya trae el HTML se queda tal cual.
    return;
  }
  if (!datos) return;

  const mapa = {
    badge: datos.badge,
    titulo: datos.titulo,
    bajada: datos.bajada,
  };

  nodos.forEach((nodo) => {
    const rol = /** @type {HTMLElement} */ (nodo).dataset.heroRol;
    const valor = rol ? mapa[rol] : undefined;
    if (valor) nodo.textContent = valor;
  });
}
