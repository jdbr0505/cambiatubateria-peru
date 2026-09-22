// @ts-check
/**
 * @module search-panel
 * @description Panel de resultados del buscador de la barra: al escribir,
 * despliega las baterías que coinciden con su foto, marca y precio.
 *
 * Sin él, buscar era un salto a ciegas — escribir, enviar, esperar la recarga
 * del catálogo y recién ahí ver si había algo. Acá el visitante ve el producto
 * mientras escribe, desde cualquier página del sitio.
 *
 * Los productos se piden UNA vez y se filtran en memoria: son ~77 y ya vienen
 * completos de products.php, así que pedirle al servidor una consulta por cada
 * tecla sería gastar viajes de red para volver a recibir lo mismo.
 */

import { fetchProductos, formatearPrecio } from '../lib/catalog-api.js';

/** Cuántas baterías se listan. Más que esto obliga a hacer scroll dentro del
 *  desplegable, que en móvil pelea con el scroll de la página. */
const MAX_RESULTADOS = 6;

/** Espera tras la última tecla antes de filtrar. Suficiente para no repintar
 *  en medio de una palabra, corto para que no se sienta lento. */
const ESPERA_MS = 120;

/** Mínimo de letras. Con una sola, "e" devuelve casi el catálogo entero. */
const MINIMO_LETRAS = 2;

/** @type {import('../lib/catalog-api.js').Producto[] | null} */
let catalogo = null;
/** @type {Promise<void> | null} */
let cargando = null;

/**
 * @param {unknown} valor
 * @returns {string}
 */
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minúsculas y sin tildes: quien escribe "bateria" desde el teclado del
 * celular debe encontrar "batería".
 *
 * El filtro por código de carácter reemplaza a un rango de diacríticos escrito
 * literal en la expresión regular: esos caracteres combinantes son invisibles
 * en el editor y ya se corrompieron una vez al pasar por la consola.
 *
 * @param {unknown} texto
 * @returns {string}
 */
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((caracter) => {
      const codigo = caracter.charCodeAt(0);
      return codigo < 0x300 || codigo > 0x36f;
    })
    .join('');
}

/**
 * Descarga el catálogo una sola vez por visita.
 * @returns {Promise<void>}
 */
function asegurarCatalogo() {
  if (catalogo) return Promise.resolve();
  if (cargando) return cargando;

  cargando = fetchProductos().then((r) => {
    // Falla de red: se deja `catalogo` en null para reintentar en la próxima
    // búsqueda en vez de dejar el panel muerto por el resto de la visita.
    catalogo = r.ok ? r.data : null;
    cargando = null;
  });
  return cargando;
}

/**
 * @param {string} termino
 * @returns {import('../lib/catalog-api.js').Producto[]}
 */
function filtrar(termino) {
  if (!catalogo) return [];
  const buscado = normalizar(termino).trim();
  if (buscado.length < MINIMO_LETRAS) return [];

  return catalogo
    .filter((p) => normalizar(`${p.name} ${p.brand}`).includes(buscado))
    .slice(0, MAX_RESULTADOS);
}

/**
 * Una fila del panel.
 *
 * Es un enlace real a `catalogo.html?q=…`: funciona con clic, con teclado, con
 * "abrir en pestaña nueva" y con el botón central del ratón. Un div con un
 * manejador de clic pierde las tres últimas.
 *
 * @param {import('../lib/catalog-api.js').Producto} p
 * @param {number} indice
 * @returns {string}
 */
function fila(p, indice) {
  const foto = p.image
    ? `<img class="nav__search-foto" src="${esc(p.image)}" alt="" aria-hidden="true" width="48" height="48" loading="lazy">`
    // Sin foto cargada todavía en el panel admin: un recuadro vacío mantiene
    // la alineación de las filas en vez de correr el texto hacia la izquierda.
    : '<span class="nav__search-foto nav__search-foto--vacia" aria-hidden="true"></span>';

  return `<a class="nav__search-item" role="option" aria-selected="false"
     id="nav-search-item-${indice}" href="catalogo.html?q=${encodeURIComponent(p.name ?? '')}">
    ${foto}
    <span class="nav__search-item-texto">
      <span class="nav__search-item-nombre">${esc(p.name)}</span>
      <span class="nav__search-item-marca">${esc(p.brand)}</span>
    </span>
    <span class="nav__search-item-precio">${esc(formatearPrecio(p.price))}</span>
  </a>`;
}

