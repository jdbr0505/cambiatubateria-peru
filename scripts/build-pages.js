// @ts-check
/**
 * Generador de páginas del sitio.
 *
 * NO es un paso de compilación del que dependa el despliegue: genera los .html
 * una vez y esos archivos se suben tal cual por FTP. Existe para no copiar y
 * pegar el nav y el pie en siete páginas, que es como se desincronizan.
 *
 * Uso: node scripts/build-pages.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'pagbateria', 'public');

const nav = readFileSync(join(RAIZ, '_partials', 'nav.html'), 'utf8');
const footer = readFileSync(join(RAIZ, '_partials', 'footer.html'), 'utf8');

const TEL = '+51936956877';
const TEL_VISIBLE = '936 956 877';
const WA = 'https://wa.me/51936956877';

/**
 * @param {Object} p
 * @param {string} p.archivo
 * @param {string} p.slug - Para marcar el enlace activo del nav.
 * @param {string} p.titulo
 * @param {string} p.descripcion
 * @param {string} p.cuerpo
 * @returns {string}
 */
function pagina({ archivo, slug, titulo, descripcion, cuerpo }) {
  // El nav marca la página actual: es una de las cuatro preguntas que toda
  // navegación debe responder ("¿dónde estoy?").
  const navActivo = nav
    .replace(/ aria-current="page"/g, '')
    .replaceAll(`href="${slug}"`, `href="${slug}" aria-current="page"`);

  return `<!DOCTYPE html>
<html lang="es-PE">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<meta name="description" content="${descripcion}">
<meta name="theme-color" content="#060D18">
<link rel="canonical" href="https://cambiatubateriaperu.com/${archivo}">

<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="assets/img/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet" href="assets/css/v2/tokens.css">
<link rel="stylesheet" href="assets/css/v2/base.css">
<link rel="stylesheet" href="assets/css/v2/nav.css">
<link rel="stylesheet" href="assets/css/v2/layout.css">
<link rel="stylesheet" href="assets/css/v2/components.css">
<link rel="stylesheet" href="assets/css/v2/sections.css">
</head>
<body>

<a href="#contenido" class="visually-hidden">Saltar al contenido principal</a>

${navActivo}

<main id="contenido">
${cuerpo}
</main>

${footer}

<script type="module" src="assets/js/main.js"></script>

</body>
</html>
`;
}

/**
 * Cabecera de página interna. Más corta que el hero de la landing: quien llega
 * aquí ya sabe qué es el negocio.
 * @param {string} eyebrow
 * @param {string} titulo
 * @param {string} entrada
 */
const encabezado = (eyebrow, titulo, entrada) => `
<header class="hero" style="padding-block:var(--space-12) var(--space-10)" data-testid="page-header">
  <div class="container">
    <div class="hero__inner">
      <span class="eyebrow">${eyebrow}</span>
      <h1 class="hero__title" style="font-size:var(--text-3xl)">${titulo}</h1>
      <p class="hero__lead">${entrada}</p>
    </div>
  </div>
</header>`;

/** Bloque de cierre con las dos acciones de contacto. */
const cierre = `
<section class="section cta-final" data-testid="section-cta-final">
  <div class="container container--narrow" style="text-align:center">
    <h2 class="section-head__title" style="margin-bottom:var(--space-3)">¿Necesitas ayuda ahora?</h2>
    <p class="section-head__lead" style="margin-inline:auto">
      Atendemos las 24 horas en Lima y Callao.
    </p>
    <div style="margin-top:var(--space-6);display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap">
      <a href="tel:${TEL}" class="btn btn--primary btn--lg">Llamar ${TEL_VISIBLE}</a>
      <a href="${WA}" class="btn btn--ghost btn--lg" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    </div>
  </div>
</section>`;

