// @ts-check
/**
 * @module cabeceras-config
 * @description Título/bajada de bloques de texto configurables desde el
 * panel admin (pestaña "Cabeceras"): la cabecera oscura (.hero--page) de
 * Catálogo, Servicios, Cobertura y Contacto, más "Cómo trabajamos" de
 * Servicios y la franja + "Nuestro catálogo" de Inicio. Nosotros usa su
 * propio módulo (nosotros-config.js) y el hero de Inicio el suyo
 * (hero-config.js).
 *
 * No hay lista de bloques hardcodeada acá: cualquier nodo con
 * data-cabecera-rol="<clave>-titulo" o "<clave>-bajada" se resuelve solo,
 * agregar un bloque nuevo es solo marcar el HTML y sumar la clave en
 * cabeceras.php (público y admin) — no toca este archivo.
 *
 * Mejora progresiva, mismo patrón que pagina-fotos.js: el HTML ya trae el
 * texto de hoy como valor por defecto. Si la API no responde, la página se
 * ve exactamente igual.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @returns {Promise<void>}
 */
export async function aplicarCabeceras() {
  const nodos = document.querySelectorAll('[data-cabecera-rol]');
  if (nodos.length === 0) return;

  /** @type {{ items?: Record<string, { titulo?: string, bajada?: string }> } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/cabeceras.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: el texto por defecto que ya trae el HTML se queda tal cual.
    return;
  }

  const items = datos?.items ?? {};
  nodos.forEach((nodo) => {
    const rol = /** @type {HTMLElement} */ (nodo).dataset.cabeceraRol;
    if (!rol) return;
    // rol viene como "catalogo-titulo" / "catalogo-bajada": separa en la
    // última "-" para no romper con páginas que tuvieran guion en el nombre.
    const guion = rol.lastIndexOf('-');
    if (guion === -1) return;
    const pagina = rol.slice(0, guion);
    const campo = rol.slice(guion + 1);
    const valor = items[pagina]?.[/** @type {'titulo'|'bajada'} */ (campo)];
    if (valor) nodo.textContent = valor;
  });
}
