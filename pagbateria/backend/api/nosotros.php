<?php
/**
 * Endpoint público de la página Nosotros — sin sesión (bug ya corregido en
 * sitio/whatsapp/servicios/hero: exigir sesión en GET deja el endpoint
 * inutilizable desde el sitio real, que lo llama sin login).
 *
 * pagina_nosotros: fila única (id=1) con los títulos y bajadas de las 2
 * cabeceras reales de nosotros.html (portada, "El equipo"). La cita
 * editorial y "Cómo trabajamos" se quitaron de la página (redundante con
 * Servicios) — trabajo_titulo/trabajo_bajada/cita_texto y
 * pagina_nosotros_cards ya no se leen acá, aunque sigan existiendo en la
 * base de datos de instalaciones viejas.
 */

require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$dataFile = __DIR__ . '/../data/nosotros.json';

function nosotros_row_to_json($row) {
  return [
    'heroTitulo'   => $row['hero_titulo']   ?? null,
    'heroBajada'   => $row['hero_bajada']   ?? null,
    'equipoTitulo' => $row['equipo_titulo'] ?? null,
    'equipoBajada' => $row['equipo_bajada'] ?? null,
  ];
}

function db_nosotros_available() {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM pagina_nosotros LIMIT 1');
    return true;
  } catch (Throwable $e) { return false; }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

if (db_nosotros_available()) {
  $pdo = get_pdo();
  $row = $pdo->query('SELECT * FROM pagina_nosotros WHERE id = 1')->fetch() ?: [];
  send_json(nosotros_row_to_json($row));
}

$raw = @file_get_contents($dataFile) ?: '{}';
$json = json_decode($raw, true);
send_json(is_array($json) ? $json : []);
