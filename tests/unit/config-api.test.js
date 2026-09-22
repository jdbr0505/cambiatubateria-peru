/**
 * Verificación estática del contrato entre config.php y los dos db.php.
 *
 * Esta prueba nace de un fallo real en producción. La Fase 0 movió las
 * credenciales de MySQL al .env (commit 157eb15) y escribió los db.php contra
 * una API de configuración basada en funciones — config_require() y
 * config_get() — que nunca se implementó: api/lib/config.php entrega
 * constantes. Cada llamada a get_pdo() moría con "Call to undefined function
 * config_require()", y los diez endpoints públicos devolvían 500.
 *
 * Pasó inadvertido meses porque PHP no está instalado en desarrollo: nadie
 * ejecutó ese código hasta subirlo al hosting. La verificación estática del
 * repositorio no comprobaba que las funciones invocadas existieran.
 *
 * Lo que se cubre:
 *   1. Toda función config_* que se llama está definida en config.php.
 *   2. get_pdo() de pagbateria degrada a null (fallback a JSON), no fatal.
 *   3. db() de adminbateria deja propagar la excepción, según su contrato.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG = 'api/lib/config.php';
const DB_PUBLICO = 'pagbateria/backend/lib/db.php';
const DB_ADMIN = 'adminbateria/backend/lib/db.php';

const IGNORADOS = new Set(['node_modules', '.git', 'docs', 'tests', 'scripts']);

/** Todos los .php del repositorio, sin carpetas de desarrollo. */
function archivosPhp(dir = '.', acumulado = []) {
  for (const entrada of readdirSync(dir)) {
    if (IGNORADOS.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivosPhp(ruta, acumulado);
    } else if (entrada.endsWith('.php')) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

/** Código sin comentarios, para no contar ejemplos en la documentación. */
function soloCodigo(ruta) {
  return readFileSync(ruta, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('config.php — funciones que los db.php dan por hechas', () => {
  test('define config_get()', () => {
    assert.match(
      soloCodigo(CONFIG),
      /function\s+config_get\s*\(/,
      'config.php debe definir config_get(); sin ella get_pdo() muere con "undefined function"'
    );
  });

  test('define config_require()', () => {
    assert.match(
      soloCodigo(CONFIG),
      /function\s+config_require\s*\(/,
      'config.php debe definir config_require(); sin ella get_pdo() muere con "undefined function"'
    );
  });

  test('config_require() falla ruidosamente en vez de devolver vacío', () => {
    const src = soloCodigo(CONFIG);
    const cuerpo = src.slice(src.indexOf('function config_require'));
    assert.match(
      cuerpo,
      /throw\s+new\s+\w*Exception/,
      'una credencial ausente debe lanzar con el nombre de la variable, no producir un DSN a medias'
    );
  });

  test('toda función config_* invocada en el repositorio está definida', () => {
    const definidas = new Set(
      [...soloCodigo(CONFIG).matchAll(/function\s+(config_\w+)\s*\(/g)].map((m) => m[1])
    );

    const faltantes = new Map();
    for (const ruta of archivosPhp()) {
      if (ruta.replace(/\\/g, '/') === CONFIG) continue;
      for (const [, nombre] of soloCodigo(ruta).matchAll(/\b(config_\w+)\s*\(/g)) {
        if (!definidas.has(nombre)) {
          if (!faltantes.has(nombre)) faltantes.set(nombre, []);
          faltantes.get(nombre).push(ruta);
        }
      }
    }

    assert.deepEqual(
      [...faltantes.keys()],
      [],
      `funciones invocadas pero nunca definidas: ${[...faltantes.entries()]
        .map(([n, rutas]) => `${n}() en ${rutas.join(', ')}`)
        .join(' | ')}`
    );
  });
});

describe('get_pdo() de pagbateria — degrada, no revienta', () => {
  test('arma el DSN dentro del try', () => {
    const src = soloCodigo(DB_PUBLICO);
    const inicioTry = src.indexOf('try {');
    const posicionDsn = src.indexOf('$dsn');
    assert.ok(inicioTry !== -1, 'get_pdo() debe tener un bloque try');
    assert.ok(
      posicionDsn > inicioTry,
      'el DSN debe armarse dentro del try: config_require() lanza si falta una credencial, ' +
        'y fuera del try ese throw tumba los endpoints públicos con un 500 en vez de caer al JSON de respaldo'
    );
  });

  test('devuelve null cuando la conexión falla', () => {
    const src = soloCodigo(DB_PUBLICO);
    assert.match(src, /catch\s*\(\s*Throwable/, 'debe capturar Throwable, no solo PDOException');
    assert.match(src, /\$pdo\s*=\s*null/, 'el catch debe dejar $pdo en null para permitir el fallback a JSON');
  });

  test('no filtra el detalle del error en la respuesta HTTP', () => {
    const src = soloCodigo(DB_PUBLICO);
    assert.match(src, /error_log\(/, 'el detalle va al log del servidor');
    // Los límites de palabra importan: sin ellos, sprintf() contiene la
    // subcadena "print" y la prueba falla contra código correcto.
    assert.ok(
      !/\becho\b|\bprint\b|\bsend_json\b/.test(src),
      'db.php no debe escribir en la respuesta: expondría credenciales o el nombre de la base'
    );
  });
});

describe('db() de adminbateria — contrato opuesto, a propósito', () => {
  test('no captura la excepción de conexión', () => {
    const src = soloCodigo(DB_ADMIN);
    assert.ok(
      !/catch\s*\(/.test(src),
      'db() promete devolver un PDO usable: capturar y devolver null rompería a sus llamadores'
    );
  });

  test('declara PDO no nulo como retorno', () => {
    assert.match(
      soloCodigo(DB_ADMIN),
      /function\s+db\s*\(\s*\)\s*:\s*PDO\b/,
      'la firma debe seguir siendo PDO, no ?PDO'
    );
  });
});
