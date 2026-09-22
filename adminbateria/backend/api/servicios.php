<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * Slots fijos, uno por cada <article data-servicio-slug="..."> que existe
 * hoy en servicios.html. No son filas libres: el admin edita el título y la
 * descripción de un servicio que ya está en el HTML (con su propio ícono
 * SVG fijo), no crea servicios nuevos — eso requeriría tocar código de
 * todas formas. Mismo patrón que pagina_fotos.php.
 */
const SLOTS = ['auxilio', 'instalacion', 'diagnostico', 'bms', 'reciclaje', 'flotas'];

function ensure_pagina_servicios_table(PDO $pdo): void {
  $pdo->exec('CREATE TABLE IF NOT EXISTS pagina_servicios (
    slug VARCHAR(32) PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function list_pagina_servicios(PDO $pdo): void {
  // Base: los 6 servicios por defecto que el sitio ya muestra (services.json).
  // Encima, lo que el admin haya editado en la tabla. Así la pestaña nunca
  // sale vacía en una BD recién desplegada: enseña el texto vigente de cada
  // servicio y se edita desde ahí. Antes solo leía la tabla (vacía al inicio).
  $items = [];
  $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/services.json') ?: 'null', true);
  if (is_array($def)) {
    foreach ($def as $slug => $v) {
      if (in_array($slug, SLOTS, true) && is_array($v)) {
        $items[$slug] = ['title' => $v['title'] ?? '', 'description' => $v['description'] ?? null];
      }
    }
  }

  $rows = $pdo->query('SELECT slug, titulo, descripcion FROM pagina_servicios')->fetchAll();
  foreach ($rows as $r) {
    $items[$r['slug']] = ['title' => $r['titulo'], 'description' => $r['descripcion']];
  }
  send_json(['items' => $items]);
}

ensure_pagina_servicios_table($pdo);

if ($method === 'GET') {
  list_pagina_servicios($pdo);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'PUT' || $method === 'POST') {
  $slug = trim((string)($body['slug'] ?? ''));
  $title = trim((string)($body['title'] ?? ''));
  $description = isset($body['description']) ? trim((string)$body['description']) : null;

  if (!in_array($slug, SLOTS, true)) {
    send_json(['error' => 'slug inválido. Debe ser uno de: ' . implode(', ', SLOTS)], 422);
  }
  if ($title === '') {
    send_json(['error' => 'title requerido'], 422);
  }

  $stmt = $pdo->prepare(
    'INSERT INTO pagina_servicios (slug, titulo, descripcion) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), descripcion = VALUES(descripcion)'
  );
  $stmt->execute([$slug, $title, $description]);
  list_pagina_servicios($pdo);
}

send_json(['error' => 'Método no permitido'], 405);
