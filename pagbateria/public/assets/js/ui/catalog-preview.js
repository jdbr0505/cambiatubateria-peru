// @ts-check
/**
 * @module catalog-preview
 * @description Apartado de baterías destacadas para la landing. Sin esto, la
 * página de inicio no muestra ni una sola batería: el negocio vende baterías
 * pero el visitante tiene que irse al catálogo para ver alguna. Este showcase
 * pone producto real (con foto y precio) frente al cliente de una vez.
 */

import { fetchProductos } from '../lib/catalog-api.js';
import { tarjetaProducto } from './catalog.js';
import { revealOnScroll } from '../motion/springs.js';

/**
 * Cuántas baterías se muestran en la landing. No es el catálogo completo (77):
 * es una vitrina para captar la atención y llevar al catálogo. 8 llena dos
 * filas de 4 en desktop sin volverse una lista interminable en la home.
 */
const DESTACADAS = 8;

/**
 * Elige un conjunto variado priorizando marcas distintas: una vitrina con 8
 * baterías de la misma marca se ve pobre. Recorre los productos repartiendo
 * por marca antes de repetir, y solo toma los que tienen foto (una vitrina
 * vive de la imagen; una tarjeta sin foto ahí se ve rota).
 *
 * @param {import('../lib/catalog-api.js').Producto[]} productos
 * @param {number} limite
 * @returns {import('../lib/catalog-api.js').Producto[]}
 */
function seleccionVariada(productos, limite) {
  const conFoto = productos.filter((p) => p.image);
  /** @type {Map<string, import('../lib/catalog-api.js').Producto[]>} */
  const porMarca = new Map();
  for (const p of conFoto) {
    const marca = String(p.brand ?? '');
    if (!porMarca.has(marca)) porMarca.set(marca, []);
    porMarca.get(marca)?.push(p);
  }

  const seleccion = [];
  // Ronda por marcas: una batería de cada una antes de repetir marca.
  const colas = [...porMarca.values()];
  while (seleccion.length < limite) {
    let agrego = false;
    for (const cola of colas) {
      if (seleccion.length >= limite) break;
      const siguiente = cola.shift();
      if (siguiente) {
        seleccion.push(siguiente);
        agrego = true;
      }
    }
    // Todas las colas vacías: ya no hay más productos con foto que mostrar.
    if (!agrego) break;
  }

  return seleccion;
}

/**
 * Pinta el apartado de baterías destacadas, si la página lo tiene.
 * @returns {Promise<void>}
 */
export async function initCatalogoPreview() {
  const contenedor = document.querySelector('[data-testid="catalogo-preview"]');
  if (!(contenedor instanceof HTMLElement)) return;

  const r = await fetchProductos();
  if (!r.ok || r.data.length === 0) {
    // El showcase es un extra: si la API no responde, se oculta la sección
    // entera en vez de dejar un hueco con un mensaje de error en la home.
    const seccion = contenedor.closest('section');
    if (seccion instanceof HTMLElement) seccion.hidden = true;
    return;
  }

  const destacadas = seleccionVariada(r.data, DESTACADAS);
  contenedor.innerHTML = destacadas.map(tarjetaProducto).join('');

  revealOnScroll('[data-testid="catalogo-preview"] .producto', { stagger: 50 });
}
