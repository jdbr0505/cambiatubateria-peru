<?php
/**
 * Lista pública de asesores de WhatsApp (solo los activos) para el popover
 * del botón flotante — ver adminbateria/backend/api/whatsapp_asesores.php
 * para el porqué de esta lista y por qué NO es el viejo roster de agentes
 * por marca de auto (demo de otro rubro, ya removida en 73a7b44).
 *
 * Público, solo lectura, sin sesión. Con 0 o 1 asesores activos, el sitio
 * público no muestra el selector — el botón flotante sigue siendo un link
 * directo (whatsapp-asesores.js decide eso, no este endpoint).
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_asesores_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM whatsapp_asesores LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_asesores_available()) {
  $pdo = get_pdo();
  $rows = $pdo->query(
    'SELECT nombre, rol, numero FROM whatsapp_asesores WHERE activo = 1 ORDER BY orden, id'
  )->fetchAll();
  send_json(['asesores' => $rows]);
}

// Respaldo sin BD: por defecto, ninguno — el negocio no configuró nada
// todavía, así que el botón flotante se comporta como siempre (link directo
// al número único de whatsapp.json).
$dataFile = __DIR__ . '/../data/whatsapp_asesores.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  send_json(['asesores' => is_array($data['asesores'] ?? null) ? $data['asesores'] : []]);
}

send_json(['asesores' => []]);
