// @ts-check
/**
 * @module cobertura-config
 * @description Título/bajada de "Cobertura confirmada", el título de
 * "Atendemos siempre", y la lista de zonas + distritos de cobertura.html —
 * todo estaba escrito a mano en el HTML sin ningún campo en el panel; el
 * jefe reportó que no podía editar la información de cobertura.
 *
 * Las zonas son una lista abierta (no un número fijo de tarjetas, a
 * diferencia de servicios/nosotros): a diferencia del resto de módulos, este
 * SÍ reconstruye el contenido del contenedor (replaceChildren), no solo
 * texto de nodos ya existentes.
 *
 * Mejora progresiva: el HTML ya trae las zonas de hoy como valor por
 * defecto. Si la API no responde, la página se ve exactamente igual.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @param {string} nombre
 * @param {string[]} distritos
 * @returns {HTMLDivElement}
 */
function crearZona(nombre, distritos) {
  const div = document.createElement('div');
  div.className = 'districts-zona';
  // El pie de página enlaza a cobertura.html#callao — conservar el ancla si
  // la zona (con este nombre u otro) sigue siendo la de Callao.
  if (nombre.trim().toLowerCase() === 'callao') div.id = 'callao';

  const h3 = document.createElement('h3');
  h3.className = 'districts-zona__titulo';
  h3.textContent = nombre;
  div.appendChild(h3);

  const ul = document.createElement('ul');
  ul.className = 'districts';
  distritos.forEach((d) => {
    const li = document.createElement('li');
    li.textContent = d;
    ul.appendChild(li);
  });
  div.appendChild(ul);

  return div;
}

/**
 * @returns {Promise<void>}
 */
export async function aplicarCobertura() {
  const nodos = document.querySelectorAll('[data-cobertura-rol]');
  const contenedorZonas = document.querySelector('[data-testid="distritos"]');
  if (nodos.length === 0 && !contenedorZonas) return;

  /** @type {{ distritosTitulo?: string, distritosBajada?: string, horariosTitulo?: string, horarioResumenTitulo?: string, horarioResumenTexto?: string, faqPregunta?: string, faqRespuesta?: string, zonas?: Array<{ nombre?: string, distritos?: string[] }> } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/cobertura.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: el texto/zonas por defecto que ya trae el HTML se quedan tal cual.
    return;
  }
  if (!datos) return;

  const mapa = {
    'distritos-titulo': datos.distritosTitulo,
    'distritos-bajada': datos.distritosBajada,
    'horarios-titulo': datos.horariosTitulo,
    'horario-resumen-titulo': datos.horarioResumenTitulo,
    'horario-resumen-texto': datos.horarioResumenTexto,
    'faq-pregunta': datos.faqPregunta,
    'faq-respuesta': datos.faqRespuesta,
  };
  nodos.forEach((nodo) => {
    const rol = /** @type {HTMLElement} */ (nodo).dataset.coberturaRol;
    const valor = rol ? mapa[rol] : undefined;
    if (valor) nodo.textContent = valor;
  });

  const zonas = Array.isArray(datos.zonas) ? datos.zonas : [];
  const validas = zonas.filter(
    (z) => typeof z?.nombre === 'string' && z.nombre.trim() && Array.isArray(z.distritos) && z.distritos.length > 0
  );
  // Sin zonas reales (BD caída, o el panel las vació sin querer): no hay
  // nada mejor que mostrar que la lista fija de hoy.
  if (contenedorZonas && validas.length > 0) {
    contenedorZonas.replaceChildren(
      ...validas.map((z) => crearZona(/** @type {string} */ (z.nombre), /** @type {string[]} */ (z.distritos)))
    );
  }
}
