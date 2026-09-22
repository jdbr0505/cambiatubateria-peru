// @ts-check
/**
 * @module toast
 * @description Avisos apilados que no interrumpen.
 *
 * Un `alert()` bloquea la página y obliga a confirmar. Con un cliente varado
 * eso es un paso de más entre él y el auxilio. El toast informa sin detener:
 * aparece, se lee, se va solo.
 */

import { SPRING, animateSpring, prefersReducedMotion } from '../motion/springs.js';

/** @type {HTMLElement|null} */
let pila = null;

/** Los avisos de error duran más: hay que leerlos y a veces actuar. */
const DURACION = { info: 3800, success: 3200, warning: 5200, urgent: 6500 };

/**
 * @returns {HTMLElement}
 */
function obtenerPila() {
  if (pila) return pila;
  pila = document.createElement('div');
  pila.className = 'toast-stack';
  pila.dataset.testid = 'toast-stack';
  // aria-live polite: el lector de pantalla lo anuncia al terminar lo que está
  // leyendo, sin cortar al usuario a media frase.
  pila.setAttribute('aria-live', 'polite');
  pila.setAttribute('aria-atomic', 'false');
  document.body.append(pila);
  return pila;
}

/**
 * Muestra un aviso.
 *
 * @param {string} mensaje
 * @param {Object} [opciones]
 * @param {'info'|'success'|'warning'|'urgent'} [opciones.tipo='info']
 * @param {number} [opciones.duracion] - Milisegundos. Por defecto según el tipo.
 * @returns {() => void} Cierra el aviso antes de tiempo.
 */
export function toast(mensaje, { tipo = 'info', duracion } = {}) {
  const contenedor = obtenerPila();

  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.dataset.testid = `toast-${tipo}`;
  el.setAttribute('role', tipo === 'urgent' || tipo === 'warning' ? 'alert' : 'status');
  el.textContent = mensaje;

  contenedor.append(el);

  /** @type {(() => void)|null} */
  let cancelar = null;

  if (!prefersReducedMotion()) {
    el.style.opacity = '0';
    cancelar = animateSpring({
      from: 24,
      to: 0,
      spring: SPRING.bouncy,
      onUpdate: (v) => {
        el.style.transform = `translateY(${v}px)`;
        el.style.opacity = String(Math.max(0, 1 - v / 24));
      },
      onComplete: () => { el.style.opacity = '1'; el.style.transform = ''; },
    });
  }

  let cerrado = false;

  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    cancelar?.();

    if (prefersReducedMotion()) { el.remove(); return; }

    animateSpring({
      from: 0,
      to: 20,
      spring: SPRING.gentle,
      onUpdate: (v) => {
        el.style.transform = `translateY(${v}px)`;
        el.style.opacity = String(Math.max(0, 1 - v / 20));
      },
      onComplete: () => el.remove(),
    });
  }

  const temporizador = setTimeout(cerrar, duracion ?? DURACION[tipo]);

  // Tocar el aviso lo cierra: si el usuario ya lo leyó, no tiene que esperar.
  el.addEventListener('click', cerrar);

  return cerrar;
}
