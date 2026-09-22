// @ts-check
/**
 * @module nav
 * @description Panel de navegación móvil.
 *
 * Sin dependencias y sin framework: el sitio se sube por FTP tal cual.
 * El HTML ya viene con la marca correcta (`aria-expanded`, `hidden`), así que
 * si este script no carga la barra sigue siendo utilizable — solo queda el
 * panel cerrado y los enlaces del pie hacen de red de seguridad.
 */

/**
 * Engancha el botón hamburguesa a su panel.
 * @returns {void}
 */
export function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');

  if (!(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  /** @param {boolean} abierto */
  function setEstado(abierto) {
    toggle.setAttribute('aria-expanded', String(abierto));
    panel.hidden = !abierto;
    // Bloquea el scroll del fondo mientras el panel está abierto: sin esto la
    // página se desplaza detrás del menú y el usuario pierde su sitio.
    document.body.style.overflow = abierto ? 'hidden' : '';
  }

  toggle.addEventListener('click', () => {
    setEstado(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Escape cierra: es el gesto que el usuario ya tiene aprendido.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setEstado(false);
      toggle.focus();
    }
  });

  // Al tocar un enlace el panel se cierra solo: dejarlo abierto tapando la
  // página recién cargada es el defecto más común de los menús móviles.
  panel.addEventListener('click', (e) => {
    if (e.target instanceof HTMLAnchorElement) setEstado(false);
  });

  // Si la ventana crece hasta el layout de escritorio, el panel debe soltarse
  // o el scroll del body queda bloqueado sin motivo visible.
  const escritorio = window.matchMedia('(min-width: 900px)');
  escritorio.addEventListener('change', (e) => {
    if (e.matches) setEstado(false);
  });
}

