// @ts-check
/**
 * @module contacto-config
 * @description Correo de contacto configurable desde el panel admin (pestaña
 * "Ubicación", `contacto.php`). Hasta ahora esa pestaña no tenía ningún
 * consumidor en el sitio público — el jefe editaba el correo ahí y no
 * cambiaba nada en la página real (ver la nota en docs/HANDOFF.md).
 *
 * Dos roles, porque no todos los links de correo muestran el correo como
 * texto: la tarjeta de Contacto sí ("email-texto"), el link "Escríbenos" del
 * pie de las 10 páginas no (solo el href debe apuntar al correo nuevo, el
 * texto visible se queda como está).
 *
 * Mejora progresiva, mismo patrón que el resto: el HTML ya trae el correo de
 * hoy. Si la API no responde, la página se ve exactamente igual.
 */

const BASE = '/pagbateria/backend/api';

/**
 * @returns {Promise<void>}
 */
export async function aplicarContacto() {
  const nodosTexto = document.querySelectorAll('[data-contacto-rol="email-texto"]');
  const nodosLink = document.querySelectorAll('[data-contacto-rol="email-link"]');
  if (nodosTexto.length === 0 && nodosLink.length === 0) return;

  /** @type {{ email?: string | null } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/contacto.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: el correo por defecto que ya trae el HTML se queda tal cual.
    return;
  }

  const email = typeof datos?.email === 'string' ? datos.email.trim() : '';
  if (!email) return;

  nodosTexto.forEach((nodo) => {
    if (!(nodo instanceof HTMLAnchorElement)) return;
    nodo.href = `mailto:${email}`;
    nodo.textContent = email;
  });

  nodosLink.forEach((nodo) => {
    if (!(nodo instanceof HTMLAnchorElement)) return;
    nodo.href = `mailto:${email}`;
  });
}
