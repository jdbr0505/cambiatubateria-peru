/**
 * Verificación estática del hero de la landing tras su tercera vuelta.
 *
 * v1: columna de texto sobre una foto de fondo tapada al 80% por un velo.
 * v2: hero partido en dos columnas (texto | foto enmarcada) + batería
 *     recortada + chip de precio — el dueño, tras reunirse con la
 *     competencia, pidió quitar la batería/chip (daban a entender que solo
 *     se vende esa marca) y mover el botón de GPS fuera del hero.
 * v3 (esta): la foto vuelve a ser de fondo, pero a toda anchura del bloque
 *     — no al 80% tapada como v1 — con un degradado direccional detrás de
 *     una sola frase original de titular. El dueño rechazó explícitamente
 *     el titular de v1/v2 ("No sigas intentando arrancarlo..."). Los accesos
 *     a servicios y la fila de confianza viven debajo de la foto, no encima.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const html = leer('pagbateria/public/index.html');
const componentes = leer('pagbateria/public/assets/css/v2/components.css');

/**
 * Todas las declaraciones de las reglas cuyo selector es EXACTAMENTE esa clase,
 * concatenadas.
 *
 * @param {string} selector
 * @returns {string}
 */
function reglasDe(selector) {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = new RegExp(`^${escapado}\\s*\\{([^}]*)\\}`, 'gm');
  return [...componentes.matchAll(patron)].map((m) => m[1]).join('\n');
}

