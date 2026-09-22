/**
 * Cambio de fuente de encabezados: Space Grotesk (geométrica, look "startup")
 * -> Libre Franklin (grotesca más seria/formal, misma familia visual, pedido
 * explícito del jefe) — manteniendo Manrope para el cuerpo de texto. Debe
 * cambiar en TODAS partes a la vez: sitio público Y panel admin (ya
 * compartían tipografía a propósito, ver docs/HANDOFF.md — dejar uno atrás
 * reintroduce la divergencia que se evitó antes).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

const PAGINAS_PUBLICAS = [
  'pagbateria/public/index.html',
  'pagbateria/public/catalogo.html',
  'pagbateria/public/servicios.html',
  'pagbateria/public/cobertura.html',
  'pagbateria/public/nosotros.html',
  'pagbateria/public/contacto.html',
  'pagbateria/public/cookies.html',
  'pagbateria/public/aviso-legal.html',
  'pagbateria/public/privacidad.html',
];

describe('--font-display: Libre Franklin, en vez de Space Grotesk', () => {
  test('tokens.css define el token con Libre Franklin', () => {
    const css = leer('pagbateria/public/assets/css/v2/tokens.css');
    assert.match(css, /--font-display:\s*"Libre Franklin"/);
  });

  test('ninguna página pública carga Space Grotesk de Google Fonts', () => {
    for (const pagina of PAGINAS_PUBLICAS) {
      const html = leer(pagina);
      assert.doesNotMatch(html, /Space\+?Grotesk/i, `${pagina} todavía pide Space Grotesk`);
      assert.match(html, /Libre\+Franklin/, `${pagina} no pide Libre Franklin`);
    }
  });

  test('el panel admin (index + login) también cambió — comparten tipografía con el sitio público a propósito', () => {
    for (const pagina of ['adminbateria/index.html', 'adminbateria/login.html']) {
      const html = leer(pagina);
      assert.doesNotMatch(html, /Space\+?Grotesk/i, `${pagina} todavía pide Space Grotesk`);
      assert.match(html, /Libre\+Franklin/, `${pagina} no pide Libre Franklin`);
    }
  });

  test('adminbateria/assets/css/styles.css — .brand-name usa Libre Franklin', () => {
    const css = leer('adminbateria/assets/css/styles.css');
    assert.match(css, /\.brand-name\{font-family:"Libre Franklin"/);
  });

  test('no queda ningún rastro de "Space Grotesk" en ningún CSS o HTML del proyecto', () => {
    const archivos = [
      'pagbateria/public/assets/css/v2/tokens.css',
      'pagbateria/public/assets/css/v2/base.css',
      'pagbateria/public/assets/css/v2/nav.css',
      'pagbateria/public/assets/css/v2/layout.css',
      'pagbateria/public/assets/css/v2/components.css',
      'pagbateria/public/assets/css/v2/sections.css',
      'adminbateria/assets/css/styles.css',
      ...PAGINAS_PUBLICAS,
      'adminbateria/index.html',
      'adminbateria/login.html',
    ];
    for (const archivo of archivos) {
      assert.doesNotMatch(leer(archivo), /Space Grotesk/, `${archivo} todavía menciona Space Grotesk`);
    }
  });
});
