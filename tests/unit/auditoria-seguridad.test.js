/**
 * Auditoría de seguridad pedida por el usuario ("corrobora que la página
 * esté 100% confiable... y que no hayan api keys o tokens en una parte
 * pública"). Encontró restos de un commit-instantánea viejo
 * (`8a4e148 chore: instantanea previa a reestructurar geolocalizacion`,
 * 25-ago-2026) que nunca se limpiaron:
 *
 * - `adminbateria/index.php`: un panel admin viejo y paralelo al actual
 *   (index.html + admin.js), SIN autenticación — llamaba a get_pdo() directo
 *   y creaba tablas sin pedir sesión. Si seguía en el servidor, cualquiera
 *   que pidiera esa URL tenía acceso admin completo sin loguearse.
 * - `adminbateria/backend/test-db.php`: sin auth, mostraba el mensaje real
 *   de PDOException si la conexión fallaba — reconocimiento gratis de la
 *   infraestructura interna.
 * - `adminbateria/error_log`: llegó a versionarse con la ruta absoluta del
 *   servidor (revela el usuario de cPanel) en varios stack traces. *.log
 *   en .gitignore no lo atrapaba — "error_log" no tiene extensión .log.
 * - `pagbateria/public/error_log`: el hermano de arriba, del mismo commit
 *   viejo — se pasó por alto en esa primera limpieza (solo se borró el de
 *   `adminbateria/`) y siguió versionado hasta que se encontró al preparar
 *   el repositorio para un remoto público. Regla general: el .gitignore
 *   nuevo protege contra que un archivo se VUELVA a versionar, pero no
 *   desrastrea uno que ya estaba en el índice de git — hay que buscar cada
 *   ruta donde PHP pudo haber escrito el log, no solo una.
 * - `pagbateria/backend/api/contacto_info.php` y `especialistas.php`:
 *   endpoints huérfanos (ningún JS vivo los llama — solo el también huérfano
 *   `app.js`), duplicando funcionalidad ya cubierta por endpoints actuales,
 *   y con el PUT usando get_pdo() (nullable) en vez de db() para escribir —
 *   contradice la separación de los dos backends documentada en docs/HANDOFF.md.
 * - `especialistas` en BDbateria.sql: semilla de datos de una demo vieja
 *   (BMW/Audi/Ford) del "roster de agentes por marca de auto" que se quitó
 *   del frontend en 73a7b44 pero nunca del schema base.
 *
 * Todos huérfanos (verificado: ningún archivo vivo los referencia) — se
 * borraron del repositorio. No se tocó ninguna tabla de la base de datos
 * (mismo principio que con auxilio_solicitudes/tecnico_posiciones): si
 * `especialistas`/`contact_info` siguen en producción, quedan huérfanas sin
 * código que las lea, sin costo ni riesgo — un DROP TABLE queda a criterio
 * del usuario.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/** @param {string} path */
function leer(path) {
  return readFileSync(path, 'utf8');
}

describe('Restos del commit-instantánea 8a4e148 — deben seguir borrados', () => {
  const archivosPeligrosos = [
    // Auth bypass real si seguía vivo en el servidor.
    'adminbateria/index.php',
    // Sin auth, filtraba el mensaje de PDOException.
    'adminbateria/backend/test-db.php',
    // Ruta absoluta del servidor en texto plano.
    'adminbateria/error_log',
    'pagbateria/public/error_log',
    // Endpoints huérfanos, duplican funcionalidad actual.
    'pagbateria/backend/api/contacto_info.php',
    'pagbateria/backend/api/especialistas.php',
    'pagbateria/backend/data/contacto_public.php',
    // Bundle JS legado de ~78KB, ningún HTML lo carga.
    'pagbateria/public/assets/js/app.js',
    // Clutter: backup y data del endpoint borrado.
    'pagbateria/backend/data/contacto.json.bak',
    'pagbateria/backend/data/especialistas.json',
  ];

  for (const archivo of archivosPeligrosos) {
    test(`${archivo} no existe en el repositorio`, () => {
      assert.equal(existsSync(archivo), false, `${archivo} debería estar borrado`);
    });
  }

  test('la carpeta anidada adminbateria/pagbateria/ (duplicado espurio) no existe', () => {
    assert.equal(existsSync('adminbateria/pagbateria'), false);
  });
});

describe('.gitignore y .htaccess — error_log no puede volver a filtrar la ruta del servidor', () => {
  test('.gitignore ignora el archivo "error_log" (sin extensión, *.log no lo atrapa)', () => {
    const gi = leer('.gitignore');
    assert.match(gi, /^error_log$/m, 'falta una línea exacta "error_log" en .gitignore');
  });

  test('.htaccess de la raíz bloquea error_log y cualquier *.log por HTTP', () => {
    const ht = leer('.htaccess');
    assert.match(ht, /<FilesMatch "\^error_log\$\|\\\.log\$">/);
  });
});

describe('Endpoints de escritura en pagbateria/backend/api — todos exigen sesión', () => {
  // brands.php SÍ usa get_pdo() para escribir (con degradación a JSON si la
  // BD no responde) — es un patrón válido y establecido, no lo que estaba
  // mal en contacto_info.php (que era huérfano, no un problema de qué
  // función de BD usaba). Lo que sí debe cumplir CUALQUIER endpoint de
  // escritura, esté donde esté: exigir sesión.
  test('todo archivo que maneja PUT/POST/PATCH/DELETE llama a require_write_access()', () => {
    const dir = 'pagbateria/backend/api';
    for (const archivo of readdirSync(dir)) {
      if (!archivo.endsWith('.php')) continue;
      const ruta = `${dir}/${archivo}`;
      const codigo = leer(ruta);
      const escribe = /\$method === '(PUT|POST|PATCH|DELETE)'/.test(codigo);
      if (!escribe) continue;
      assert.match(codigo, /require_write_access\(\)/, `${ruta} maneja un método de escritura sin exigir sesión`);
    }
  });
});

describe('Sin claves/tokens hardcodeados en el código servido al público', () => {
  test('ningún archivo JS/HTML bajo pagbateria/public tiene un patrón de clave de API embebida', () => {
    const patronesClave = /AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
    /** @param {string} dir */
    function recorrer(dir) {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = `${dir}/${entrada.name}`;
        if (entrada.isDirectory()) { recorrer(ruta); continue; }
        if (!/\.(js|html)$/.test(entrada.name)) continue;
        const contenido = leer(ruta);
        assert.doesNotMatch(contenido, patronesClave, `${ruta} contiene un patrón de clave/token embebido`);
      }
    }
    recorrer('pagbateria/public');
  });
});
