// @ts-check
/**
 * @module sheet
 * @description Panel inferior arrastrable (bottom sheet).
 *
 * El gesto y la animación comparten el mismo motor de física: al soltar, el
 * resorte arranca con la velocidad que traía el dedo. Por eso un arrastre
 * rápido y corto cierra el panel aunque no haya recorrido la distancia
 * mínima — se siente como empujar un objeto real, no como cruzar un umbral.
 */

import { SPRING, animateSpring, prefersReducedMotion } from '../motion/springs.js';

/** Arrastre mínimo para cerrar. Menos que esto cierra por accidente al hacer scroll. */
const CLOSE_THRESHOLD_PX = 110;

/** Velocidad que cierra aunque no se alcance el umbral: un empujón rápido. */
const CLOSE_VELOCITY = 0.55;

/**
 * @typedef {Object} SheetHandle
 * @property {() => void} open
 * @property {() => void} close
 * @property {HTMLElement} element
 */

/**
 * @param {Object} opciones
 * @param {string} opciones.testId
 * @param {string} opciones.title
 * @param {HTMLElement} opciones.content
 * @returns {SheetHandle}
 */
export function createSheet({ testId, title, content }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay hidden';
  overlay.dataset.testid = `${testId}-overlay`;

  const sheet = document.createElement('div');
  sheet.className = 'sheet hidden';
  sheet.dataset.testid = testId;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);

  const asa = document.createElement('div');
  asa.className = 'sheet__handle';
  asa.dataset.testid = `${testId}-handle`;
  asa.innerHTML = '<span class="sheet__handle-bar"></span>';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'sheet__body';
  cuerpo.append(content);

  sheet.append(asa, cuerpo);
  document.body.append(overlay, sheet);

  let arrastrando = false;
  let inicioY = 0;
  let inicioTiempo = 0;
  let desplazamiento = 0;
  /** @type {HTMLElement|null} */
  let focoPrevio = null;
  /** @type {(() => void)|null} */
  let cancelarAnimacion = null;

  /** @param {number} px */
  function aplicarDesplazamiento(px) {
    sheet.style.transform = `translateY(${px}px)`;
  }

  function open() {
    focoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    overlay.classList.remove('hidden');
    sheet.classList.remove('hidden');
    // Bloquea el scroll del fondo: sin esto la página se desplaza detrás del
    // panel, que es el defecto más común de los modales en móvil.
    document.body.style.overflow = 'hidden';

    const alto = sheet.offsetHeight || 400;

    if (prefersReducedMotion()) {
      aplicarDesplazamiento(0);
      overlay.style.opacity = '1';
    } else {
      overlay.style.opacity = '0';
      cancelarAnimacion?.();
      cancelarAnimacion = animateSpring({
        from: alto,
        to: 0,
        spring: SPRING.gentle,
        onUpdate: (v) => {
          aplicarDesplazamiento(v);
          // El velo se aclara en proporción al avance del panel: los dos
          // elementos se sienten parte del mismo movimiento.
          overlay.style.opacity = String(1 - v / alto);
        },
        onComplete: () => { overlay.style.opacity = '1'; },
      });
    }

    const primerFoco = sheet.querySelector('button, [href], input, select, textarea');
    if (primerFoco instanceof HTMLElement) primerFoco.focus();

    document.addEventListener('keydown', alPulsarTecla);
  }

  /** @param {number} [velocidadInicial] */
  function close(velocidadInicial = 0) {
    const alto = sheet.offsetHeight || 400;

    function terminar() {
      sheet.classList.add('hidden');
      overlay.classList.add('hidden');
      sheet.style.transform = '';
      desplazamiento = 0;
      document.body.style.overflow = '';
      focoPrevio?.focus();
    }

    if (prefersReducedMotion()) {
      terminar();
    } else {
      cancelarAnimacion?.();
      cancelarAnimacion = animateSpring({
        from: desplazamiento,
        to: alto,
        velocity: velocidadInicial * 1000,
        spring: SPRING.gentle,
        onUpdate: (v) => {
          aplicarDesplazamiento(v);
          overlay.style.opacity = String(Math.max(0, 1 - v / alto));
        },
        onComplete: terminar,
      });
    }

    document.removeEventListener('keydown', alPulsarTecla);
  }

  /** @param {KeyboardEvent} e */
  function alPulsarTecla(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    // Atrapa el foco: con el panel abierto, el tabulador no debe llevarse al
    // usuario a los enlaces de la página que quedó detrás.
    const focalizables = sheet.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const primero = focalizables[0];
    const ultimo = focalizables[focalizables.length - 1];
    if (!(primero instanceof HTMLElement) || !(ultimo instanceof HTMLElement)) return;

    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  asa.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    inicioY = e.clientY;
    inicioTiempo = performance.now();
    cancelarAnimacion?.();
    asa.setPointerCapture(e.pointerId);
  });

  asa.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    const delta = e.clientY - inicioY;
    // Solo hacia abajo: arrastrar hacia arriba no debe despegar el panel del
    // borde inferior de la pantalla.
    if (delta <= 0) return;
    desplazamiento = delta;
    aplicarDesplazamiento(delta);
  });

  asa.addEventListener('pointerup', (e) => {
    if (!arrastrando) return;
    arrastrando = false;

    const delta = Math.max(0, e.clientY - inicioY);
    const velocidad = delta / Math.max(1, performance.now() - inicioTiempo);

    if (delta > CLOSE_THRESHOLD_PX || velocidad > CLOSE_VELOCITY) {
      close(velocidad);
      return;
    }

    // No alcanzó el umbral: vuelve a su sitio con resorte, no de golpe.
    cancelarAnimacion = animateSpring({
      from: delta,
      to: 0,
      spring: SPRING.gentle,
      onUpdate: aplicarDesplazamiento,
      onComplete: () => { desplazamiento = 0; },
    });
  });

  overlay.addEventListener('click', () => close());

  return { open: () => open(), close: () => close(), element: sheet };
}
