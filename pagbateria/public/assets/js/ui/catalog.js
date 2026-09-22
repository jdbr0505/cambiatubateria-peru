// @ts-check
/**
 * @module catalog
 * @description Renderiza el catálogo real desde la API y cablea el buscador
 * en cascada Marca → Modelo → Año.
 */

import {
  fetchProductos,
  fetchMarcas,
  fetchAnios,
  extraerVehiculos,
  formatearPrecio,
} from '../lib/catalog-api.js';
import { toast } from './toast.js';
import { revealOnScroll } from '../motion/springs.js';
import { getWhatsappNumeroSync, formatearNumeroVisible } from '../lib/whatsapp-config.js';

/**
 * Escapa texto antes de meterlo en innerHTML.
 *
 * Los nombres y descripciones de producto vienen de la base de datos, que el
 * panel admin puede editar. Sin escapar, un nombre con `<script>` se ejecuta
 * en el navegador de cada visitante.
 *
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
 * Esqueletos con la forma de las tarjetas reales.
 *
 * Un esqueleto que imita el contenido hace la espera más corta de lo que es;
 * un spinner genérico la hace sentir más larga.
 *
 * @param {number} cantidad
 * @returns {string}
 */
function skeletons(cantidad = 6) {
  return Array.from({ length: cantidad }, () => `
    <article class="card" aria-hidden="true">
      <span class="skeleton" style="width:2.75rem;height:2.75rem;border-radius:var(--radius-md)"></span>
      <span class="skeleton skeleton--title"></span>
      <span class="skeleton skeleton--text"></span>
      <span class="skeleton skeleton--text" style="width:80%"></span>
      <span class="skeleton skeleton--text" style="width:40%;height:1.4em;margin-top:auto"></span>
    </article>
  `).join('');
}

/**
 * @param {import('../lib/catalog-api.js').Producto} p
 * @returns {string}
 */
export function tarjetaProducto(p) {
  // El texto ("entregando tu batería usada") es editable desde el panel
  // (Descuento, campo de texto junto al monto) — viene de la API, no está
  // escrito a mano, así que hay que escaparlo igual que nombre/marca.
  const descuento = Number(p.coreDiscount) > 0
    ? `<p class="producto__descuento">−${formatearPrecio(p.coreDiscount)} ${esc(p.coreDiscountTexto || 'entregando tu batería usada')}</p>`
    : '';

  const specs = [
    p.capacity ? `${p.capacity} Ah` : null,
    p.cca ? `${p.cca} CCA` : null,
    p.type || null,
  ].filter(Boolean).map((s) => `<li>${esc(s)}</li>`).join('');

  // No todos los productos tienen foto subida desde el panel admin todavía
  // — sin la imagen, la tarjeta arranca directo en la marca, como antes.
  // Envuelta en .producto__foto-wrap: el recorte a 4/3 y el zoom leve viven
  // en el contenedor (overflow:hidden), no en el <img> — así el margen claro
  // que traen algunas fotos de fábrica alrededor de la batería (reportado:
  // "se ve un espacio en la imagen que se ve mal") queda fuera del recorte
  // en vez de mostrar el fondo gris de placeholder por debajo.
  const foto = p.image
    ? `<div class="producto__foto-wrap"><img src="${esc(p.image)}" alt="${esc(p.name)}" class="producto__foto" loading="lazy" width="400" height="300"></div>`
    : '';

  return `
    <article class="card producto" data-testid="producto-${p.id}">
      ${foto}
      <span class="badge badge--energy">${esc(p.brand)}</span>
      <h3 class="card__title">${esc(p.name)}</h3>
      ${specs ? `<ul class="producto__specs">${specs}</ul>` : ''}
      <p class="producto__precio">${formatearPrecio(p.price)}</p>
      ${descuento}
      <a href="https://wa.me/${getWhatsappNumeroSync()}?text=${encodeURIComponent(`Hola, me interesa la batería ${p.name} (${p.brand})`)}"
         class="btn btn--primary" target="_blank" rel="noopener"
         data-testid="producto-${p.id}-cotizar">Cotizar por WhatsApp</a>
    </article>`;
}

/**
 * Estado vacío. No es un error: es un resultado válido de filtrar.
 * @param {string} mensaje
 * @returns {string}
 */
