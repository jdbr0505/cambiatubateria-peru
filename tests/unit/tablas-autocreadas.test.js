/**
 * Verifica que los endpoints del panel que consultan una tabla directamente la
 * creen si falta.
 *
 * Esta prueba nace de un fallo en producción. `adminbateria/backend/lib/db.php`
 * expone `db(): PDO` y lanza a propósito cuando la conexión falla; los endpoints
 * que la usan no capturan. Si además la tabla no existe, la PDOException sube sin
 * capturar y el endpoint responde 500 con el cuerpo vacío.
 *
 * Eso le pasó a `contacto.php`: la tabla `contacto_info` estaba en BDbateria.sql
 * pero nunca se creó en la base de producción, así que el endpoint devolvía
 * SQLSTATE[42S02] mientras el resto del panel funcionaba. El equivalente público
 * sobrevivía porque cae a JSON; el del panel no tiene respaldo.
 *
 * El repositorio ya resolvía esto en `usuarios.php`, `login.php` y `sitio.php`
 * con `CREATE TABLE IF NOT EXISTS`. La prueba fija esa convención para que no se
 * vuelva a olvidar en un endpoint nuevo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR_API = 'adminbateria/backend/api';

/** Endpoints que sabemos que dependen de una tabla propia de configuración. */
const CON_TABLA_PROPIA = ['contacto.php', 'usuarios.php'];

/** Código sin comentarios: un CREATE TABLE citado en un comentario no cuenta. */
function soloCodigo(ruta) {
  return readFileSync(ruta, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('endpoints del panel que dependen de una tabla propia', () => {
  for (const archivo of CON_TABLA_PROPIA) {
    test(`${archivo} crea su tabla si falta`, () => {
      assert.match(
        soloCodigo(join(DIR_API, archivo)),
        /CREATE TABLE IF NOT EXISTS/i,
        `${archivo} consulta una tabla sin garantizar que exista. db() lanza y el endpoint ` +
          'no captura, así que una tabla ausente devuelve 500 con cuerpo vacío en vez de datos'
      );
    });
  }

  test('contacto.php garantiza la fila id=1 que lee y actualiza', () => {
    const src = soloCodigo(join(DIR_API, 'contacto.php'));
    assert.match(
      src,
      /INSERT INTO contacto_info[\s\S]*ON DUPLICATE KEY UPDATE/i,
      'GET lee y PUT actualiza WHERE id=1: sin esa fila el guardado no afecta ninguna fila y falla en silencio'
    );
  });

  test('ningún CREATE TABLE del panel omite IF NOT EXISTS', () => {
    const infractores = [];
    for (const archivo of readdirSync(DIR_API).filter((f) => f.endsWith('.php'))) {
      const src = soloCodigo(join(DIR_API, archivo));
      for (const [linea] of src.matchAll(/CREATE TABLE(?!\s+IF NOT EXISTS)/gi)) {
        infractores.push(`${archivo}: ${linea}`);
      }
    }
    assert.deepEqual(
      infractores,
      [],
      `un CREATE TABLE sin IF NOT EXISTS falla en la segunda petición: ${infractores.join(', ')}`
    );
  });
});
