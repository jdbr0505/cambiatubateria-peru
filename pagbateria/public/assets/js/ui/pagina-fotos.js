// @ts-check
/**
 * @module pagina-fotos
 * @description Reemplaza en tiempo de carga las fotos que el panel admin haya
 * subido para reemplazar las de fábrica (pestaña "Fotos", pagina_fotos.php).
 *
 * Mejora progresiva, no dependencia: cada <img data-foto-slug="..."> ya trae
 * en el propio HTML la foto correcta de hoy como valor por defecto. Si la API
 * no responde, o el admin nunca subió nada para ese slot, la página se ve
 * exactamente igual — nunca hay un hueco ni una foto rota esperando a JS.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @returns {Promise<void>}
 */
export async function initPaginaFotos() {
  const nodos = document.querySelectorAll('[data-foto-slug]');
  if (nodos.length === 0) return;

  /** @type {{ items?: Record<string, { path?: string, alt?: string }> } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/pagina_fotos.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: la foto por defecto que ya trae el HTML se queda tal cual.
    return;
  }

  // El HTML trae la foto de hoy como ruta relativa ("assets/img/..."), pero
  // pagina_fotos.php (BD y su respaldo JSON) guarda rutas absolutas
  // ("/pagbateria/public/assets/img/..."). El .htaccess hace que las dos
  // sirvan el mismo archivo (ver la reescritura general hacia
  // pagbateria/public), pero son dos STRINGS de URL distintos — sin esta
  // comparación, `nodo.src = entrada.path` se ejecutaba SIEMPRE que la API
  // contestara, aunque la foto fuera exactamente la misma. El navegador veía
  // una URL nueva, abortaba la descarga en curso de la ruta relativa y
  // empezaba otra por la ruta absoluta: mismo píxel final, pero un parpadeo
  // real en el camino. Pasaba en Nosotros y Contacto porque su foto está a
  // la vista apenas carga la sección — en el resto pasa igual pero se nota
  // menos (foto de fondo, detrás de una tarjeta, etc.).
  const stem = (s) => (s.split('/').pop() || '').replace(/\.[a-z]+$/i, '').replace(/-\d+$/, '');

  const items = datos?.items ?? {};
  /** @type {Promise<void>[]} */
  const cargas = [];
  nodos.forEach((nodo) => {
    if (!(nodo instanceof HTMLImageElement)) return;
    const slug = nodo.dataset.fotoSlug;
    const entrada = slug ? items[slug] : undefined;
    if (!entrada?.path) return;
    // Mismo archivo que el que ya está en el HTML (nombre base, ignorando
    // ruta y el sufijo de tamaño del srcset responsivo): no hay nada que
    // reemplazar, tocar .src solo causaría el parpadeo de arriba.
    if (stem(entrada.path) === stem(nodo.getAttribute('src') || '')) return;
    // Es una foto DISTINTA subida desde el panel: si el nodo tiene srcset
    // (hoy solo el hero), hay que quitarlo — si no, el navegador seguiría
    // eligiendo entre las variantes viejas e ignoraría el src nuevo.
    if (nodo.srcset) {
      nodo.srcset = '';
      nodo.sizes = '';
    }
    // initPaginaFotos() resolvía en cuanto se asignaba .src, sin esperar a
    // que la imagen nueva terminara de bajar — revelarContenidoEditable()
    // veía la promesa asentada y quitaba visibility:hidden con la foto
    // todavía a medio cargar (parpadeo/hueco en vivo, con BD real, nunca
    // reproducible en local porque sin MySQL la foto nunca cambia de
    // verdad). Ahora se espera el evento load/error de cada imagen que sí
    // cambia antes de devolver la promesa.
    cargas.push(new Promise((resolve) => {
      nodo.addEventListener('load', () => resolve(), { once: true });
      nodo.addEventListener('error', () => resolve(), { once: true });
    }));
    nodo.src = entrada.path;
    if (entrada.alt) nodo.alt = entrada.alt;
  });

  await Promise.allSettled(cargas);
}
