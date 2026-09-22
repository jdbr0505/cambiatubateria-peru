// @ts-check
/**
 * @module cookie-consent
 * @description Banner de consentimiento de cookies con Google Consent Mode.
 *
 * El sitio carga Google Analytics (GA4). Sin consentimiento previo, la ley de
 * protección de datos del Perú (Ley 29733) y las buenas prácticas exigen no
 * activar cookies de analítica hasta que el usuario acepte. El snippet de GA4
 * arranca con `analytics_storage: denied`; este módulo lo pasa a `granted`
 * solo si el usuario acepta, y recuerda la decisión para no volver a preguntar.
 *
 * El banner se inyecta desde JS para no repetir su markup en las 7 páginas.
 */

const CLAVE = 'ctb-cookie-consent';

/**
 * Comunica la decisión a Google Consent Mode, si gtag está disponible.
 * @param {'granted'|'denied'} estado
 * @returns {void}
 */
function actualizarConsentimiento(estado) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', { analytics_storage: estado });
}

/**
 * @param {'granted'|'denied'} decision
 * @returns {void}
 */
function guardar(decision) {
  try {
    localStorage.setItem(CLAVE, decision);
  } catch {
    // Modo privado o almacenamiento bloqueado: no se puede recordar, pero el
    // banner igual desaparece en esta sesión. No es un error que deba romper.
  }
}

/**
 * @returns {string|null}
 */
function leerDecision() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

/**
 * Construye e inserta el banner. Se llama solo si no hay decisión previa.
 * @returns {void}
 */
function mostrarBanner() {
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Aviso de cookies');
  banner.setAttribute('data-testid', 'cookie-banner');
  banner.innerHTML = `
    <p class="cookie-banner__texto">
      Usamos cookies propias y de terceros (Google Analytics) para medir el uso
      del sitio y mejorar el servicio. Puedes aceptarlas o rechazarlas.
      <a href="cookies.html">Más información</a>.
    </p>
    <div class="cookie-banner__acciones">
      <button type="button" class="btn btn--ghost" data-cookie="reject">Rechazar</button>
      <button type="button" class="btn btn--primary" data-cookie="accept">Aceptar</button>
    </div>
  `;

  banner.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const accion = target.dataset.cookie;
    if (!accion) return;

    const decision = accion === 'accept' ? 'granted' : 'denied';
    guardar(decision);
    actualizarConsentimiento(decision);
    banner.remove();
  });

  document.body.appendChild(banner);
}

/**
 * Arranca el flujo de consentimiento. Si ya hay una decisión guardada, la
 * reaplica (para que GA4 respete el "aceptar" en visitas siguientes) y no
 * muestra el banner.
 * @returns {void}
 */
export function initCookieConsent() {
  const previa = leerDecision();
  if (previa === 'granted') {
    actualizarConsentimiento('granted');
    return;
  }
  if (previa === 'denied') return;
  mostrarBanner();
}