function vacio(mensaje) {
  return `
    <div class="estado-vacio" data-testid="catalogo-vacio">
      <p class="estado-vacio__titulo">${esc(mensaje)}</p>
      <p class="estado-vacio__texto">
        Llámanos con la placa de tu vehículo y lo verificamos contigo.
      </p>
      <a href="tel:+${getWhatsappNumeroSync()}" class="btn btn--ghost">Llamar ${esc(formatearNumeroVisible(getWhatsappNumeroSync()))}</a>
    </div>`;
}

/**
 * Cuántas tarjetas se pintan por tanda. El catálogo real ronda 77 productos:
 * pintar los 77 de una sola vez de golpe funciona, pero es DOM de más que
 * el usuario nunca llega a ver (la mayoría filtra o para de scrollear mucho
 * antes). 12 llena la grilla en desktop (3 columnas × 4 filas) sin dejar la
 * primera pantalla vacía.
 */
const LOTE = 12;

/** Lo que devolvió la API con los filtros activos, sin tocar. */
let resultadoCompleto = /** @type {import('../lib/catalog-api.js').Producto[]} */ ([]);
/** Lo que se está mostrando (resultadoCompleto ya pasado por el buscador). */
let resultadoActual = /** @type {import('../lib/catalog-api.js').Producto[]} */ ([]);
let cantidadPintada = 0;
/** Texto escrito en el buscador de productos. */
let terminoBusqueda = '';
/**
 * Dónde se pinta el grid activo — normalmente el del catálogo, pero
 * renderCatalogo() lo puede apuntar a otro contenedor (el buscador
 * horizontal de la landing reutiliza toda esta maquinaria para pintar sus
 * resultados en la vitrina de "Nuestro catálogo", en vez de navegar a otra
 * página). aplicarBusqueda/pintarSiguienteLote/actualizarBotonCargarMas leen
 * este valor en vez de tener el testid de catalogo-grid pegado a mano.
 */
let contenedorSelector = '[data-testid="catalogo-grid"]';

/**
 * Compara sin acentos ni mayúsculas: quien busca "bateria etna" desde el
 * celular no escribe la tilde, y no encontrar nada por eso se lee como que el
 * catálogo no la tiene.
 * @param {unknown} texto
 * @returns {string}
 */
