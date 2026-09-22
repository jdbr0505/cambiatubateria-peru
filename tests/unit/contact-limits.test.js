/**
 * Verificación estática de los límites de contact.php.
 *
 * PHP no está instalado en desarrollo, así que se analiza el código fuente.
 * El endpoint es público y sin sesión: escribe a un log en disco desde
 * cualquier visitante. Sin límites, alguien puede llenar el disco del hosting
 * (denegación de servicio) o inflar el log con mensajes gigantes.
 *
 * Tres defensas que se verifican:
 *   1. Tope de tamaño por campo → un mensaje no puede pesar megas.
 *   2. Límite de frecuencia por IP → no se puede martillar el endpoint.
 *   3. Tope del archivo de log → deja de escribir antes de llenar el disco.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RUTA = 'pagbateria/backend/api/contact.php';

/** Código sin comentarios, para no medir texto explicativo. */
function soloCodigo() {
  return readFileSync(RUTA, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('contact.php — tope de tamaño por campo', () => {
  test('limita la longitud del mensaje', () => {
    const src = soloCodigo();
    // Debe existir un límite explícito y una comprobación de longitud.
    assert.ok(
      /mb_strlen|strlen/.test(src),
      'debe medir la longitud de los campos con strlen/mb_strlen'
    );
  });

  test('rechaza entradas que superan el máximo con 422 o 413', () => {
    const src = soloCodigo();
    assert.ok(
      /\b(413|422)\b/.test(src),
      'una entrada demasiado grande debe responder 413 o 422, no guardarse'
    );
  });

  test('define constantes de longitud máxima', () => {
    const src = soloCodigo();
    assert.ok(
      /MAX_[A-Z_]*(LEN|LENGTH|SIZE)/.test(src),
      'los máximos deben ser constantes nombradas, no números mágicos'
    );
  });
});

describe('contact.php — límite de frecuencia por IP', () => {
  test('registra el momento de cada envío por IP', () => {
    const src = soloCodigo();
    assert.ok(
      /REMOTE_ADDR/.test(src),
      'debe usar la IP del cliente para limitar la frecuencia'
    );
  });

  test('responde 429 cuando se supera el límite', () => {
    const src = soloCodigo();
    assert.ok(
      /\b429\b/.test(src),
      'demasiados envíos seguidos deben devolver 429 Too Many Requests'
    );
  });

  test('define una ventana de tiempo para el límite', () => {
    const src = soloCodigo();
    assert.ok(
      /RATE_[A-Z_]+|VENTANA|WINDOW|COOLDOWN/.test(src),
      'debe haber una ventana o cooldown configurable, no un valor suelto'
    );
  });
});

describe('contact.php — tope del archivo de log', () => {
  test('comprueba el tamaño del log antes de escribir', () => {
    const src = soloCodigo();
    assert.ok(
      /filesize\s*\(/.test(src),
      'debe medir el tamaño del log con filesize antes de agregar'
    );
  });

  test('define un tamaño máximo de log', () => {
    const src = soloCodigo();
    assert.ok(
      /MAX_LOG|LOG_MAX/.test(src),
      'el tope del log debe ser una constante nombrada'
    );
  });
});

describe('contact.php — no rompe lo que ya funcionaba', () => {
  test('sigue exigiendo los tres campos obligatorios', () => {
    const src = soloCodigo();
    assert.ok(/name/.test(src) && /phone/.test(src) && /message/.test(src));
    assert.ok(/422/.test(src), 'campos vacíos siguen devolviendo 422');
  });

  test('sigue respondiendo éxito al guardar', () => {
    const src = soloCodigo();
    assert.ok(/'success'\s*=>\s*true/.test(src));
  });

  test('sigue rechazando métodos que no son POST', () => {
    const src = soloCodigo();
    assert.ok(/405/.test(src));
  });
});
