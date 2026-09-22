<?php
/**
 * Lectura pública del correo de contacto. La pestaña "Ubicación" del panel
 * (adminbateria/backend/api/contacto.php, tabla contacto_info) hasta ahora
 * no tenía ningún consumidor en el sitio público — el jefe editaba el correo
 * ahí y no pasaba nada en la página real. Este endpoint solo expone `email`:
 * dirección/horario/RUC siguen sin usarse en el sitio, fuera de alcance de
 * este cambio (ver la nota "Pendiente decidir" en docs/HANDOFF.md).
 *
 * Público, solo lectura, sin sesión. Mismo patrón que hero.php/cabeceras.php:
 * intenta la BD y cae al JSON local si no hay conexión.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function contacto_email_desde_bd(): ?string {
  $pdo = get_pdo();
  if (!$pdo) return null;
  try {
    $row = $pdo->query('SELECT email FROM contacto_info WHERE id = 1')->fetch();
    $email = $row['email'] ?? null;
    return is_string($email) && $email !== '' ? $email : null;
  } catch (Throwable $e) {
    return null;
  }
}

$email = contacto_email_desde_bd();
if ($email === null) {
  $dataFile = __DIR__ . '/../data/contacto.json';
  if (file_exists($dataFile)) {
    $raw = @file_get_contents($dataFile);
    $data = json_decode($raw ?: 'null', true);
    $desdeJson = $data['values']['email'] ?? null;
    if (is_string($desdeJson) && $desdeJson !== '') $email = $desdeJson;
  }
}

send_json(['email' => $email]);