describe('Hero de portada: foto de fondo a toda anchura, texto flotando encima', () => {
  test('el hero declara la variante de foto a toda anchura', () => {
    assert.match(html, /<header class="hero hero--full" data-testid="hero">/);
    assert.match(html, /<div class="hero__media" data-testid="hero-stage">/);
  });

  test('la foto es un <img> real con dimensiones y texto alternativo, y precarga como LCP', () => {
    const media = html.match(/<div class="hero__media"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? '';
    assert.match(media, /<img class="hero__bg" src="assets\/img\/optimizadas\/hero-instalacion-1600\.jpg"/);
    assert.match(media, /alt="[^"]{15,}"/, 'la foto del hero necesita alt descriptivo');
    assert.match(media, /width="\d+" height="\d+"/, 'sin dimensiones hay salto de layout (CLS)');
    assert.match(media, /fetchpriority="high"/, 'es el elemento LCP de la landing');
    assert.match(html, /<link rel="preload" as="image"[\s\S]*?imagesrcset=/);
  });

  test('la foto del hero es responsiva (srcset por ancho) para no verse borrosa al ampliar en PC', () => {
    const media = html.match(/<div class="hero__media"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? '';
    // Tres anchos: móvil liviano (960), laptop (1600) y PC hi-DPI/ancho (2560).
    assert.match(media, /srcset="[\s\S]*hero-instalacion-960\.jpg 960w[\s\S]*hero-instalacion-1600\.jpg 1600w[\s\S]*hero-instalacion-2560\.jpg 2560w/);
    assert.match(media, /sizes="100vw"/);
    // El preload comparte el mismo srcset para no descargar dos veces.
    assert.match(html, /imagesrcset="[\s\S]*hero-instalacion-2560\.jpg 2560w/);
  });

  test('un degradado, no un velo plano, separa el texto de la foto', () => {
    assert.match(html, /<div class="hero__scrim" aria-hidden="true"><\/div>/);
    const scrim = reglasDe('.hero__scrim');
    assert.match(scrim, /gradient/, 'debe ser un degradado direccional, no un color plano');
  });

  test('el texto vive en su propio bloque encima de la foto, no al lado en una columna', () => {
    assert.match(html, /<div class="container container--flush-left hero__media-inner">/);
    assert.match(html, /<div class="hero__content">/);
  });

  test('el hero usa .container--flush-left, no .container a secas — pegado a la izquierda como el navbar', () => {
    // .container centra con margin-inline:auto: en pantallas anchas deja un
    // hueco grande e inconsistente entre formatos. El jefe pidió que el hero
    // y el navbar se vean a la misma distancia del borde en cualquier ancho
    // — .container--flush-left es la clase compartida que usan los dos
    // (ver layout.css y nav/topbar en el <head>).
    const layout = leer('pagbateria/public/assets/css/v2/layout.css');
    assert.match(layout, /\.container--flush-left\s*\{[^}]*margin-inline:\s*0 auto/, 'la clase compartida debe anclarse a la izquierda, no centrarse');
  });

  test('una sola frase original de titular — ya no la pregunta de urgencia rechazada', () => {
    assert.doesNotMatch(html, /No sigas intentando arrancarlo/);
    assert.doesNotMatch(html, /¿Tu auto no arranca\?/i);
    // El H1 sigue siendo una sola oración con un énfasis en <em>, no un
    // bloque de badge+pregunta+bajada como antes.
    const titulo = html.match(/<h1 class="hero__title"[\s\S]*?<\/h1>/)?.[0] ?? '';
    assert.match(titulo, /<em>[^<]+<\/em>/);
  });

  test('los accesos a servicios viven encima de la foto, junto al titular — no en otra sección', () => {
    const media = html.match(/<div class="hero__media"[\s\S]*?hero__media-inner[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? '';
    assert.match(media, /service-icons/, 'los accesos a servicios deben vivir junto al titular, dentro de la foto');
  });

  test('ya no queda la fila de confianza (Instalación incluida / Garantía / Tarjeta, Yape o efectivo) — saturaba', () => {
    assert.doesNotMatch(html, /hero__trust/);
    assert.doesNotMatch(componentes, /\.hero__trust/);
  });
});

describe('Ya no hay batería recortada ni chip de precio superpuestos', () => {
  // El dueño reportó, tras reunirse con la competencia, que la batería
  // recortada y el chip de precio daban a entender que solo se vende esa
  // marca — el catálogo tiene varias. Se quitan del todo, no se ocultan.
  test('el HTML ya no tiene el <img> de la batería recortada', () => {
    assert.doesNotMatch(html, /hero__stage-producto/);
    assert.doesNotMatch(html, /bateria-hero\.png/);
  });

  test('el HTML ya no tiene el chip de precio', () => {
    assert.doesNotMatch(html, /hero__stage-chip/);
    assert.doesNotMatch(html, /hero-precio-desde/);
  });

  test('las reglas CSS de la batería y el chip ya no existen', () => {
    assert.doesNotMatch(componentes, /\.hero__stage-producto/);
    assert.doesNotMatch(componentes, /\.hero__stage-chip/);
  });

  test('catalog-preview.js ya no calcula ni escribe el precio "desde"', () => {
    const codigo = leer('pagbateria/public/assets/js/ui/catalog-preview.js');
    assert.doesNotMatch(codigo, /pintarPrecioDesde/);
    assert.doesNotMatch(codigo, /hero-precio-desde/);
  });
});

describe('Servicios rápidos: fila compacta dentro del hero (icono + palabra, sin descripción)', () => {
  const hero = html.match(/<header class="hero hero--full"[\s\S]*?<\/header>/)?.[0] ?? '';

  test('la fila de accesos rápidos vive dentro del hero, no en una sección aparte', () => {
    assert.ok(hero, 'no se encontró el hero');
    assert.match(hero, /<ul class="service-icons" data-testid="servicios-rapidos">/);
    // Ya no hay una <section> separada solo para esto, justo debajo del hero.
    assert.doesNotMatch(html, /aria-label="Nuestros servicios"/);
  });

  test('los 5 servicios reales están, cada uno solo con ícono y una palabra — sin descripción, para no saturar', () => {
    for (const etiqueta of ['Auxilio', 'Instalación', 'Diagnóstico', 'Reciclaje', 'Flotas']) {
      assert.match(hero, new RegExp(`<span class="service-icons__label">${etiqueta}</span>`), `falta "${etiqueta}"`);
    }
    assert.doesNotMatch(hero, /service-icons__desc/, 'la descripción larga se quitó a propósito, saturaba el hero');
  });

  test('siguen enlazando a servicios.html, igual que antes', () => {
    for (const slug of ['auxilio', 'instalacion', 'diagnostico', 'reciclaje', 'flotas']) {
      assert.match(hero, new RegExp(`href="servicios\\.html#${slug}"`));
    }
  });
});

describe('Geolocalización pública: quitada del todo (pedido del jefe, "sera 100% whatsapp")', () => {
  test('el botón de "Enviar mi ubicación" (GPS) ya no existe en ningún lado de index.html', () => {
    assert.doesNotMatch(html, /data-testid="hero-cta-auxilio"/);
    assert.doesNotMatch(html, /class="[^"]*gps-cta/);
    // <strong>Enviar mi ubicación</strong> era el texto real del botón — el
    // guion (—) antes de la frase en el comentario que explica la remoción
    // no matchea esto, así que no hace falta excluir comentarios acá.
    assert.doesNotMatch(html, /<strong[^>]*>Enviar mi ubicación</);
  });

  test('la sección de contacto final queda con una sola acción (WhatsApp) — ya no tiene alternativa por GPS', () => {
    const seccion = html.match(/<section class="section cta-final" data-testid="section-cta-final">[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.doesNotMatch(seccion, /cta-final__alterna/);
    assert.doesNotMatch(seccion, /data-urgency="true"/);
  });

  test('index.html ya no tiene ningún elemento data-urgency — offline.html sí conserva el suyo (botón de llamar)', () => {
    assert.doesNotMatch(html, /data-urgency="true"/);
    const offline = leer('pagbateria/public/offline.html');
    assert.match(offline, /data-urgency="true"/);
  });
});

describe('Tira de marcas: dentro del hero, más grande que antes', () => {
  test('la tira de logos está dentro del <header class="hero">', () => {
    const hero = html.match(/<header class="hero hero--full"[\s\S]*?<\/header>/)?.[0] ?? '';
    assert.ok(hero, 'no se encontró el hero');
    assert.match(hero, /<div class="hero__logos">/);
    assert.match(hero, /<ul class="logos-strip" data-testid="marcas-list">/);
  });

  test('las 8 marcas están escritas en el HTML, no las llena JS', () => {
    const strip = html.match(/<ul class="logos-strip"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const logos = (strip.match(/<img /g) ?? []).length;
    assert.equal(logos, 8, `la tira debe tener 8 logos escritos, tiene ${logos}`);
    assert.doesNotMatch(strip, /<ul class="logos-strip"[^>]*>\s*<\/ul>/);
  });

  test('cada logo declara width y height (evita salto de layout)', () => {
    const strip = html.match(/<ul class="logos-strip"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const imgs = strip.match(/<img [^>]*>/g) ?? [];
    for (const img of imgs) {
      assert.match(img, /width="\d+"/, `falta width en ${img}`);
      assert.match(img, /height="\d+"/, `falta height en ${img}`);
      assert.match(img, /alt="[^"]+"/, `falta alt en ${img}`);
    }
  });

  test('ya no se llama a marquee.js: el módulo se eliminó', () => {
    const main = leer('pagbateria/public/assets/js/main.js');
    assert.doesNotMatch(main, /initMarquee/);
    assert.doesNotMatch(main, /marquee\.js/);
  });

  test('cada logo va sobre una placa clara; grande en tablet+ (88px / imagen 60px) y más compacta en móvil (64px) para no dominar el hero', () => {
    const secciones = leer('pagbateria/public/assets/css/v2/sections.css');
    const bloque = secciones.match(/\.logos-strip__item \{[\s\S]*?\}/)?.[0] ?? '';
    assert.match(bloque, /background:\s*var\(--paper\)/);
    // Base = móvil: placa compacta.
    assert.match(bloque, /height:\s*64px/);
    // Tablet+ restaura la placa grande "a la altura de la competencia".
    assert.match(secciones, /@media \(min-width: 768px\)[\s\S]*?\.logos-strip__item \{[^}]*height:\s*88px/);
    assert.match(secciones, /@media \(min-width: 768px\)[\s\S]*?\.logos-strip__item img \{[^}]*max-height:\s*60px/);
  });

  test('el bloque de logos deja suficiente aire abajo para no chocar con la sección siguiente', () => {
    const componentes = leer('pagbateria/public/assets/css/v2/components.css');
    const bloque = componentes.match(/\.hero__logos \{[\s\S]*?\}/)?.[0] ?? '';
    assert.match(bloque, /padding-block:\s*var\(--space-8\)\s*var\(--space-16\)/);
  });
});

describe('Botones flotantes de WhatsApp y llamada: en toda la página, no una barra de scroll', () => {
  const PAGINAS = [
    'index.html', 'catalogo.html', 'servicios.html', 'cobertura.html', 'nosotros.html',
    'contacto.html', 'cookies.html', 'aviso-legal.html', 'privacidad.html',
  ];

  test('ya no queda ninguna .sticky-cta ni su lógica de scroll', () => {
    assert.doesNotMatch(html, /sticky-cta/);
    const nav = leer('pagbateria/public/assets/js/ui/nav.js');
    assert.doesNotMatch(nav, /initStickyCta/);
    const main = leer('pagbateria/public/assets/js/main.js');
    assert.doesNotMatch(main, /initStickyCta/);
  });

  for (const pagina of PAGINAS) {
    test(`${pagina} — tiene los botones flotantes de WhatsApp y llamada`, () => {
      const codigo = leer(`pagbateria/public/${pagina}`);
      assert.match(codigo, /<div class="floating-cta" data-testid="floating-cta">/);
      assert.match(codigo, /data-testid="floating-cta-whatsapp"/);
      assert.match(codigo, /data-testid="floating-cta-llamar"/);
    });
  }

  test('siempre visibles: sin display:none por defecto ni solo-móvil', () => {
    const layout = leer('pagbateria/public/assets/css/v2/layout.css');
    const bloque = layout.match(/\.floating-cta \{[\s\S]*?\}/)?.[0] ?? '';
    assert.doesNotMatch(bloque, /display:\s*none/);
    // No debe haber un @media que los oculte en desktop, como pasaba con la
    // barra anterior.
    assert.doesNotMatch(layout, /@media \(min-width: 768px\) \{\s*\.floating-cta/);
  });
});

describe('Libro de Reclamaciones: eliminado por completo (no se va a usar)', () => {
  const PAGINAS = [
    'index.html', 'catalogo.html', 'servicios.html', 'cobertura.html', 'nosotros.html',
    'contacto.html', 'cookies.html', 'aviso-legal.html', 'privacidad.html',
  ];

  for (const pagina of PAGINAS) {
    test(`${pagina} — sin rastro de "reclamaciones"`, () => {
      const codigo = leer(`pagbateria/public/${pagina}`);
      assert.doesNotMatch(codigo, /[Rr]eclamaciones/);
    });
  }
});

describe('Google Ads (AW-18461995323) activo en las 9 páginas públicas', () => {
  const PAGINAS = [
    'index.html', 'catalogo.html', 'servicios.html', 'cobertura.html',
    'nosotros.html', 'contacto.html', 'cookies.html', 'aviso-legal.html', 'privacidad.html',
  ];
  for (const pagina of PAGINAS) {
    test(`${pagina} — carga googletagmanager.com con el ID real`, () => {
      const codigo = leer(`pagbateria/public/${pagina}`);
      assert.match(codigo, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-18461995323">/);
      assert.match(codigo, /<script>\s*window\.dataLayer/);
    });
  }
});

describe('Secciones que se quitaron o se enderezaron', () => {
  test('la sección "Elige tu marca y mira el catálogo" ya no existe', () => {
    assert.doesNotMatch(html, /id="buscador"/);
    assert.doesNotMatch(html, /data-testid="section-buscador"/);
    assert.doesNotMatch(html, /Elige tu marca y mira el catálogo/);
  });

  test('las cabeceras centradas usan el modificador, no un style suelto', () => {
    assert.doesNotMatch(html, /style="text-align:center"/);
    assert.match(html, /class="section-head section-head--center"/);
  });

  test('section-head--center centra también la caja, no solo el texto', () => {
    const layout = leer('pagbateria/public/assets/css/v2/layout.css');
    const bloque = layout.match(/\.section-head--center \{[^}]*\}/)?.[0] ?? '';
    assert.match(bloque, /margin-inline:\s*auto/);
    assert.match(bloque, /align-items:\s*center/);
    assert.match(bloque, /text-align:\s*center/);
  });

  test('la cabecera del catálogo destacado está centrada', () => {
    const seccion = html.match(/data-testid="section-catalogo-preview"[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.match(seccion, /class="section-head section-head--center"/);
  });
});

describe('3 simples pasos: reemplaza "Tres toques y estás resuelto"', () => {
  const seccion = html.match(/<section class="section section--muted" id="pasos"[\s\S]*?<\/section>/)?.[0] ?? '';

  test('el título nuevo está, el viejo ya no', () => {
    assert.ok(seccion, 'no se encontró la sección de pasos');
    assert.match(seccion, /Obtén tu batería ideal en 3 simples pasos/);
    assert.doesNotMatch(html, /Tres toques y estás resuelto/);
  });

  test('ya no tiene la foto de autos que traía antes', () => {
    assert.doesNotMatch(seccion, /como-funciona\.jpg/);
    assert.doesNotMatch(seccion, /data-foto-slug="como-funciona"/);
  });

  test('sin eyebrow: el título carga solo su propio peso', () => {
    assert.doesNotMatch(seccion, /<span class="eyebrow">/);
  });

  test('los 3 pasos son los del flujo de compra, no los del auxilio', () => {
    assert.match(seccion, /Encuentra tu batería/);
    assert.match(seccion, /Ingresa tus datos/);
    assert.match(seccion, /Elige el método de pago/);
  });
});

describe('El slot de foto "como-funciona" se retiró del panel admin (ya no hay dónde mostrarla)', () => {
  test('ya no está en el SLOTS del backend admin', () => {
    const php = leer('adminbateria/backend/api/pagina_fotos.php');
    assert.doesNotMatch(php, /'como-funciona'/);
  });

  test('ya no está en el JSON de respaldo público', () => {
    const json = JSON.parse(leer('pagbateria/backend/data/pagina_fotos.json'));
    assert.equal(json['como-funciona'], undefined);
  });

  test('ya no está en la lista de slots del panel admin (admin.js)', () => {
    const js = leer('adminbateria/assets/js/admin.js');
    assert.doesNotMatch(js, /slug: 'como-funciona'/);
  });
});

describe('Franja de marca: separador oscuro entre "3 pasos" y el catálogo', () => {
  test('la franja está una sola vez, entre los pasos y el catálogo', () => {
    const coincidencias = html.match(/class="franja-marca"/g) || [];
    assert.equal(coincidencias.length, 1);
    const iPasos = html.indexOf('id="pasos"');
    const iFranja = html.indexOf('class="franja-marca"');
    const iCatalogo = html.indexOf('id="catalogo"');
    assert.ok(iPasos < iFranja && iFranja < iCatalogo, 'la franja debe ir entre pasos y catálogo');
  });

  test('trae la cuchilla ámbar (mismo motivo del hero) y su data-cabecera-rol editable', () => {
    const seccion = html.match(/<section class="franja-marca"[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.match(seccion, /class="franja-marca__accent"/);
    // Ya NO lleva <em>: el texto es editable desde el panel (data-cabecera-rol)
    // y aplicarCabeceras() reemplaza el nodo entero con textContent — un <em>
    // adentro se perdía en cuanto la API contestaba (siempre, por el respaldo
    // JSON). Mismo criterio que el titular del hero: un solo color.
    assert.doesNotMatch(seccion, /<em>/);
    assert.match(seccion, /data-cabecera-rol="inicio-franja-titulo"/);
  });

  test('el CSS de la franja usa el fondo grafito de marca, no un color suelto', () => {
    const css = leer('pagbateria/public/assets/css/v2/sections.css');
    const regla = css.match(/\.franja-marca\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(regla, /background:\s*var\(--brand-950\)/);
  });
});
