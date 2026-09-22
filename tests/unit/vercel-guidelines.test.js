/**
 * Verificación estática de una ronda de ajustes contra las Vercel Web
 * Interface Guidelines (https://github.com/vercel-labs/web-interface-guidelines).
 *
 * Igual que en upload-security.test.js, algunos de estos comportamientos son
 * de navegador real (foco, layout, gestos táctiles) y no se pueden probar sin
 * DOM — se verifican leyendo el código fuente en vez de ejecutándolo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

// El botón de auxilio ("Enviar mi ubicación") que este bloque cubría —
// spinner con aria-busy en vez de reemplazar el label — se quitó del sitio
// público por completo (WhatsApp pasó a ser 100% el canal de contacto, ver
// main.js). El punto de guideline en sí sigue siendo válido para cualquier
// botón futuro con estado de carga; no hay ningún botón así en el sitio
// hoy para verificar.

describe('Íconos decorativos — aria-hidden en .card__icon', () => {
  const paginas = [
    'pagbateria/public/contacto.html',
    'pagbateria/public/nosotros.html',
    'pagbateria/public/servicios.html',
    'pagbateria/public/index.html',
  ];

  const contar = (pagina) => {
    const codigo = leer(pagina);
    return {
      aperturas: (codigo.match(/<span class="card__icon"/g) ?? []).length,
      ocultos: (codigo.match(/<span class="card__icon" aria-hidden="true"/g) ?? []).length,
    };
  };

  // El guardia contra un regex roto va una sola vez sobre el conjunto: una
  // página concreta puede quedarse legítimamente sin tarjetas con ícono (la
  // landing lo hizo al pasar los 3 pasos a su propio componente).
  test('el conjunto de páginas tiene .card__icon que revisar', () => {
    const total = paginas.reduce((n, p) => n + contar(p).aperturas, 0);
    assert.ok(total > 0, 'ninguna página tiene .card__icon: el patrón debe estar mal');
  });

  for (const pagina of paginas) {
    test(`${pagina} — todos los .card__icon tienen aria-hidden`, () => {
      const { aperturas, ocultos } = contar(pagina);
      assert.equal(ocultos, aperturas, `${pagina}: ${aperturas - ocultos} .card__icon sin aria-hidden`);
    });
  }

});

describe('Catálogo — deep-linking del filtro de marca', () => {
  const codigo = leer('pagbateria/public/assets/js/ui/catalog.js');

  test('escribe el filtro de marca en la URL al hacer clic en un chip', () => {
    assert.match(
      codigo,
      /history\.replaceState/,
      'debe actualizar la URL sin apilar una entrada de historial por cada clic'
    );
  });

  test('lee el filtro de marca inicial de la URL para resaltar el chip activo', () => {
    assert.match(codigo, /marcaInicial/);
  });
});

describe('Iconos de servicio — mismo SVG en index.html y servicios.html', () => {
  // Ambas páginas listan los mismos 6 servicios en el mismo orden (Auxilio,
  // Instalación, Diagnóstico, BMS, Reciclaje, Flotas): el ícono de cada uno
  // debe ser el mismo SVG verbatim, no una aproximación de memoria — ya hubo
  // un bug real en esta sesión donde un ícono se copió con un <path> trunco.
  // Se emparejan por NOMBRE del servicio, no por posición: la landing muestra
  // un subconjunto de los servicios y en otro orden, así que comparar por
  // índice se rompía en cuanto la home cambiaba de secciones.
  const equivalencias = {
    'Auxilio': 'Auxilio a domicilio',
    'Instalación': 'Instalación a domicilio',
    'Diagnóstico': 'Diagnóstico de carga',
    'Reciclaje': 'Reciclaje del casco',
    'Flotas': 'Flotas y empresas',
  };

  /** Íconos de la fila de accesos directos de la landing: etiqueta -> svg. */
  function iconosLanding(html) {
    const mapa = new Map();
    const items = [...html.matchAll(/<li class="service-icons__item">[\s\S]*?<\/li>/g)];
    for (const [item] of items) {
      const svg = item.match(/<svg[\s\S]*?<\/svg>/)?.[0];
      const etiqueta = item.match(/<span class="service-icons__label">([^<]*)<\/span>/)?.[1];
      if (svg && etiqueta) mapa.set(etiqueta.trim(), svg);
    }
    return mapa;
  }

  /** Íconos de las tarjetas de servicios.html: título -> svg. */
  function iconosServicios(html) {
    const mapa = new Map();
    const tarjetas = [...html.matchAll(/<article class="card"[\s\S]*?<\/article>/g)];
    for (const [tarjeta] of tarjetas) {
      const svg = tarjeta.match(/<svg[\s\S]*?<\/svg>/)?.[0];
      const titulo = tarjeta.match(/<h3 class="card__title">([^<]*)<\/h3>/)?.[1];
      if (svg && titulo) mapa.set(titulo.trim(), svg);
    }
    return mapa;
  }

  const enLanding = iconosLanding(leer('pagbateria/public/index.html'));
  const enServicios = iconosServicios(leer('pagbateria/public/servicios.html'));

  /** La indentación cambia según el anidado; el contenido no debe cambiar. */
  const normalizar = (svg) => svg.replace(/\s+/g, ' ').trim();

  test('la landing lista accesos directos de servicio', () => {
    assert.ok(enLanding.size > 0, 'no se encontró ningún .service-icons__item en index.html');
  });

  for (const [etiqueta, titulo] of Object.entries(equivalencias)) {
    test(`${etiqueta}: mismo SVG (mismos <path>) que en servicios.html`, () => {
      const svgLanding = enLanding.get(etiqueta);
      const svgServicio = enServicios.get(titulo);
      assert.ok(svgLanding, `falta el acceso directo "${etiqueta}" en index.html`);
      assert.ok(svgServicio, `falta la tarjeta "${titulo}" en servicios.html`);
      assert.equal(normalizar(svgServicio), normalizar(svgLanding));
    });
  }
});

describe('Panel deslizable (sheet) — overscroll contenido', () => {
  test('.sheet tiene overscroll-behavior: contain', () => {
    const codigo = leer('pagbateria/public/assets/css/v2/components.css');
    const bloqueSheet = codigo.match(/\.sheet\s*\{[^}]*\}/);
    assert.ok(bloqueSheet, 'debe existir la regla .sheet en components.css');
    assert.match(
      bloqueSheet[0],
      /overscroll-behavior:\s*contain/,
      'sin esto, el scroll dentro del sheet se traspasa a la página de fondo'
    );
  });
});
