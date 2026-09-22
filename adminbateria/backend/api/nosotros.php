<?php
/**
 * Panel admin — pestaña Nosotros. nosotros.html tiene 2 secciones: portada
 * (H1 + bajada) y "El equipo" (título + bajada, la descripción del
 * negocio). La cita editorial y "Cómo trabajamos" se quitaron de la página
 * (redundantes con Servicios) — trabajo_titulo/trabajo_bajada/cita_texto y
 * pagina_nosotros_cards se dejan de leer/escribir acá, pero la columna y la
 * tabla NO se borran de la base de datos (podían tener datos guardados;
 * lo seguro es dejar de usarlas, no un DROP).
 */

require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();

$pdo = db();

$pdo->exec("CREATE TABLE IF NOT EXISTS pagina_nosotros (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  hero_titulo VARCHAR(200) NULL,
  hero_bajada TEXT NULL,
  equipo_titulo VARCHAR(200) NULL,
  equipo_bajada TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/**
 * Instalaciones existentes ya tenían la tabla con las bajadas en
 * VARCHAR(400) — el jefe pidió poder pegar texto largo (varios párrafos) y
 * ese límite lo cortaba a mitad de frase. MODIFY es idempotente (no falla
 * si ya es TEXT), así que corre siempre, mismo costo aceptado que
 * ensure_orden_column en marcas.php.
 */
function nosotros_asegurar_columnas_texto_largo(PDO $pdo): void {
  try {
    $pdo->exec('ALTER TABLE pagina_nosotros MODIFY hero_bajada TEXT NULL');
    $pdo->exec('ALTER TABLE pagina_nosotros MODIFY equipo_bajada TEXT NULL');
  } catch (Throwable $e) {
    // Si no se puede alterar, la consulta de abajo da su propio error claro;
    // no se traga nada crítico en silencio.
  }
}
nosotros_asegurar_columnas_texto_largo($pdo);

/**
 * Valores por defecto que el sitio público ya muestra (nosotros.json). El
 * panel los usa como base para no salir vacío en una BD recién desplegada:
 * cada campo que nadie guardó todavía se rellena con su valor vivo, y lo
 * que sí está en la tabla lo pisa. Antes solo leía la tabla — vacía al
 * principio — así que el administrador veía un formulario en blanco aunque
 * la página real tuviera contenido.
 */
function nosotros_defaults(): array {
  $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/nosotros.json') ?: 'null', true);
  return is_array($def) ? $def : [];
}

function nosotros_row_to_json($row, array $def = []) {
  return [
    'heroTitulo'   => $row['hero_titulo']   ?? $def['heroTitulo']   ?? null,
    'heroBajada'   => $row['hero_bajada']   ?? $def['heroBajada']   ?? null,
    'equipoTitulo' => $row['equipo_titulo'] ?? $def['equipoTitulo'] ?? null,
    'equipoBajada' => $row['equipo_bajada'] ?? $def['equipoBajada'] ?? null,
  ];
}

function nosotros_leer(PDO $pdo) {
  $row = $pdo->query('SELECT * FROM pagina_nosotros WHERE id = 1')->fetch() ?: [];
  return nosotros_row_to_json($row, nosotros_defaults());
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  send_json(nosotros_leer($pdo));
}

if ($method === 'PUT' || $method === 'POST') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);

  $pdo->exec("INSERT INTO pagina_nosotros (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");
  $cur = $pdo->query('SELECT * FROM pagina_nosotros WHERE id = 1')->fetch();

  $valor = function ($campoJson, $campoDb) use ($body, $cur) {
    if (!array_key_exists($campoJson, $body)) return $cur[$campoDb] ?? null;
    $v = trim((string)$body[$campoJson]);
    return $v === '' ? null : $v;
  };

  $stmt = $pdo->prepare('UPDATE pagina_nosotros SET
    hero_titulo = ?, hero_bajada = ?,
    equipo_titulo = ?, equipo_bajada = ?
    WHERE id = 1');
  $stmt->execute([
    $valor('heroTitulo', 'hero_titulo'), $valor('heroBajada', 'hero_bajada'),
    $valor('equipoTitulo', 'equipo_titulo'), $valor('equipoBajada', 'equipo_bajada'),
  ]);

  send_json(nosotros_leer($pdo));
}

send_json(['error' => 'Método no permitido'], 405);