function normalizar(texto) {
  // NFD separa la letra de su tilde; se descartan los diacríticos por rango de
  // código (U+0300–U+036F) en vez de escribirlos literales en el regex, que
  // sobreviven mal a cualquier recodificación del archivo.
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
 * Pinta el botón "Cargar más" con el conteo real, o lo quita si ya se
 * pintaron todos los resultados.
 * @returns {void}
 */
function actualizarBotonCargarMas() {
  const contenedor = document.querySelector(contenedorSelector);
  if (!(contenedor instanceof HTMLElement)) return;

  const existente = document.querySelector('[data-testid="catalogo-cargar-mas"]');
  const restantes = resultadoActual.length - cantidadPintada;

  if (restantes <= 0) {
    existente?.remove();
    return;
  }

  const texto = `Cargar más baterías (quedan ${restantes})`;
  if (existente instanceof HTMLButtonElement) {
    existente.textContent = texto;
    return;
  }

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn--ghost';
  // display:flex + margin-inline:auto centra un botón block-level sin
  // envolverlo en un div nuevo; mismo patrón inline de espaciado puntual
  // que ya usan las páginas para grupos de CTA sueltos.
  boton.style.cssText = 'display:flex;margin-inline:auto;margin-top:var(--space-8)';
  boton.dataset.testid = 'catalogo-cargar-mas';
  boton.textContent = texto;
  boton.addEventListener('click', pintarSiguienteLote);
  contenedor.insertAdjacentElement('afterend', boton);
}

/**
 * Pinta el siguiente lote de tarjetas sin tocar las que ya están en pantalla
 * — un reemplazo completo del grid en cada clic reiniciaría el scroll y
 * volvería a animar tarjetas que el usuario ya vio.
 * @returns {void}
 */
function pintarSiguienteLote() {
  const contenedor = document.querySelector(contenedorSelector);
  if (!(contenedor instanceof HTMLElement)) return;

  const siguientes = resultadoActual.slice(cantidadPintada, cantidadPintada + LOTE);
  contenedor.insertAdjacentHTML('beforeend', siguientes.map(tarjetaProducto).join(''));
  cantidadPintada += siguientes.length;

  // Solo anima las tarjetas recién agregadas: revealOnScroll vuelve a poner
  // opacity:0 en todo lo que matchee el selector, así que si se re-observaran
  // las ya visibles, la pantalla entera parpadearía en cada "cargar más".
  revealOnScroll(`${contenedorSelector} .producto:not([data-revelado])`, { stagger: 50 });
  contenedor.querySelectorAll('.producto:not([data-revelado])')
    .forEach((el) => el.setAttribute('data-revelado', ''));

  actualizarBotonCargarMas();
}

/**
 * Carga y pinta el catálogo.
 * @param {Object} [filtros]
 * @param {string} [contenedorDestino] - testid selector del grid donde pintar.
 *   Por defecto el del catálogo; el buscador de la landing lo apunta a la
 *   vitrina de "Nuestro catálogo" para pintar resultados ahí mismo, sin navegar.
 * @returns {Promise<void>}
 */
export async function renderCatalogo(filtros = {}, contenedorDestino = '[data-testid="catalogo-grid"]') {
  contenedorSelector = contenedorDestino;
  const contenedor = document.querySelector(contenedorSelector);
  if (!(contenedor instanceof HTMLElement)) return;

  document.querySelector('[data-testid="catalogo-cargar-mas"]')?.remove();
  contenedor.innerHTML = skeletons();

  const r = await fetchProductos(filtros);

  if (!r.ok) {
    contenedor.innerHTML = vacio('No pudimos cargar el catálogo');
    toast(r.error, { tipo: 'warning' });
    return;
  }

  if (r.data.length === 0) {
    resultadoActual = [];
    cantidadPintada = 0;
    contenedor.innerHTML = vacio('No encontramos baterías con esos filtros');
    return;
  }

  resultadoCompleto = r.data;
  aplicarBusqueda();
}

/**
 * Filtra lo ya cargado por el texto del buscador y repinta. No vuelve a pedir
 * nada a la API: con los productos en memoria el filtrado es instantáneo, que
 * es justo lo que hace que el buscador se sienta vivo mientras se escribe.
 * @returns {void}
 */
function aplicarBusqueda() {
  const contenedor = document.querySelector(contenedorSelector);
  if (!(contenedor instanceof HTMLElement)) return;

  const termino = normalizar(terminoBusqueda).trim();
  resultadoActual = termino
    ? resultadoCompleto.filter((p) => normalizar(`${p.name} ${p.brand}`).includes(termino))
    : resultadoCompleto;

  document.querySelector('[data-testid="catalogo-cargar-mas"]')?.remove();
  cantidadPintada = 0;

  if (resultadoActual.length === 0) {
    contenedor.innerHTML = vacio(
      termino ? `No encontramos baterías que digan "${esc(terminoBusqueda.trim())}"` : 'No encontramos baterías con esos filtros'
    );
  } else {
    contenedor.innerHTML = '';
    pintarSiguienteLote();
  }
}

/**
 * Refleja el término buscado en la URL. Igual que el filtro de marca, con
 * replaceState: escribir 8 letras no debe dejar 8 entradas de historial que el
 * usuario tenga que atravesar con "Atrás" para salir del catálogo.
 * @param {string} termino
 * @returns {void}
 */
function actualizarUrlBusqueda(termino) {
  const url = new URL(location.href);
  if (termino.trim()) {
    url.searchParams.set('q', termino.trim());
  } else {
    url.searchParams.delete('q');
  }
  history.replaceState(null, '', url);
}

/**
 * Buscador por nombre o marca de batería.
 *
 * El campo vive en la barra de navegación (`.nav__search`), no dentro del
 * catálogo: es un `<form method="get" action="catalogo.html">` que, en
 * cualquier otra página, navega al catálogo con `?q=` sin necesitar JS. Acá,
 * ya estando en el catálogo, se intercepta el envío y se filtra en memoria —
 * recargar la página para filtrar algo que ya está descargado sería tirar el
 * trabajo hecho.
 * @returns {void}
 */
function initBuscadorProductos() {
  const entrada = document.querySelector('[data-testid="buscador-input"]');
  const limpiar = document.querySelector('[data-testid="buscador-limpiar"]');
  const formulario = document.querySelector('[data-testid="nav-search"]');
  if (!(entrada instanceof HTMLInputElement)) return;

  // Término inicial desde la URL: así funciona llegar desde otra página, y
  // también compartir o recargar un enlace de búsqueda.
  const inicial = new URLSearchParams(location.search).get('q') ?? '';
  if (inicial) {
    entrada.value = inicial;
    terminoBusqueda = inicial;
    if (limpiar instanceof HTMLElement) limpiar.hidden = false;
  }

  // Ya estando en el catálogo, enviar el formulario recargaría la página para
  // llegar al mismo sitio donde ya se está.
  formulario?.addEventListener('submit', (e) => {
    e.preventDefault();
    entrada.blur();
  });

  entrada.addEventListener('input', () => {
    terminoBusqueda = entrada.value;
    if (limpiar instanceof HTMLElement) limpiar.hidden = terminoBusqueda.trim() === '';
    actualizarUrlBusqueda(terminoBusqueda);
    aplicarBusqueda();
  });

  limpiar?.addEventListener('click', () => {
    entrada.value = '';
    terminoBusqueda = '';
    if (limpiar instanceof HTMLElement) limpiar.hidden = true;
    actualizarUrlBusqueda('');
    entrada.focus();
    aplicarBusqueda();
  });
}

/**
 * Refleja el filtro de marca activo en la URL sin apilar historial: cada clic
 * en un chip reemplaza la entrada actual (replaceState), no crea una nueva —
 * si el usuario prueba 5 marcas seguidas, "Atrás" no debería obligarlo a
 * pasar por las 5 antes de salir del catálogo. Sí habilita compartir el link
 * y recargar la página sin perder el filtro.
 * @param {string} marca
 * @returns {void}
 */
function actualizarUrlMarca(marca) {
  const url = new URL(location.href);
  if (marca) {
    url.searchParams.set('marca', marca);
  } else {
    url.searchParams.delete('marca');
  }
  history.replaceState(null, '', url);
}

/**
 * Filtro por marca de batería.
 * @returns {Promise<void>}
 */
async function initFiltroMarcas() {
  const contenedor = document.querySelector('[data-testid="filtro-marcas"]');
  if (!(contenedor instanceof HTMLElement)) return;

  const r = await fetchMarcas();
  if (!r.ok || r.data.length === 0) return;

  const marcaInicial = new URLSearchParams(location.search).get('marca') ?? '';

  contenedor.innerHTML = [
    `<button type="button" class="chip${marcaInicial ? '' : ' chip--activa'}" data-marca="">Todas</button>`,
    ...r.data.map((m) => `<button type="button" class="chip${m === marcaInicial ? ' chip--activa' : ''}" data-marca="${esc(m)}">${esc(m)}</button>`),
  ].join('');

  contenedor.addEventListener('click', (e) => {
    const boton = e.target;
    if (!(boton instanceof HTMLElement) || !boton.classList.contains('chip')) return;

    contenedor.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--activa'));
    boton.classList.add('chip--activa');
    actualizarUrlMarca(boton.dataset.marca ?? '');
    renderCatalogo(boton.dataset.marca ? { brand: boton.dataset.marca } : {});
  });
}

/**
 * Buscador en cascada Marca → Modelo → Año — reutilizable: cablea los 3
 * selects y el submit de CUALQUIER formulario con esos data-testid (mismo
 * marcado en index.html y catalogo.html), pero deja que quien llama decida
 * qué pasa al enviar (filtrar en el propio catálogo, o navegar a él).
 *
 * Cada nivel se habilita solo cuando el anterior tiene valor: ofrecer un
 * desplegable vacío es peor que no ofrecerlo, porque el usuario lo abre,
 * no encuentra nada y concluye que el sitio está roto.
 *
 * @param {HTMLFormElement} form
 * @param {(seleccion: { make: string, model: string, year?: number }) => void} alEnviar
 * @returns {Promise<void>}
 */
export async function initBuscadorVehiculo(form, alEnviar) {
  const selMarca = form.querySelector('[data-testid="finder-marca"]');
  const selModelo = form.querySelector('[data-testid="finder-modelo"]');
  const selAnio = form.querySelector('[data-testid="finder-anio"]');

  if (!(selMarca instanceof HTMLSelectElement)) return;

  // Las marcas y modelos de vehículo viven en el campo `compatibility` de los
  // productos: no hay endpoint público que los liste.
  const r = await fetchProductos();
  if (!r.ok) return;

  const vehiculos = extraerVehiculos(r.data);
  if (vehiculos.size === 0) return;

  selMarca.innerHTML = '<option value="">Selecciona una marca</option>' +
    [...vehiculos.keys()].sort()
      .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');

  selMarca.addEventListener('change', () => {
    if (!(selModelo instanceof HTMLSelectElement)) return;

    const modelos = vehiculos.get(selMarca.value);
    if (!modelos) {
      selModelo.innerHTML = '<option value="">Primero elige la marca</option>';
      selModelo.disabled = true;
      return;
    }

    selModelo.innerHTML = '<option value="">Selecciona el modelo</option>' +
      [...modelos].sort().map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    selModelo.disabled = false;

    if (selAnio instanceof HTMLSelectElement) {
      selAnio.innerHTML = '<option value="">Primero elige el modelo</option>';
      selAnio.disabled = true;
    }
  });

  selModelo?.addEventListener('change', async () => {
    if (!(selAnio instanceof HTMLSelectElement) || !(selModelo instanceof HTMLSelectElement)) return;
    if (!selModelo.value) return;

    selAnio.innerHTML = '<option value="">Cargando…</option>';
    selAnio.disabled = true;

    const anios = await fetchAnios(selMarca.value, selModelo.value);

    if (!anios.ok || anios.data.length === 0) {
      // Sin años en la base, el año deja de ser obligatorio: el usuario ya
      // dio marca y modelo, que es suficiente para cotizar.
      selAnio.innerHTML = '<option value="">Cualquier año</option>';
      selAnio.disabled = false;
      return;
    }

    selAnio.innerHTML = '<option value="">Cualquier año</option>' +
      anios.data.sort((a, b) => b - a)
        .map((a) => `<option value="${a}">${a}</option>`).join('');
    selAnio.disabled = false;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!selMarca.value) {
      toast('Elige la marca de tu vehículo para continuar.', { tipo: 'warning' });
      selMarca.focus();
      return;
    }

    alEnviar({
      make: selMarca.value,
      model: selModelo instanceof HTMLSelectElement ? selModelo.value : '',
      year: selAnio instanceof HTMLSelectElement && selAnio.value ? Number(selAnio.value) : undefined,
    });
  });
}

