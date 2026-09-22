/**
 * Verificación estática de la subida de archivos.
 *
 * PHP no está instalado en el entorno de desarrollo, así que estas pruebas
 * analizan el código fuente. El equivalente dinámico vive en
 * tests/e2e/upload-security.spec.js y corre contra un servidor PHP real.
 *
 * Las tres vías de ataque que se cierran aquí:
 *   1. SVG con <script> → XSS almacenado en el dominio del negocio
 *   2. PHP renombrado a .png → ejecución remota si el servidor lo interpreta
 *   3. Nombre de archivo controlado por el atacante → traversal y doble extensión
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const UPLOADS = [
  'pagbateria/backend/api/upload.php',
  'adminbateria/backend/api/upload.php',
];

/** @param {string} path */
function leer(path) {
  assert.ok(existsSync(path), `no existe ${path}`);
  return readFileSync(path, 'utf8');
}

/** Quita comentarios para no evaluar texto explicativo como si fuera código. */
function soloCodigo(src) {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#');
    })
    .join('\n');
}

for (const ruta of UPLOADS) {
  describe(`${ruta} — tipos permitidos`, () => {
    test('no acepta SVG', () => {
      const codigo = soloCodigo(leer(ruta));
      // Un SVG es XML ejecutable. Servido desde el mismo dominio puede llevar
      // <script> y robar la sesión del administrador que lo visualice.
      assert.ok(
        !/['"]svg['"]/.test(codigo),
        'svg no debe figurar en la lista de extensiones permitidas'
      );
    });

    test('mantiene los formatos de imagen legítimos', () => {
      const codigo = soloCodigo(leer(ruta));
      for (const ext of ['png', 'jpg', 'webp']) {
        assert.ok(
          new RegExp(`['"]${ext}['"]`).test(codigo),
          `${ext} debe seguir permitido: el panel sube logos y fotos de producto`
        );
      }
    });
  });

  describe(`${ruta} — validación por contenido`, () => {
    test('comprueba el MIME real del archivo, no el que envía el cliente', () => {
      const codigo = soloCodigo(leer(ruta));
      // $_FILES['x']['type'] lo controla quien sube: es falsificable.
      assert.ok(
        /finfo_file\s*\(|mime_content_type\s*\(/.test(codigo),
        'debe deducir el MIME del contenido con finfo_file o mime_content_type'
      );
    });

    test('verifica que el archivo sea una imagen real', () => {
      const codigo = soloCodigo(leer(ruta));
      // getimagesize falla en cualquier cosa que no sea imagen, incluido un
      // .php renombrado a .png.
      assert.ok(
        /getimagesize\s*\(/.test(codigo),
        'debe usar getimagesize para descartar archivos que no son imágenes'
      );
    });

    test('no confía en el campo type que envía el navegador', () => {
      const codigo = soloCodigo(leer(ruta));
      assert.ok(
        !/\$up\['type'\]|\$_FILES\[[^\]]+\]\['type'\]/.test(codigo),
        'el campo type del cliente es falsificable y no debe usarse para validar'
      );
    });
  });

  describe(`${ruta} — nombre del archivo`, () => {
    test('el servidor genera el nombre, no el cliente', () => {
      const codigo = soloCodigo(leer(ruta));
      // El nombre original permite '../' (traversal) y 'shell.php.png'
      // (doble extensión). Un nombre aleatorio elimina ambas.
      assert.ok(
        /random_bytes\s*\(|bin2hex\s*\(|uniqid\s*\(/.test(codigo),
        'el nombre destino debe generarse en el servidor'
      );
    });

    test('no usa el nombre enviado por el usuario para construir la ruta', () => {
      const codigo = soloCodigo(leer(ruta));
      assert.ok(
        !/\$_POST\['nombre'\]/.test(codigo),
        'un nombre elegido por el cliente reabre traversal y doble extensión'
      );
    });

    test('move_uploaded_file usa la misma variable que se generó como destino', () => {
      // Bug real detectado en adminbateria/backend/api/upload.php: la ruta
      // final se guardaba en $final pero move_uploaded_file() recibía $dest,
      // una variable nunca definida — cada subida fallaba con 500.
      const codigo = soloCodigo(leer(ruta));
      const generado = codigo.match(/(\$\w+)\s*=\s*\$targetDir\s*\./);
      assert.ok(generado, 'debe generarse una variable con la ruta de destino final');
      const [, variable] = generado;
      const nombreEscapado = variable.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp(
        'move_uploaded_file\\s*\\([^,]+,\\s*\\$' + nombreEscapado + '\\)'
      );
      assert.ok(
        patron.test(codigo),
        `move_uploaded_file debe recibir ${variable}, la misma variable que se generó como destino`
      );
    });
  });

  describe(`${ruta} — límites`, () => {
    test('el tamaño máximo no supera 5 MB', () => {
      const codigo = soloCodigo(leer(ruta));
      const match = codigo.match(/maxSize\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
      assert.ok(match, 'debe declararse un tamaño máximo explícito');
      assert.ok(
        Number(match[1]) <= 5,
        `el máximo es ${match[1]} MB; 5 MB basta para un logo o foto de producto`
      );
    });

    test('exige sesión antes de escribir en disco', () => {
      const codigo = soloCodigo(leer(ruta));
      assert.ok(
        /require_write_access\s*\(\)|require_auth\s*\(\)/.test(codigo),
        'subir archivos es una escritura: exige autenticación'
      );
    });
  });
}

describe('Carpetas de subida — defensa en profundidad', () => {
  test('las carpetas de imágenes bloquean la ejecución de PHP', () => {
    const guardas = [
      'pagbateria/public/assets/img/.htaccess',
      'adminbateria/assets/.htaccess',
    ];
    const existentes = guardas.filter((g) => existsSync(g));

    assert.ok(
      existentes.length > 0,
      'debe existir un .htaccess que apague el motor PHP en las carpetas de subida'
    );

    for (const g of existentes) {
      const src = readFileSync(g, 'utf8');
      assert.ok(
        /php_flag\s+engine\s+off|SetHandler\s+None|Require\s+all\s+denied/i.test(src),
        `${g} debe impedir la ejecución de scripts subidos`
      );
    }
  });
});
