<?php
/**
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de página (pagina-fotos.js). Mismo patrón que brands.php: intenta la
 * BD y cae al JSON local si no hay conexión, en vez de responder 500.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_fotos_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM pagina_fotos LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_fotos_available()) {
  $pdo = get_pdo();
  $rows = $pdo->query('SELECT slug, path, alt FROM pagina_fotos')->fetchAll();
  $items = [];
  foreach ($rows as $r) {
    $items[$r['slug']] = ['path' => $r['path'], 'alt' => $r['alt']];
  }
  send_json(['items' => $items]);
}

// Respaldo: exactamente las fotos que ya están horneadas en el HTML estático
// hoy. Si la BD no responde, el JS las vuelve a poner en el mismo sitio — un
// reemplazo sin efecto visible, no una foto rota.
$dataFile = __DIR__ . '/../data/pagina_fotos.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  send_json(['items' => is_array($data) ? $data : []]);
}

send_json(['items' => []]);