/** @type {Array<Parameters<typeof pagina>[0]>} */
const PAGINAS = [
  {
    archivo: 'catalogo.html',
    slug: 'catalogo.html',
    titulo: 'Catálogo de Baterías para Auto | CambiaTuBatería Perú',
    descripcion: 'Baterías Etna, Bosch, Varta y más. Precio con instalación incluida y entrega a domicilio en Lima y Callao.',
    cuerpo: encabezado(
      'Catálogo',
      'Baterías con instalación incluida',
      'Todos los precios incluyen traslado e instalación. Entrega el casco usado y descuenta S/ 40.'
    ) + `
<section class="section" data-testid="section-catalogo">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Filtrar</span>
      <h2 class="section-head__title">Encuentra la batería de tu vehículo</h2>
      <p class="section-head__lead">
        Cada modelo pide una medida, polaridad y amperaje distintos. Poner la
        equivocada acorta su vida y puede dañar la electrónica.
      </p>
    </div>

    <form class="finder" data-testid="finder-form" style="max-width:32rem;margin-bottom:var(--space-10)">
      <div class="field">
        <label class="field__label" for="finder-marca">Marca del vehículo</label>
        <select class="field__input" id="finder-marca" data-testid="finder-marca">
          <option value="">Selecciona una marca</option>
          <option>Toyota</option><option>Hyundai</option><option>Kia</option>
          <option>Nissan</option><option>Chevrolet</option><option>Suzuki</option>
          <option>Volkswagen</option><option>BMW</option><option>Audi</option>
          <option>Mercedes-Benz</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="finder-modelo">Modelo</label>
        <select class="field__input" id="finder-modelo" data-testid="finder-modelo" disabled>
          <option value="">Primero elige la marca</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="finder-anio">Año</label>
        <select class="field__input" id="finder-anio" data-testid="finder-anio" disabled>
          <option value="">Primero elige el modelo</option>
        </select>
      </div>
      <button type="submit" class="btn btn--primary btn--block" data-testid="finder-submit">
        Filtrar
      </button>
    </form>

    <div class="chips" data-testid="filtro-marcas"></div>

    <div class="grid grid--cards" data-testid="catalogo-grid" aria-live="polite" aria-busy="true"></div>

    <p class="finder__note" style="margin-top:var(--space-8)">
      ¿No encuentras tu modelo? Llámanos con la placa y lo verificamos.
    </p>
  </div>
</section>` + cierre,
  },

  {
    archivo: 'servicios.html',
    slug: 'servicios.html',
    titulo: 'Servicios: Auxilio 24/7 e Instalación a Domicilio | CambiaTuBatería Perú',
    descripcion: 'Auxilio mecánico de batería 24 horas, instalación a domicilio, diagnóstico de alternador y reprogramación BMS en Lima y Callao.',
    cuerpo: encabezado(
      'Servicios',
      'Todo lo que hacemos, donde estés',
      'No solo vendemos baterías: llegamos, diagnosticamos e instalamos.'
    ) + `
<section class="section" data-testid="section-servicios-lista">
  <div class="container">
    <div class="grid grid--cards">
      <article class="card"><span class="card__icon">⚡</span>
        <h3 class="card__title">Auxilio 24/7</h3>
        <p class="card__text">Tu auto no arranca y estás varado. Llegamos en 30 minutos con la batería correcta, a cualquier hora.</p></article>
      <article class="card" id="instalacion"><span class="card__icon">🔧</span>
        <h3 class="card__title">Instalación a domicilio</h3>
        <p class="card__text">Sin costo aparte. El técnico instala, verifica el arranque y se lleva la batería usada.</p></article>
      <article class="card"><span class="card__icon">📊</span>
        <h3 class="card__title">Diagnóstico de carga</h3>
        <p class="card__text">A veces el problema no es la batería sino el alternador. Lo medimos antes de venderte una nueva.</p></article>
      <article class="card"><span class="card__icon">⟳</span>
        <h3 class="card__title">Reprogramación BMS</h3>
        <p class="card__text">Para vehículos de gama alta. Escáner OBD2 incluido, sin cargo adicional.</p></article>
      <article class="card"><span class="card__icon">♻️</span>
        <h3 class="card__title">Reciclaje del casco</h3>
        <p class="card__text">Entregas la usada, descuentas S/ 40 y nosotros la disponemos como corresponde.</p></article>
      <article class="card"><span class="card__icon">🏢</span>
        <h3 class="card__title">Flotas y empresas</h3>
        <p class="card__text">Mantenimiento programado para flotas. Cotización según cantidad de unidades.</p></article>
    </div>
  </div>
</section>` + cierre,
  },

  {
    archivo: 'premium.html',
    slug: 'premium.html',
    titulo: 'Baterías AGM y EFB con Reprogramación BMS | BMW, Audi, Mercedes',
    descripcion: 'Baterías AGM y EFB para vehículos de gama alta con reprogramación BMS por escáner OBD2 incluida. Lima y Callao.',
    cuerpo: encabezado(
      'Vehículos de gama alta',
      'BMW, Audi y Mercedes necesitan más que una batería',
      'Si cambian la batería sin reprogramar la computadora, el auto la carga mal y la degrada en meses.'
    ) + `
<section class="section" data-testid="section-premium-detalle">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">El problema</span>
      <h2 class="section-head__title">Por qué una batería común falla en estos autos</h2>
      <p class="section-head__lead">
        Los vehículos con sistema start-stop apagan el motor en cada semáforo y lo
        vuelven a arrancar. Una batería convencional no aguanta esa cantidad de ciclos.
      </p>
    </div>

    <div class="grid grid--cards">
      <article class="card"><span class="card__icon">◆</span>
        <h3 class="card__title">Baterías AGM</h3>
        <p class="card__text">Electrolito absorbido en fibra de vidrio. Soportan hasta tres veces más ciclos de arranque.</p></article>
      <article class="card"><span class="card__icon">◈</span>
        <h3 class="card__title">Baterías EFB</h3>
        <p class="card__text">Plomo-ácido reforzada. La opción para start-stop de gama media.</p></article>
      <article class="card card--premium"><span class="card__icon">⟳</span>
        <h3 class="card__title">Reprogramación BMS</h3>
        <p class="card__text">Le decimos a la computadora que hay una batería nueva. Sin esto, la carga con el perfil de la vieja.</p></article>
    </div>
  </div>
</section>

<section class="section section--dark" data-testid="section-premium-marcas">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Marcas que atendemos</span>
      <h2 class="section-head__title">Con escáner OBD2, incluido en el servicio</h2>
    </div>
    <ul class="districts" data-testid="marcas-premium">
      <li>BMW</li><li>Audi</li><li>Mercedes-Benz</li><li>Porsche</li>
      <li>Volvo</li><li>Land Rover</li><li>MINI</li><li>Volkswagen</li>
    </ul>
  </div>
</section>` + cierre,
  },

  {
    archivo: 'cobertura.html',
    slug: 'cobertura.html',
    titulo: 'Cobertura en Lima Metropolitana y Callao | CambiaTuBatería Perú',
    descripcion: 'Distritos donde llegamos en 30 minutos o menos. Atención las 24 horas, todos los días del año.',
    cuerpo: encabezado(
      'Dónde llegamos',
      'Lima Metropolitana y Callao, 24 horas',
      'Estos son los distritos con tiempo de llegada de 30 minutos o menos.'
    ) + `
<section class="section" data-testid="section-distritos">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Distritos</span>
      <h2 class="section-head__title">Cobertura confirmada</h2>
      <p class="section-head__lead">¿No ves el tuyo? Llámanos igual: coordinamos según disponibilidad.</p>
    </div>
    <ul class="districts" data-testid="distritos">
      <li>San Isidro</li><li>Miraflores</li><li>Surco</li><li>La Molina</li>
      <li>San Borja</li><li>Barranco</li><li>Jesús María</li><li>Lince</li>
      <li>Magdalena</li><li>Pueblo Libre</li><li>San Miguel</li><li>Callao</li>
      <li>Cercado de Lima</li><li>La Victoria</li><li>Surquillo</li><li>Chorrillos</li>
      <li>San Luis</li><li>Breña</li><li>Rímac</li><li>Los Olivos</li>
    </ul>
  </div>
</section>

<section class="section section--muted" id="horarios" data-testid="section-horarios">
  <div class="container container--narrow">
    <div class="section-head">
      <span class="eyebrow">Horarios</span>
      <h2 class="section-head__title">Atendemos siempre</h2>
    </div>
    <div class="faq">
      <details class="faq__item" open>
        <summary class="faq__question">Lunes a domingo, 24 horas</summary>
        <p class="faq__answer">Incluidos feriados. La mayoría de baterías fallan de madrugada o a primera hora, que es cuando nadie más contesta.</p>
      </details>
      <details class="faq__item">
        <summary class="faq__question">¿Cuánto demoran de madrugada?</summary>
        <p class="faq__answer">Entre 25 y 40 minutos. Con menos tráfico solemos llegar antes que en hora punta.</p>
      </details>
    </div>
  </div>
</section>` + cierre,
  },

  {
    archivo: 'nosotros.html',
    slug: 'nosotros.html',
    titulo: 'Nosotros | CambiaTuBatería Perú',
    descripcion: 'Técnicos especializados en baterías de auto con atención a domicilio en Lima y Callao. Operador humano, sin bots.',
    cuerpo: encabezado(
      'Nosotros',
      'Técnicos, no repartidores',
      'Quien llega sabe medir el alternador y detectar si el problema era la batería o algo más.'
    ) + `
<section class="section" data-testid="section-nosotros">
  <div class="container">
    <div class="grid grid--halves">
      <div class="section-head" style="margin-bottom:0">
        <span class="eyebrow">Cómo trabajamos</span>
        <h2 class="section-head__title">Contesta una persona, no un bot</h2>
        <p class="section-head__lead">
          Cuando alguien está varado no tiene paciencia para repetirle el problema
          tres veces a un menú automático. Un operador real toma tu caso y coordina
          al técnico de inmediato.
        </p>
      </div>
      <div class="grid grid--cards" style="gap:var(--space-4)">
        <article class="card"><span class="card__icon">📍</span>
          <h3 class="card__title">Ubicación con un toque</h3>
          <p class="card__text">Recibimos tus coordenadas exactas y le mandamos la ruta al técnico.</p></article>
        <article class="card"><span class="card__icon">✓</span>
          <h3 class="card__title">Precio antes de salir</h3>
          <p class="card__text">Te decimos cuánto cuesta antes de movernos. Sin sorpresas al llegar.</p></article>
      </div>
    </div>
  </div>
</section>` + cierre,
  },

  {
    archivo: 'contacto.html',
    slug: 'contacto.html',
    titulo: 'Contacto y Libro de Reclamaciones | CambiaTuBatería Perú',
    descripcion: 'Teléfono, WhatsApp y Libro de Reclamaciones virtual de CambiaTuBatería Perú.',
    cuerpo: encabezado(
      'Contacto',
      'Hablemos',
      'Atendemos las 24 horas por teléfono y WhatsApp.'
    ) + `
<section class="section" data-testid="section-contacto">
  <div class="container">
    <div class="grid grid--cards">
      <article class="card"><span class="card__icon">📞</span>
        <h3 class="card__title">Teléfono</h3>
        <p class="card__text"><a href="tel:${TEL}">${TEL_VISIBLE}</a> — 24 horas, todos los días.</p></article>
      <article class="card"><span class="card__icon">💬</span>
        <h3 class="card__title">WhatsApp</h3>
        <p class="card__text"><a href="${WA}" target="_blank" rel="noopener">Escríbenos</a> y comparte tu ubicación.</p></article>
      <article class="card"><span class="card__icon">✉️</span>
        <h3 class="card__title">Correo</h3>
        <p class="card__text"><a href="mailto:contacto@cambiatubateriaperu.com">contacto@cambiatubateriaperu.com</a></p></article>
    </div>
  </div>
</section>

<section class="section section--muted" id="reclamaciones" data-testid="section-reclamaciones">
  <div class="container container--narrow">
    <div class="section-head">
      <span class="eyebrow">Indecopi</span>
      <h2 class="section-head__title">Libro de Reclamaciones</h2>
      <p class="section-head__lead">
        Conforme a la normativa peruana, ponemos a tu disposición el Libro de
        Reclamaciones virtual. Respondemos dentro del plazo de ley.
      </p>
    </div>
    <a href="#" class="btn btn--primary btn--lg" data-testid="libro-reclamaciones-cta">
      📕 Abrir Libro de Reclamaciones
    </a>
    <p class="finder__note" style="margin-top:var(--space-4);text-align:left">
      PENDIENTE: enlazar al formulario real de reclamaciones antes de publicar.
    </p>
  </div>
</section>` + cierre,
  },
];

let generadas = 0;
for (const p of PAGINAS) {
  writeFileSync(join(RAIZ, p.archivo), pagina(p), 'utf8');
  console.log(`  generada  ${p.archivo}`);
  generadas++;
}
console.log(`\n${generadas} páginas generadas en pagbateria/public/`);