/**
 * Arranca el panel si la página tiene el buscador de la barra.
 * @returns {void}
 */
export function initBuscadorPanel() {
  const entrada = document.querySelector('[data-testid="buscador-input"]');
  const panel = document.querySelector('[data-testid="nav-search-panel"]');
  const formulario = document.querySelector('[data-testid="nav-search"]');
  if (!(entrada instanceof HTMLInputElement) || !(panel instanceof HTMLElement)) return;

  /** Índice de la fila resaltada con el teclado; -1 = ninguna. */
  let activo = -1;
  /** @type {number | undefined} */
  let temporizador;

  const cerrar = () => {
    panel.hidden = true;
    panel.replaceChildren();
    activo = -1;
    entrada.setAttribute('aria-expanded', 'false');
    entrada.removeAttribute('aria-activedescendant');
  };

  /** @returns {HTMLElement[]} */
  const filas = () => [...panel.querySelectorAll('.nav__search-item')].filter((e) => e instanceof HTMLElement);

  /** @param {number} indice */
  const resaltar = (indice) => {
    const items = filas();
    if (items.length === 0) return;
    // Da la vuelta en los dos extremos: llegar al final y quedarse trabado es
    // peor que volver al principio.
    activo = (indice + items.length) % items.length;
    items.forEach((item, i) => {
      const seleccionado = i === activo;
      item.setAttribute('aria-selected', String(seleccionado));
      item.classList.toggle('nav__search-item--activo', seleccionado);
    });
    entrada.setAttribute('aria-activedescendant', items[activo].id);
    items[activo].scrollIntoView({ block: 'nearest' });
  };

  const pintar = () => {
    const resultados = filtrar(entrada.value);

    if (entrada.value.trim().length < MINIMO_LETRAS) {
      cerrar();
      return;
    }

    if (resultados.length === 0) {
      panel.innerHTML = `<p class="nav__search-vacio">Sin coincidencias para "${esc(entrada.value.trim())}"</p>`;
    } else {
      panel.innerHTML = resultados.map(fila).join('');
    }
    panel.hidden = false;
    activo = -1;
    entrada.setAttribute('aria-expanded', 'true');
    entrada.removeAttribute('aria-activedescendant');
  };

  entrada.addEventListener('input', () => {
    window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => {
      void asegurarCatalogo().then(pintar);
    }, ESPERA_MS);
  });

  // Volver a enfocar un campo que ya tenía texto debe mostrar de nuevo lo que
  // había, no obligar a borrar una letra y reescribirla.
  entrada.addEventListener('focus', () => {
    if (entrada.value.trim().length >= MINIMO_LETRAS) void asegurarCatalogo().then(pintar);
  });

  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrar();
      return;
    }
    if (panel.hidden) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      resaltar(activo + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      resaltar(activo - 1);
    } else if (e.key === 'Enter' && activo >= 0) {
      // Con una fila resaltada, Enter abre esa batería en vez de enviar el
      // formulario con el texto suelto.
      e.preventDefault();
      filas()[activo]?.click();
    }
  });

  // Clic fuera: cierra. Se escucha en captura para enterarse aunque el clic
  // caiga sobre algo que detenga la propagación.
  document.addEventListener('click', (e) => {
    if (panel.hidden) return;
    const destino = e.target;
    if (destino instanceof Node && formulario instanceof HTMLElement && formulario.contains(destino)) return;
    cerrar();
  }, true);

  formulario?.addEventListener('submit', cerrar);
}
