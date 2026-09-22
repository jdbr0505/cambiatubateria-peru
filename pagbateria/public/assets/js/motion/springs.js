// @ts-check
/**
 * @module springs
 * @description Física de resorte para las microinteracciones del sitio.
 *
 * POR QUÉ RESORTE Y NO DURACIÓN FIJA
 * Una transición con duración fija no sabe de dónde viene: si el usuario toca
 * otra vez a mitad de camino, el elemento salta a la posición inicial y vuelve
 * a empezar. Un resorte arranca desde donde está y con la velocidad que traía,
 * así que la interrupción se siente continua. Eso es lo que separa una interfaz
 * que se siente nativa de una que se siente "animada".
 *
 * Implementación propia en vez de una librería: motion.dev pesa ~18 KB y aquí
 * solo se necesita el integrador. El presupuesto es FCP < 0.8 s, y cada KB de
 * JavaScript en la landing se paga en el Quality Score de Google Ads.
 */

/**
 * @typedef {Object} SpringPreset
 * @property {number} stiffness - Rigidez. Más alto = llega antes.
 * @property {number} damping   - Amortiguación. Más alto = menos rebote.
 * @property {number} mass      - Masa. Más alto = más inercia.
 */

/**
 * Presets calibrados. Ninguno baja de damping 20: por debajo de eso el rebote
 * se vuelve perceptible y la interfaz se siente descuidada, no juguetona.
 *
 * @type {Readonly<Record<'snappy'|'gentle'|'bouncy', SpringPreset>>}
 */
export const SPRING = Object.freeze({
  /** Respuesta inmediata: pulsación de botones. Casi sin rebote. */
  snappy: Object.freeze({ stiffness: 400, damping: 30, mass: 1 }),

  /** Entradas y salidas de superficie: sheets, modales, barras. */
  gentle: Object.freeze({ stiffness: 260, damping: 28, mass: 1 }),

  /** Confirmaciones de éxito. Rebote leve, perceptible pero no payasesco. */
  bouncy: Object.freeze({ stiffness: 320, damping: 22, mass: 0.9 }),
});

/** Escala al presionar. 0.96 se siente físico; por debajo parece un fallo. */
export const PRESS_SCALE = 0.96;

/**
 * ¿El usuario pidió menos movimiento?
 *
 * No es una preferencia estética: para quien tiene trastorno vestibular, el
 * movimiento en pantalla provoca mareo real. Se respeta siempre.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Umbrales para dar el resorte por terminado. */
const REST_DELTA = 0.01;
const REST_SPEED = 0.05;

/**
 * Anima un valor numérico con física de resorte.
 *
 * Devuelve una función para cancelar. Si el usuario pidió movimiento reducido,
 * salta al valor final en el siguiente fotograma y no anima nada.
 *
 * @param {Object} opciones
 * @param {number} opciones.from
 * @param {number} opciones.to
 * @param {SpringPreset} [opciones.spring]
 * @param {number} [opciones.velocity=0] - Velocidad inicial, para encadenar gestos.
 * @param {(valor: number) => void} opciones.onUpdate
 * @param {() => void} [opciones.onComplete]
 * @returns {() => void} Cancela la animación.
 */
