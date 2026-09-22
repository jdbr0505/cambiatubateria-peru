/**
 * Verificación estática de la seguridad del login.
 *
 * PHP no está instalado en el entorno de desarrollo, así que estas pruebas
 * analizan el código fuente en vez de ejecutar peticiones. El equivalente
 * dinámico vive en tests/e2e/login-security.spec.js y corre contra un
 * servidor PHP real.
 *
 * Lo que se protege aquí son regresiones concretas que ya estuvieron
 * presentes en producción, no reglas de estilo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const LOGIN_PATH = 'adminbateria/backend/api/login.php';
const ADMIN_JS = 'adminbateria/assets/js/admin.js';

/** @returns {string} */
function leerLogin() {
  assert.ok(existsSync(LOGIN_PATH), `no existe ${LOGIN_PATH}`);
  return readFileSync(LOGIN_PATH, 'utf8');
}

describe('login.php — cuentas sembradas', () => {
  test('no siembra una cuenta admin con contraseña conocida', () => {
    const src = leerLogin();
    // El código original hacía password_hash('admin', ...) e insertaba el
    // usuario 'admin' si la tabla estaba vacía. Cualquier despliegue nuevo
    // nacía con una puerta abierta que nadie recordaba cerrar.
    assert.ok(
      !/password_hash\(\s*['"]admin['"]/.test(src),
      'no debe generar el hash de la contraseña literal "admin"'
    );
  });

  test('no inserta usuarios automáticamente', () => {
    const src = leerLogin();
    assert.ok(
      !/INSERT\s+INTO\s+usuarios/i.test(src),
      'el login no debe crear cuentas; el primer admin se crea a mano'
    );
  });
});

describe('login.php — verificación de contraseña', () => {
  test('no acepta contraseñas en texto plano como respaldo', () => {
    const src = leerLogin();
    // El código original comparaba hash_equals(password_hash_guardado, $password):
    // si la columna traía texto plano (por un import SQL), un volcado de la
    // base de datos se convertía en acceso directo al panel.
    assert.ok(
      !/hash_equals\(\s*\(string\)\$user\['password_hash'\]\s*,\s*\$password/.test(src),
      'no debe comparar la contraseña recibida contra el campo password_hash en claro'
    );
  });

  test('usa password_verify para validar', () => {
    const src = leerLogin();
    assert.ok(/password_verify\s*\(/.test(src), 'debe validar con password_verify');
  });
});

describe('login.php — resistencia a fuerza bruta', () => {
  test('lleva la cuenta de intentos fallidos', () => {
    const src = leerLogin();
    assert.ok(
      /intentos_fallidos/.test(src),
      'debe registrar los intentos fallidos para poder bloquear'
    );
  });

  test('bloquea temporalmente la cuenta', () => {
    const src = leerLogin();
    assert.ok(
      /bloqueado_hasta/.test(src),
      'debe existir una ventana de bloqueo tras varios fallos'
    );
  });

  test('responde 429 cuando la cuenta está bloqueada', () => {
    const src = leerLogin();
    assert.ok(/429/.test(src), 'el bloqueo debe devolver 429, no 401');
  });
});

describe('login.php — no filtra qué cuentas existen', () => {
  test('no distingue "usuario no encontrado" de "contraseña incorrecta"', () => {
    const src = leerLogin();
    // Mensajes distintos permiten enumerar qué usuarios existen antes de
    // atacar la contraseña.
    assert.ok(
      !/Usuario no encontrado|no encontrado o inactivo/i.test(src),
      'el mensaje de error no debe revelar si el usuario existe'
    );
  });
});

describe('login.php — rol=tecnico no entra al panel', () => {
  test('bloquea el login con el mismo mensaje genérico, no revela que el rol existe', () => {
    const src = leerLogin();
    // rol='tecnico' nunca fue pensado como cuenta de panel (el flujo que lo
    // motivó, auxilio/GPS, se quitó del sitio) — se mantiene el bloqueo como
    // defensa en profundidad por si queda alguna fila así. Sin él tendría
    // acceso completo al panel.
    assert.match(src, /\$user\['rol'\] === 'tecnico'/);
    // Debe estar en la MISMA condición que activo/existencia, no en una rama
    // aparte con su propio mensaje — así no delata que el rol existe.
    const inicio = src.indexOf("if (!\$user");
    const fin = src.indexOf(') {', inicio);
    const condicion = src.slice(inicio, fin);
    assert.match(condicion, /rol'\] === 'tecnico'/);

    const bloque = src.slice(inicio, src.indexOf('\n}', fin));
    assert.match(bloque, /CREDENCIALES_INVALIDAS/);
    assert.match(bloque, /password_verify\(\$password, HASH_SEÑUELO\)/);
  });
});

describe('login.php — manejo de sesión', () => {
  test('rota el identificador de sesión al autenticar', () => {
    const src = leerLogin();
    assert.ok(
      /session_regenerate_id\s*\(\s*true\s*\)/.test(src),
      'debe llamar session_regenerate_id(true) para anular fijación de sesión'
    );
  });

  test('usa la sesión endurecida en vez de session_start directo', () => {
    const src = leerLogin();
    assert.ok(
      /start_secure_session\s*\(\)/.test(src),
      'debe usar start_secure_session() (cookie Secure, HttpOnly, SameSite)'
    );
  });

  test('emite un token CSRF para el panel', () => {
    const src = leerLogin();
    assert.ok(
      /issue_csrf_token\s*\(\)/.test(src),
      'el panel necesita el token para poder escribir tras la Tarea 2'
    );
  });
});

describe('login.php — no filtra detalles internos', () => {
  test('el mensaje de excepción no llega a la respuesta HTTP', () => {
    const src = leerLogin();
    // El riesgo no es usar getMessage(), sino enviarlo al cliente:
    // 'DB error: '.$e->getMessage() expone nombres de tablas, rutas y a veces
    // credenciales. Dentro de error_log() es justamente lo que se quiere.
    const lineasPeligrosas = src
      .split('\n')
      .filter((l) => {
        const codigo = l.trim();
        if (codigo.startsWith('//') || codigo.startsWith('*')) return false; // comentarios
        return /getMessage\(\)/.test(codigo) && !/error_log\s*\(/.test(codigo);
      });

    assert.deepEqual(
      lineasPeligrosas,
      [],
      `getMessage() debe usarse solo dentro de error_log(). Líneas: ${lineasPeligrosas.join(' | ')}`
    );
  });

  test('todo getMessage registrado va acompañado de una respuesta genérica', () => {
    const src = leerLogin();
    // Cada bloque catch que loguea debe responder algo neutro al cliente.
    assert.ok(
      /Servicio no disponible/.test(src),
      'los fallos internos deben responder un mensaje genérico'
    );
  });
});

describe('admin.js — envía el token CSRF', () => {
  test('el panel adjunta X-CSRF-Token en las escrituras', () => {
    const src = readFileSync(ADMIN_JS, 'utf8');
    // Tras la Tarea 2 todos los endpoints de escritura exigen CSRF. Sin esto,
    // cada guardado del panel devuelve 403 y el administrador no puede
    // trabajar.
    assert.ok(
      /X-CSRF-Token/i.test(src),
      'admin.js debe enviar la cabecera X-CSRF-Token en las peticiones de escritura'
    );
  });
});