/**
 * Cablea el buscador del propio catálogo: al enviar, filtra en sitio (no
 * navega a ningún lado, ya está en la página) y sube hasta la rejilla.
 * @returns {Promise<void>}
 */
async function initBuscadorCascada() {
  const form = document.querySelector('[data-testid="finder-form"]');
  if (!(form instanceof HTMLFormElement)) return;

  await initBuscadorVehiculo(form, (seleccion) => {
    renderCatalogo(seleccion);
    document.querySelector('[data-testid="catalogo-grid"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * Arranca el catálogo si la página lo tiene.
 * @returns {void}
 */
export function initCatalogo() {
  // Solo en la página que tiene la rejilla. Sin esta guarda, la landing
  // registraría un segundo manejador del submit del buscador: uno navegaría
  // al catálogo y el otro haría preventDefault para filtrar en sitio, y el
  // botón dejaría de llevar a ninguna parte.
  if (!document.querySelector('[data-testid="catalogo-grid"]')) return;

  // La marca de batería (Bosch, Etna...) puede venir por `?marca=` — lo usan
  // los chips de marca de otras páginas. El vehículo (Toyota Corolla 2018...)
  // llega por `?make=&model=&year=` — el buscador horizontal de la landing.
  const params = new URLSearchParams(location.search);
  const marca = params.get('marca') ?? '';
  const make = params.get('make') ?? '';
  const model = params.get('model') ?? '';
  const year = params.get('year');

  initBuscadorProductos();
  void initFiltroMarcas();
  void initBuscadorCascada();
  void renderCatalogo({
    ...(marca ? { brand: marca } : {}),
    ...(make ? { make } : {}),
    ...(model ? { model } : {}),
    ...(year ? { year: Number(year) } : {}),
  });
}
