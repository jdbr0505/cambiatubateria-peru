// @ts-check
/**
 * @module whatsapp-asesores
 * @description Convierte el botón flotante de WhatsApp en un selector de
 * asesores — mismo patrón que el popover de "El Mundo de las Baterías" que
 * pidió el jefe. Pedido explícito: el selector es OBLIGATORIO, no condicional
 * a tener 2+ asesores cargados — si el panel todavía no tiene ninguno, se
 * arma con una sola fila usando el número principal de siempre (pestaña
 * WhatsApp), para que el selector exista desde el primer momento y sea
 * cuestión de agregar filas en el panel, no de "activar" nada.
 *
 * Mejora progresiva: si la API no responde, no se toca nada — el botón
 * flotante de siempre sigue funcionando como link directo.
 */

import { getWhatsappNumeroSync, whatsappListo } from '../lib/whatsapp-config.js';

const BASE = '/pagbateria/backend/api';

/**
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

/**
 * @param {string} nombre
 * @returns {string}
 */
function inicial(nombre) {
  return (nombre.trim().charAt(0) || '?').toUpperCase();
}

const ICONO_WHATSAPP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

/**
 * @returns {Promise<void>}
 */
export async function initWhatsappAsesores() {
  const original = document.querySelector('[data-testid="floating-cta-whatsapp"]');
  if (!(original instanceof HTMLAnchorElement)) return;

  /** @type {{ asesores?: Array<{ nombre?: string, rol?: string, numero?: string }> } | null} */
  let datos = null;
  try {
    const r = await fetch(`${BASE}/whatsapp_asesores.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    // Sin conexión: seguimos, el fallback de abajo cubre este caso también.
  }

  const asesores = (datos?.asesores || []).filter(
    (a) => typeof a?.nombre === 'string' && a.nombre.trim() && typeof a?.numero === 'string' && /^\d{9,11}$/.test(a.numero)
  );

  if (asesores.length === 0) {
    // Panel sin asesores configurados (o sin conexión): la card sigue
    // obligatoria, con una sola fila que usa el número principal de siempre
    // (getWhatsappNumeroSync() nunca devuelve vacío — cae al valor por
    // defecto horneado en whatsapp-config.js si la API no contestó).
    await whatsappListo();
    asesores.push({ nombre: 'Atención al cliente', numero: getWhatsappNumeroSync() });
  }

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = original.className;
  boton.setAttribute('data-testid', 'floating-cta-whatsapp');
  boton.setAttribute('aria-haspopup', 'dialog');
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-label', original.getAttribute('aria-label') || 'Chatea por WhatsApp');
  boton.innerHTML = original.innerHTML;
  original.replaceWith(boton);

  const panel = document.createElement('div');
  panel.className = 'wa-asesores';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Elegir asesor de WhatsApp');
  panel.innerHTML = `
    <div class="wa-asesores__header">
      ${ICONO_WHATSAPP}
      <div class="wa-asesores__header-texto">
        <strong>Inicia una conversación</strong>
        <span>¡Respondemos al instante!</span>
      </div>
      <button type="button" class="wa-asesores__cerrar" aria-label="Cerrar">&times;</button>
    </div>
    <ul class="wa-asesores__lista">
      ${asesores
        .map(
          (a) => `
        <li>
          <a class="wa-asesores__item" href="https://wa.me/${encodeURIComponent(/** @type {string} */ (a.numero))}" target="_blank" rel="noopener">
            <span class="wa-asesores__avatar" aria-hidden="true">${esc(inicial(/** @type {string} */ (a.nombre)))}</span>
            <span class="wa-asesores__info">
              <strong>${esc(/** @type {string} */ (a.nombre))}</strong>
              ${a.rol ? `<small>${esc(a.rol)}</small>` : ''}
            </span>
            <span class="wa-asesores__icono" aria-hidden="true">${ICONO_WHATSAPP}</span>
          </a>
        </li>`
        )
        .join('')}
    </ul>`;
  boton.insertAdjacentElement('beforebegin', panel);

  /** @param {MouseEvent} e */
  const alClicFuera = (e) => {
    if (!(e.target instanceof Node)) return;
    if (panel.contains(e.target) || e.target === boton) return;
    cerrar();
  };
  /** @param {KeyboardEvent} e */
  const alEscape = (e) => {
    if (e.key === 'Escape') cerrar();
  };

  function abrir() {
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', alClicFuera, { capture: true });
    document.addEventListener('keydown', alEscape);
  }
  function cerrar() {
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', alClicFuera, { capture: true });
    document.removeEventListener('keydown', alEscape);
  }

  boton.addEventListener('click', () => (panel.hidden ? abrir() : cerrar()));
  panel.querySelector('.wa-asesores__cerrar')?.addEventListener('click', cerrar);
}
