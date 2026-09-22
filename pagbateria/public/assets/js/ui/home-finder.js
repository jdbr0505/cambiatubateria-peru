// @ts-check
/**
 * @module home-finder
 * @description Buscador horizontal por vehículo en la landing (Marca →
 * Modelo → Año), pedido explícito del jefe para reemplazar el botón genérico
 * "Ver todo el catálogo" — en vez de mandar a cualquiera a ver las 77
 * baterías, lo lleva directo a las que sirven para SU auto.
 *
 * Reutiliza initBuscadorVehiculo() y renderCatalogo() de catalog.js (mismo
 * cableado en cascada y el mismo pintado de tarjetas que catalogo.html) para
 * no duplicar esa lógica. Al enviar, pinta los resultados en la propia
 * vitrina de "Nuestro catálogo" (igual que hace el buscador en su sección) en
 * vez de navegar a otra página — el jefe pidió explícitamente que buscara
 * ahí mismo, no que redirigiera.
 */

import { initBuscadorVehiculo, renderCatalogo } from './catalog.js';

const DESTINO = '[data-testid="catalogo-preview"]';

/**
 * @returns {Promise<void>}
 */
export async function initHomeFinder() {
  // La página del catálogo ya cablea su propio buscador (initCatalogo, vía
  // initBuscadorCascada) — sin esta guarda, catalogo.html terminaría con DOS
  // manejadores del mismo submit: uno filtra en sitio, el otro navega, y el
  // botón dejaría de hacer ninguna de las dos cosas de forma confiable.
  if (document.querySelector('[data-testid="catalogo-grid"]')) return;

  const form = document.querySelector('[data-testid="finder-form"]');
  if (!(form instanceof HTMLFormElement)) return;

  await initBuscadorVehiculo(form, (seleccion) => {
    renderCatalogo(seleccion, DESTINO);
    document.querySelector(DESTINO)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
