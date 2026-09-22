// @ts-check
/**
 * @module marcas-lista-config
 * @description Orden y logos de la tira de marcas del hero (`.logos-strip`),
 * configurables desde el panel admin (pestaña "Marcas"). Mismo patrón que
 * hero-config.js/nosotros-config.js: mejora progresiva, solo reemplaza la
 * fila fija del HTML si `brands.php` trae marcas reales con logo. Si la BD
 * no responde, o el respaldo JSON solo trae nombres (sin `logo_path`), la
 * fila de 8 marcas ya escrita en el HTML se queda tal cual — nunca se borra
 * antes de tener con qué reemplazarla.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @param {string} nombre
 * @param {string} ruta
 * @returns {HTMLLIElement}
 */
function crearItem(nombre, ruta) {
  const li = document.createElement('li');
  li.className = 'logos-strip__item';
  const img = document.createElement('img');
  img.src = ruta;
  img.alt = nombre;
  img.decoding = 'async';
  li.appendChild(img);
  return li;
}

/**
 * @returns {Promise<void>}
 */
export async function aplicarMarcasLista() {
  const lista = document.querySelector('[data-testid="marcas-list"]');
  if (!(lista instanceof HTMLElement)) return;

  /** @type {{name?: string, logoPath?: string|null}[]} */
  let items = [];
  try {
    const r = await fetch(`${BASE}/brands.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return;
    const datos = await r.json();
    items = Array.isArray(datos?.items) ? datos.items : [];
  } catch {
    // Sin conexión: la fila fija del HTML se queda tal cual.
    return;
  }

  const conLogo = items
    .map((it) => ({
      name: String(it?.name ?? '').trim(),
      // El panel admin a veces guarda la ruta con backslash de Windows.
      logoPath: it?.logoPath ? String(it.logoPath).replace(/\\/g, '/') : null,
    }))
    .filter((it) => it.name && it.logoPath);

  // Sin logos reales (BD caída, o marcas del panel aún sin logo subido): no
  // hay nada mejor que mostrar que la fila fija de hoy.
  if (conLogo.length === 0) return;

  lista.replaceChildren(...conLogo.map((it) => crearItem(it.name, /** @type {string} */ (it.logoPath))));
}
