// tests/unit/endpoint-auth.test.js
//
// Verificación ESTÁTICA (no necesita PHP ni servidor) de que ningún endpoint de
// la API con operaciones de escritura quede sin guardián de autenticación.
//
// Por qué existe: el test de Playwright (tests/e2e/api-auth.spec.js) cubre 4
// endpoints y necesita un servidor PHP corriendo. El error real y más probable
// al cerrar este agujero es olvidarse de UNO de los 22 archivos afectados.
// Este test recorre el árbol completo y falla si falta cualquiera.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directorios donde viven los endpoints HTTP de la API. */
const DIRECTORIOS_API = [
  path.join(RAIZ, 'adminbateria', 'backend', 'api'),
  path.join(RAIZ, 'pagbateria', 'backend', 'api'),
];

/**
 * Marcadores de operación de escritura. Si un endpoint contiene cualquiera de
 * estos, modifica datos del servidor y por tanto necesita guardián.
 */
const PATRONES_ESCRITURA = [
  { nombre: 'INSERT', regex: /\bINSERT\s+INTO\b/i },
  { nombre: 'UPDATE', regex: /\bUPDATE\s+[`"']?[a-z_][a-z0-9_]*[`"']?\s+SET\b/i },
  { nombre: 'DELETE', regex: /\bDELETE\s+FROM\b/i },
  { nombre: 'move_uploaded_file', regex: /\bmove_uploaded_file\s*\(/ },
];

/**
 * Endpoints que escriben pero NO deben llevar el guardián, con el motivo.
 * Cualquier archivo fuera de esta lista debe estar protegido.
 */
const EXENTOS = new Map([
  [
    'adminbateria/backend/api/login.php',
    'El propio login: exigir sesión antes de iniciar sesión sería un bucle. Se endurece en la Tarea 3.',
  ],
]);

/** El guardián puede ser require_write_access() o require_auth(). */
const REGEX_GUARDIAN = /\brequire_(write_access|auth)\s*\(\s*\)\s*;/;
const REGEX_REQUIRE_AUTH_PHP = /require_once\s+__DIR__\s*\.\s*'([^']*auth\.php)'\s*;/;

function listarEndpoints() {
  const archivos = [];
  for (const dir of DIRECTORIOS_API) {
    if (!fs.existsSync(dir)) continue;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isFile() && entrada.name.endsWith('.php')) {
        archivos.push(path.join(dir, entrada.name));
      }
    }
  }
  return archivos.sort();
}

function rutaRelativa(archivo) {
  return path.relative(RAIZ, archivo).split(path.sep).join('/');
}

function operacionesDeEscritura(contenido) {
  return PATRONES_ESCRITURA.filter(({ regex }) => regex.test(contenido)).map(({ nombre }) => nombre);
}

const ENDPOINTS = listarEndpoints().map((archivo) => {
  const contenido = fs.readFileSync(archivo, 'utf8');
  return {
    archivo,
    relativa: rutaRelativa(archivo),
    contenido,
    escrituras: operacionesDeEscritura(contenido),
  };
});

test('hay endpoints de API que analizar (el descubrimiento no está roto)', () => {
  assert.ok(ENDPOINTS.length > 0, 'no se encontró ningún .php bajo */backend/api/');
  assert.ok(
    ENDPOINTS.some((e) => e.escrituras.length > 0),
    'no se detectó ninguna operación de escritura: los patrones deben estar mal',
  );
});

test('api/lib/auth.php existe y define el guardián', () => {
  const auth = path.join(RAIZ, 'api', 'lib', 'auth.php');
  assert.ok(fs.existsSync(auth), 'falta api/lib/auth.php');
  const contenido = fs.readFileSync(auth, 'utf8');
  for (const fn of [
    'start_secure_session',
    'current_user',
    'require_auth',
    'issue_csrf_token',
    'require_csrf',
    'require_write_access',
  ]) {
    assert.match(contenido, new RegExp(`function\\s+${fn}\\s*\\(`), `api/lib/auth.php debe definir ${fn}()`);
  }
});

for (const endpoint of ENDPOINTS.filter((e) => e.escrituras.length > 0 && !EXENTOS.has(e.relativa))) {
  test(`${endpoint.relativa} exige autenticación para escribir (${endpoint.escrituras.join(', ')})`, () => {
    // assert.ok en lugar de assert.match: match volcaría el .php entero al fallar.
    assert.ok(
      REGEX_REQUIRE_AUTH_PHP.test(endpoint.contenido),
      `${endpoint.relativa} escribe datos pero no incluye api/lib/auth.php`,
    );
    assert.ok(
      REGEX_GUARDIAN.test(endpoint.contenido),
      `${endpoint.relativa} escribe datos pero nunca llama a require_write_access() ni require_auth()`,
    );
  });
}

test('la ruta relativa a auth.php resuelve a un archivo real en cada endpoint', () => {
  const protegidos = ENDPOINTS.filter((e) => REGEX_REQUIRE_AUTH_PHP.test(e.contenido));
  assert.ok(protegidos.length > 0, 'ningún endpoint incluye auth.php todavía');
  for (const { archivo, relativa, contenido } of protegidos) {
    const [, ruta] = contenido.match(REGEX_REQUIRE_AUTH_PHP);
    const resuelta = path.resolve(path.dirname(archivo), ruta.replace(/^\//, ''));
    assert.ok(
      fs.existsSync(resuelta),
      `${relativa}: require_once '${ruta}' apunta a ${rutaRelativa(resuelta)}, que no existe`,
    );
  }
});

test('usuarios.php exige sesión también en GET (lista de administradores)', () => {
  const usuarios = ENDPOINTS.find((e) => e.relativa === 'adminbateria/backend/api/usuarios.php');
  assert.ok(usuarios, 'no se encontró adminbateria/backend/api/usuarios.php');
  assert.ok(
    /\brequire_auth\s*\(\s*\)\s*;/.test(usuarios.contenido),
    'usuarios.php debe llamar a require_auth() para cerrar también el GET',
  );
});

test('el formulario público de contacto sigue sin guardián', () => {
  const contacto = ENDPOINTS.find((e) => e.relativa === 'pagbateria/backend/api/contact.php');
  assert.ok(contacto, 'no se encontró pagbateria/backend/api/contact.php');
  assert.ok(
    !REGEX_GUARDIAN.test(contacto.contenido),
    'contact.php es el formulario anónimo del sitio público: ponerle guardián lo rompe',
  );
});

test('cada exención sigue apuntando a un archivo existente', () => {
  for (const [relativa, motivo] of EXENTOS) {
    assert.ok(fs.existsSync(path.join(RAIZ, relativa)), `la exención ${relativa} apunta a un archivo inexistente`);
    assert.ok(motivo.length > 20, `la exención ${relativa} necesita un motivo explícito`);
  }
});
