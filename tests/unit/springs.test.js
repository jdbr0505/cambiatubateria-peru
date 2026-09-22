/**
 * Pruebas de la física de resorte.
 *
 * El integrador es matemática pura, así que se puede verificar sin navegador
 * simulando requestAnimationFrame con un reloj controlado. Eso permite probar
 * cosas que en un navegador real son difíciles de provocar: un salto de varios
 * segundos entre fotogramas, o el comportamiento con movimiento reducido.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/** Define un global sobreescribiendo getters de solo lectura de Node. */
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

/**
 * Reloj de fotogramas controlado a mano.
 * @param {{stepMs?: number, maxFrames?: number}} [opciones]
 */
function instalarRelojDeFrames({ stepMs = 16, maxFrames = 600 } = {}) {
  let ahora = 0;
  let siguienteId = 1;
  /** @type {Map<number, (t:number)=>void>} */
  const pendientes = new Map();

  defineGlobal('requestAnimationFrame', (cb) => {
    const id = siguienteId++;
    pendientes.set(id, cb);
    return id;
  });
  defineGlobal('cancelAnimationFrame', (id) => { pendientes.delete(id); });

  return {
    /** Avanza un fotograma. @returns {boolean} si quedaba algo pendiente */
    tick(ms = stepMs) {
      ahora += ms;
      const cbs = [...pendientes.values()];
      pendientes.clear();
      for (const cb of cbs) cb(ahora);
      return cbs.length > 0;
    },
    /** Corre hasta que no queden fotogramas pendientes. */
    correrHastaReposo(ms = stepMs) {
      let n = 0;
      while (pendientes.size > 0 && n < maxFrames) { this.tick(ms); n++; }
      return n;
    },
    get pendientes() { return pendientes.size; },
  };
}

let reloj;

beforeEach(() => {
  defineGlobal('matchMedia', () => ({ matches: false }));
  reloj = instalarRelojDeFrames();
});

afterEach(() => {
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.matchMedia;
});

const RUTA = '../../pagbateria/public/assets/js/motion/springs.js';

describe('Presets de resorte', () => {
  test('todos amortiguan lo suficiente para no rebotar de forma perceptible', async () => {
    const { SPRING } = await import(RUTA);
    for (const [nombre, preset] of Object.entries(SPRING)) {
      assert.ok(
        preset.damping >= 20,
        `${nombre} tiene damping ${preset.damping}: por debajo de 20 el rebote se ve descuidado`
      );
    }
  });

  test('snappy responde más rápido que gentle', async () => {
    const { SPRING } = await import(RUTA);
    assert.ok(SPRING.snappy.stiffness > SPRING.gentle.stiffness);
  });

  test('los presets son inmutables', async () => {
    const { SPRING } = await import(RUTA);
    // Congelados a propósito: un componente que modifique el preset cambiaría
    // el movimiento de toda la interfaz sin que nadie lo note.
    assert.throws(() => { SPRING.snappy.stiffness = 1; }, TypeError);
  });

  test('la escala de pulsación es perceptible pero no parece un fallo', async () => {
    const { PRESS_SCALE } = await import(RUTA);
    assert.ok(PRESS_SCALE < 1, 'debe encoger');
    assert.ok(PRESS_SCALE >= 0.93, `${PRESS_SCALE} encoge demasiado: parece un glitch`);
  });
});

describe('Integrador de resorte', () => {
  test('converge al valor destino', async () => {
    const { animateSpring } = await import(RUTA);
    let ultimo = null;
    let termino = false;

    animateSpring({
      from: 0, to: 100,
      onUpdate: (v) => { ultimo = v; },
      onComplete: () => { termino = true; },
    });

    reloj.correrHastaReposo();

    assert.equal(termino, true, 'debe llamar a onComplete');
    assert.equal(ultimo, 100, 'debe aterrizar exactamente en el destino');
  });

  test('avanza hacia el destino de forma monótona con damping alto', async () => {
    const { animateSpring, SPRING } = await import(RUTA);
    const valores = [];

    animateSpring({
      from: 0, to: 100,
      spring: SPRING.snappy,
      onUpdate: (v) => valores.push(v),
    });
    reloj.correrHastaReposo();

    assert.ok(valores.length > 3, 'debe producir varios fotogramas');
    // Con snappy (damping 30) no debe pasarse del destino de forma visible.
    const maximo = Math.max(...valores);
    assert.ok(maximo <= 101, `se pasó hasta ${maximo.toFixed(1)}: rebote no deseado en snappy`);
  });

  test('acepta velocidad inicial para encadenar con un gesto', async () => {
    const { animateSpring } = await import(RUTA);
    const sinImpulso = [];
    const conImpulso = [];

    animateSpring({ from: 0, to: 100, onUpdate: (v) => sinImpulso.push(v) });
    reloj.correrHastaReposo();

    reloj = instalarRelojDeFrames();
    animateSpring({ from: 0, to: 100, velocity: 500, onUpdate: (v) => conImpulso.push(v) });
    reloj.correrHastaReposo();

    // Con impulso inicial el segundo fotograma ya va más adelantado.
    assert.ok(
      conImpulso[1] > sinImpulso[1],
      'la velocidad inicial debe acelerar el arranque'
    );
  });

  test('no explota cuando la pestaña estuvo en segundo plano', async () => {
    const { animateSpring } = await import(RUTA);
    const valores = [];

    animateSpring({ from: 0, to: 100, onUpdate: (v) => valores.push(v) });

    // Simula volver a la pestaña tras 5 segundos: sin el tope de 64 ms, la
    // integración numérica se dispara y el elemento sale de la pantalla.
    reloj.tick(16);
    reloj.tick(5000);
    reloj.correrHastaReposo();

    const fuera = valores.filter((v) => v < -50 || v > 200);
    assert.deepEqual(fuera, [], `valores fuera de rango: ${fuera.slice(0, 3).join(', ')}`);
  });

  test('la cancelación detiene la animación', async () => {
    const { animateSpring } = await import(RUTA);
    let llamadas = 0;

    const cancelar = animateSpring({ from: 0, to: 100, onUpdate: () => { llamadas++; } });
    reloj.tick();
    reloj.tick();
    const trasDos = llamadas;
    cancelar();
    reloj.correrHastaReposo();

    assert.equal(llamadas, trasDos, 'no debe seguir animando tras cancelar');
  });
});

describe('Respeto por prefers-reduced-motion', () => {
  test('salta al destino sin animar', async () => {
    defineGlobal('matchMedia', () => ({ matches: true }));
    const { animateSpring } = await import(RUTA);

    const valores = [];
    let termino = false;
    animateSpring({
      from: 0, to: 100,
      onUpdate: (v) => valores.push(v),
      onComplete: () => { termino = true; },
    });
    reloj.correrHastaReposo();

    // Para quien tiene trastorno vestibular el movimiento provoca mareo real:
    // un solo salto al valor final, sin fotogramas intermedios.
    assert.deepEqual(valores, [100]);
    assert.equal(termino, true);
  });

  test('prefersReducedMotion no falla si matchMedia no existe', async () => {
    delete globalThis.matchMedia;
    const { prefersReducedMotion } = await import(RUTA);
    assert.equal(prefersReducedMotion(), false);
  });
});
