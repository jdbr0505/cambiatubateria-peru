// @ts-check
/**
 * @module button
 * @description Microinteracción táctil de los botones.
 *
 * Se engancha a los botones que ya existen en el HTML en vez de crearlos desde
 * JavaScript. Así el sitio funciona sin JS: los botones están en el marcado,
 * el resorte es un añadido. Si el script falla, el auxilio se sigue pudiendo
 * pedir.
 */

import { SPRING, PRESS_SCALE, springTransform, prefersReducedMotion } from '../motion/springs.js';

/**
 * Da respuesta táctil a un botón.
 *
 * @param {HTMLElement} el
 * @returns {void}
 */
function enlazarPulsacion(el) {
  /** @type {(() => void)|null} */
  let cancelar = null;
  let escalaActual = 1;

  /** @param {number} destino */
  function animarA(destino) {
    cancelar?.();
    cancelar = springTransform(el, {
      property: 'scale',
      from: escalaActual,
      to: destino,
      spring: SPRING.snappy,
    });
    escalaActual = destino;
  }

  // pointerdown, no click: el resorte debe arrancar cuando el dedo toca, no
  // cuando lo levanta. Un retardo de 100 ms aquí ya se percibe como lentitud.
  el.addEventListener('pointerdown', () => animarA(PRESS_SCALE));

  // Los tres eventos de salida importan: pointerup es el toque normal,
  // pointerleave cubre arrastrar el dedo fuera del botón, y pointercancel
  // cubre cuando el sistema se lleva el gesto (una llamada entrante, por
  // ejemplo). Sin los tres, el botón se queda encogido.
  el.addEventListener('pointerup', () => animarA(1));
  el.addEventListener('pointerleave', () => animarA(1));
  el.addEventListener('pointercancel', () => animarA(1));
}

/**
 * Activa la microinteracción en todos los botones y enlaces de acción.
 * @returns {void}
 */
export function initButtons() {
  if (prefersReducedMotion()) return;

  const botones = document.querySelectorAll('.btn, .nav__toggle');
  for (const el of botones) {
    if (el instanceof HTMLElement) enlazarPulsacion(el);
  }
}
