<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * Slots fijos, uno por cada <img data-foto-slug="..."> que existe hoy en el
 * sitio público. No son filas libres: el admin reemplaza la foto de un slot
 * que ya está en el HTML, no crea slots nuevos — eso requeriría tocar código
 * de todas formas.
 */
const SLOTS = ['hero', 'catalogo', 'servicios', 'cobertura', 'nosotros', 'contacto'];

function ensure_pagina_fotos_table(PDO $pdo): void {
  $pdo->exec('CREATE TABLE IF NOT EXISTS pagina_fotos (
    slug VARCHAR(64) PRIMARY KEY,
    path VARCHAR(512) NOT NULL,
    alt VARCHAR(255) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function list_pagina_fotos(PDO $pdo): void {
  // Base: las fotos por defecto que el sitio público ya muestra
  // (pagina_fotos.json). Encima, lo que el admin haya resubido en la tabla.
  // Así el panel nunca sale con previews vacíos: enseña la foto vigente de
  // cada slot aunque nadie la haya reemplazado, y se edita desde ahí. Antes
  // solo leía la tabla, que en una BD recién desplegada está vacía.
  $items = [];
  $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/pagina_fotos.json') ?: 'null', true);
  if (is_array($def)) {
    foreach ($def as $slug => $v) {
      if (in_array($slug, SLOTS, true) && is_array($v)) {
        $items[$slug] = ['path' => $v['path'] ?? '', 'alt' => $v['alt'] ?? null];
      }
    }
  }

  $rows = $pdo->query('SELECT slug, path, alt FROM pagina_fotos')->fetchAll();
  foreach ($rows as $r) {
    $items[$r['slug']] = ['path' => $r['path'], 'alt' => $r['alt']];
  }
  send_json(['items' => $items]);
}

ensure_pagina_fotos_table($pdo);

if ($method === 'GET') {
  list_pagina_fotos($pdo);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'PUT' || $method === 'POST') {
  $slug = trim((string)($body['slug'] ?? ''));
  $path = trim((string)($body['path'] ?? ''));
  $alt = isset($body['alt']) ? trim((string)$body['alt']) : null;

  if (!in_array($slug, SLOTS, true)) {
    send_json(['error' => 'slug inválido. Debe ser uno de: ' . implode(', ', SLOTS)], 422);
  }
  if ($path === '') {
    send_json(['error' => 'path requerido'], 422);
  }

  $stmt = $pdo->prepare(
    'INSERT INTO pagina_fotos (slug, path, alt) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE path = VALUES(path), alt = VALUES(alt)'
  );
  $stmt->execute([$slug, $path, $alt]);
  list_pagina_fotos($pdo);
}

send_json(['error' => 'Método no permitido'], 405);
