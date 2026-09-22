/**
 * Protege el sistema de diseño de erosionarse.
 *
 * El fallo típico no es un CSS mal escrito: es que con el tiempo alguien
 * mete un `#3498db` suelto "solo por esta vez" y a los seis meses la paleta
 * tiene 40 colores. Estas pruebas hacen que eso rompa la build.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS_DIR = 'pagbateria/public/assets/css/v2';

const tokens     = readFileSync(`${CSS_DIR}/tokens.css`, 'utf8');
const base       = readFileSync(`${CSS_DIR}/base.css`, 'utf8');
const layout     = readFileSync(`${CSS_DIR}/layout.css`, 'utf8');
const components = readFileSync(`${CSS_DIR}/components.css`, 'utf8');

/** Quita comentarios CSS para no analizar texto explicativo como código. */
function soloCodigo(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Tokens declarados', () => {
  test('define todos los tokens que consumen los componentes', () => {
    const requeridos = [
      '--brand-950', '--brand-800', '--energy-400', '--energy-600',
      '--urgent-600', '--ink-900', '--paper', '--line',
      '--space-4', '--radius-full', '--touch-min', '--touch-primary',
      '--text-base', '--text-3xl', '--font-sans', '--container',
    ];
    for (const t of requeridos) {
      assert.ok(tokens.includes(t), `falta el token ${t}`);
    }
  });

  test('el objetivo táctil mínimo es de al menos 44px', () => {
    const m = tokens.match(/--touch-min:\s*(\d+)px/);
    assert.ok(m, 'debe declararse --touch-min en píxeles');
    assert.ok(Number(m[1]) >= 44, 'las guías de accesibilidad exigen 44px');
  });

  test('la acción principal es más grande que el mínimo', () => {
    const min = Number(tokens.match(/--touch-min:\s*(\d+)px/)[1]);
    const pri = Number(tokens.match(/--touch-primary:\s*(\d+)px/)[1]);
    // Un conductor con prisa, de pie junto al auto, falla objetivos mínimos.
    assert.ok(pri > min, 'la acción de auxilio debe superar el objetivo mínimo');
  });
});

describe('Disciplina de color', () => {
  test('los colores solo se declaran en tokens.css', () => {
    // Un hex fuera del archivo de tokens es una excepción no documentada
    // que a los meses convierte la paleta en un muestrario.
    for (const [nombre, css] of [['base', base], ['layout', layout], ['components', components]]) {
      const sueltos = soloCodigo(css).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      assert.deepEqual(sueltos, [], `${nombre}.css tiene colores fuera de tokens: ${sueltos.join(', ')}`);
    }
  });

  test('tokens.css declara sus colores dentro de :root', () => {
    const cuerpo = soloCodigo(tokens).split('}').slice(1).join('}');
    const fuera = cuerpo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    assert.deepEqual(fuera, [], `colores declarados fuera de :root: ${fuera.join(', ')}`);
  });
});

describe('El rojo de urgencia se mantiene escaso', () => {
  test('solo lo usan el botón de auxilio y el toast de error', () => {
    // Repartir el rojo lo degrada de señal a decoración: si aparece en varios
    // sitios, el conductor deja de saber cuál es la acción que lo saca del
    // apuro.
    const usos = [...soloCodigo(components).matchAll(/--urgent-\d+/g)].length;
    assert.ok(usos <= 8, `el rojo aparece ${usos} veces; revisa que siga siendo la excepción`);
  });

  test('ninguna regla .hero* pinta nada de rojo — el CTA de auxilio ya vive fuera del hero', () => {
    // Extrae cada regla plana "selector { cuerpo }" (funciona también dentro
    // de @media: una regla anidada con llaves sin cerrar simplemente no
    // matchea como bloque externo, y el regex la encuentra igual como bloque
    // propio en el siguiente intento). No usar un recorte por texto de
    // comentario como límite: los comentarios ya se quitaron arriba, así que
    // ese límite nunca aparece y el recorte se comía el resto del archivo.
    const codigo = soloCodigo(components);
    const patron = /([^{}]+)\{([^{}]*)\}/g;
    let coincidencia;
    const cuerposHero = [];
    while ((coincidencia = patron.exec(codigo))) {
      const selector = coincidencia[1].trim();
      const esSelectorHero = selector.split(',').some((s) => {
        const t = s.trim();
        return t === '.hero' || t.startsWith('.hero--') || t.startsWith('.hero__') || t.startsWith('.hero ') || t.startsWith('.hero:');
      });
      if (esSelectorHero) cuerposHero.push(coincidencia[2]);
    }
    assert.ok(cuerposHero.length > 0, 'no se encontró ninguna regla .hero* — revisa el patrón');
    for (const cuerpo of cuerposHero) {
      assert.doesNotMatch(cuerpo, /--urgent-/, `una regla del hero usa color de urgencia: ${cuerpo.slice(0, 80)}`);
    }
  });
});

describe('Reglas de accesibilidad', () => {
  test('respeta la preferencia de movimiento reducido', () => {
    assert.ok(
      /prefers-reduced-motion/.test(base),
      'debe anular las animaciones para quien lo pide en el sistema'
    );
  });

  test('el foco es visible solo con teclado', () => {
    assert.ok(/:focus-visible/.test(base), 'debe usar :focus-visible, no :focus');
  });

  test('el eyebrow sobre papel usa el ámbar oscuro', () => {
    // El ámbar claro (#F5A524) sobre blanco da 2.75:1 y no alcanza el
    // mínimo AA de 4.5:1. Medido en navegador, no supuesto.
    const bloque = soloCodigo(base).split('.eyebrow')[1]?.split('}')[0] ?? '';
    assert.ok(
      /--energy-600/.test(bloque),
      'el eyebrow sobre fondo claro debe usar --energy-600 para cumplir AA'
    );
  });

  test('los enlaces del pie alcanzan el objetivo táctil', () => {
    const bloque = soloCodigo(layout).split('.footer__list a')[1]?.split('}')[0] ?? '';
    assert.ok(
      /min-height:\s*var\(--touch-min\)/.test(bloque),
      'sin altura mínima quedan en 19px y se fallan al tocar'
    );
  });
});

describe('Rendimiento', () => {
  test('ninguna hoja usa @import', () => {
    // Los @import serializan las descargas: cada uno espera a que el
    // anterior termine, y eso retrasa el First Contentful Paint que
    // sostiene el Quality Score de Google Ads.
    for (const [nombre, css] of [['tokens', tokens], ['base', base], ['layout', layout], ['components', components]]) {
      // soloCodigo: la mención de "@import" en un comentario explicativo no
      // es un @import real.
      assert.ok(!/@import/.test(soloCodigo(css)), `${nombre}.css usa @import`);
    }
  });

  // El peso del CSS lo gobierna `performance-budget.test.js`, que mide gzip
  // sobre las SEIS hojas del sistema v2. Acá vivía un segundo tope, sin
  // comprimir y sobre solo cuatro de ellas: medía el número que al navegador
  // no le llega (se sirve comprimido) y sobre un subconjunto, así que había
  // que subirlo cada vez que crecía una feature real — ya se subió de 40 a 44
  // una vez. Dos topes para lo mismo, y el flojo era el que fallaba: se
  // eliminó el duplicado, no el presupuesto.
});