export function animateSpring({
  from,
  to,
  spring = SPRING.gentle,
  velocity = 0,
  onUpdate,
  onComplete,
}) {
  if (prefersReducedMotion()) {
    const id = requestAnimationFrame(() => {
      onUpdate(to);
      onComplete?.();
    });
    return () => cancelAnimationFrame(id);
  }

  const { stiffness, damping, mass } = spring;
  let posicion = from;
  let velocidad = velocity;
  let frameId = 0;
  let tiempoPrevio = 0;

  /** @param {number} ahora */
  function paso(ahora) {
    if (tiempoPrevio === 0) tiempoPrevio = ahora;

    // El delta se limita a 64 ms: si la pestaña estuvo en segundo plano, un
    // salto de varios segundos haría explotar la integración numérica y el
    // elemento saldría disparado fuera de la pantalla.
    const dt = Math.min((ahora - tiempoPrevio) / 1000, 0.064);
    tiempoPrevio = ahora;

    const desplazamiento = posicion - to;
    const fuerzaResorte = -stiffness * desplazamiento;
    const fuerzaAmortiguacion = -damping * velocidad;
    const aceleracion = (fuerzaResorte + fuerzaAmortiguacion) / mass;

    velocidad += aceleracion * dt;
    posicion += velocidad * dt;

    const enReposo =
      Math.abs(posicion - to) < REST_DELTA && Math.abs(velocidad) < REST_SPEED;

    if (enReposo) {
      onUpdate(to);
      onComplete?.();
      return;
    }

    onUpdate(posicion);
    frameId = requestAnimationFrame(paso);
  }

  frameId = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(frameId);
}

/**
 * Aplica un resorte directamente a una propiedad de transform.
 *
 * @param {HTMLElement} el
 * @param {Object} opciones
 * @param {'scale'|'translateY'|'translateX'} opciones.property
 * @param {number} opciones.from
 * @param {number} opciones.to
 * @param {SpringPreset} [opciones.spring]
 * @param {string} [opciones.unit=''] - 'px' o '%' para traslaciones.
 * @param {() => void} [opciones.onComplete]
 * @returns {() => void}
 */
export function springTransform(el, { property, from, to, spring, unit = '', onComplete }) {
  return animateSpring({
    from,
    to,
    spring,
    onUpdate: (v) => {
      el.style.transform = `${property}(${v}${unit})`;
    },
    onComplete,
  });
}

/**
 * Revela elementos al entrar en pantalla, escalonados.
 *
 * El escalonado guía la lectura en el orden correcto en vez de que todo
 * aparezca de golpe. Se usa IntersectionObserver, no eventos de scroll: el
 * navegador avisa cuando el elemento cruza el borde, sin ejecutar código en
 * cada píxel desplazado.
 *
 * @param {string} selector
 * @param {Object} [opciones]
 * @param {number} [opciones.stagger=70] - Milisegundos entre elementos.
 * @param {number} [opciones.distance=18] - Píxeles que sube al aparecer.
 * @returns {void}
 */
export function revealOnScroll(selector, { stagger = 70, distance = 18 } = {}) {
  const elementos = document.querySelectorAll(selector);
  if (elementos.length === 0) return;

  // Con movimiento reducido no se oculta nada: el contenido debe verse igual.
  if (prefersReducedMotion()) return;

  for (const el of elementos) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.opacity = '0';
    el.style.transform = `translateY(${distance}px)`;
    el.style.willChange = 'opacity, transform';
  }

  const observer = new IntersectionObserver(
    (entradas) => {
      /** @type {HTMLElement[]} */
      const visibles = [];

      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        if (!(entrada.target instanceof HTMLElement)) continue;
        visibles.push(entrada.target);
        observer.unobserve(entrada.target);
      }

      visibles.forEach((el, indice) => {
        setTimeout(() => {
          el.style.transition = 'opacity 420ms cubic-bezier(0.16, 1, 0.3, 1)';
          el.style.opacity = '1';
          springTransform(el, {
            property: 'translateY',
            from: distance,
            to: 0,
            unit: 'px',
            spring: SPRING.gentle,
            onComplete: () => {
              // Se limpian los estilos en línea: dejarlos fijados impide que
              // el elemento use sus propios transform después (hover, etc.).
              el.style.transform = '';
              el.style.willChange = '';
              el.style.transition = '';
            },
          });
        }, indice * stagger);
      });
    },
    // rootMargin negativo: dispara cuando el elemento ya entró de verdad, no
    // apenas asoma el primer píxel.
    { threshold: 0, rootMargin: '0px 0px -12% 0px' }
  );

  for (const el of elementos) observer.observe(el);
}
