<?php
/**
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de index.html (hero-config.js). Mismo patrón que servicios.php:
 * intenta la BD y cae al JSON local si no hay conexión.
 *
 * Bug real que corrige esta reescritura: la versión anterior tenía
 * require_write_access() en TODOS los métodos, incluido GET — 401 a
 * cualquier visitante.
 *
 * Esquema reducido a 3 campos: badge, título, bajada. Antes tenía también
 * ctaTexto/ctaSubtexto (la etiqueta del botón de GPS) y catalogoTexto (el
 * botón "Ver todo el catálogo") — ambos botones se quitaron del home (GPS:
 * WhatsApp pasa a ser 100% el canal; catálogo: lo reemplazó el buscador
 * horizontal), así que esos campos quedaban editando algo que ya no existe.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_hero_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM pagina_hero LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

function hero_row_to_json($fila) {
  return [
    'badge' => $fila['badge'] ?? null,
    'titulo' => $fila['titulo'] ?? null,
    'bajada' => $fila['bajada'] ?? null,
  ];
}

if (db_hero_available()) {
  $pdo = get_pdo();
  $fila = $pdo->query('SELECT badge, titulo, bajada FROM pagina_hero WHERE id = 1')->fetch();
  if ($fila) {
    send_json(hero_row_to_json($fila));
  }
}

$dataFile = __DIR__ . '/../data/hero.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  if (is_array($data)) {
    send_json(hero_row_to_json([
      'badge' => $data['badge'] ?? null,
      'titulo' => $data['titulo'] ?? null,
      'bajada' => $data['bajada'] ?? null,
    ]));
  }
}

send_json(hero_row_to_json([]));
