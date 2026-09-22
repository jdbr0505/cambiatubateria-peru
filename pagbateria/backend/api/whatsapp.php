<?php
/**
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de página (whatsapp-config.js). Mismo patrón que pagina_fotos.php:
 * intenta la BD y cae al JSON local si no hay conexión, en vez de responder
 * 500 o dejar el sitio sin número de contacto.
 *
 * Esquema deliberadamente reducido a un solo número: el negocio despacha
 * técnicos desde una central, no tiene un roster de vendedores por marca de
 * auto — ese esquema más elaborado era de una demo de otro rubro y nunca
 * correspondió a este negocio.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_whatsapp_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM whatsapp_config LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_whatsapp_available()) {
  $pdo = get_pdo();
  $fila = $pdo->query('SELECT numero FROM whatsapp_config WHERE id = 1')->fetch();
  if ($fila && $fila['numero']) {
    send_json(['numero' => $fila['numero']]);
  }
  // Tabla creada pero sin fila todavía (instalación nueva): cae al JSON,
  // igual que si la BD no respondiera — nunca un número vacío al visitante.
}

$dataFile = __DIR__ . '/../data/whatsapp.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  if (is_array($data) && !empty($data['numero'])) {
    send_json(['numero' => $data['numero']]);
  }
}

send_json(['numero' => null]);
