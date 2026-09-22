<?php
/**
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de servicios.html (servicios-config.js). Mismo patrón que
 * pagina_fotos.php: intenta la BD y cae al JSON local si no hay conexión.
 *
 * Bug real que corrige esta reescritura: la versión anterior tenía
 * require_write_access() en TODOS los métodos, incluido GET — un visitante
 * normal recibía 401 al pedirlo, así que era imposible de usar desde el
 * sitio público tal como estaba.
 *
 * Esquema reducido a título+descripción de los 6 servicios reales, por
 * slug fijo — no una lista libre. El campo "icon" (palabra clave) de la
 * versión anterior no tiene dónde aplicarse: cada card del sitio real usa
 * un SVG completo distinto, no intercambiable por palabra clave.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_servicios_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM pagina_servicios LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_servicios_available()) {
  $pdo = get_pdo();
  $rows = $pdo->query('SELECT slug, titulo, descripcion FROM pagina_servicios')->fetchAll();
  $items = [];
  foreach ($rows as $r) {
    $items[$r['slug']] = ['title' => $r['titulo'], 'description' => $r['descripcion']];
  }
  send_json(['items' => $items]);
}

$dataFile = __DIR__ . '/../data/services.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  send_json(['items' => is_array($data) ? $data : []]);
}

send_json(['items' => []]);
