<?php
/**
 * El negocio despacha desde una central, no tiene agentes por marca de auto
 * (whatsapp_agentes era el esquema de una demo de otro rubro). Un solo
 * número — mismo dato que ~80 links tel:/wa.me del sitio público leen vía
 * pagbateria/backend/api/whatsapp.php + whatsapp-config.js.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pdo->exec('CREATE TABLE IF NOT EXISTS whatsapp_config (
  id INT UNSIGNED PRIMARY KEY,
  numero VARCHAR(20) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

if ($method === 'GET') {
  $fila = $pdo->query('SELECT numero FROM whatsapp_config WHERE id = 1')->fetch();
  send_json(['numero' => $fila['numero'] ?? null]);
}

if ($method === 'PUT') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) {
    send_json(['error' => 'JSON inválido'], 400);
  }

  $numero = preg_replace('/\D/', '', (string)($body['numero'] ?? ''));
  if (!preg_match('/^\d{9,11}$/', $numero)) {
    send_json(['error' => 'Número inválido — usa solo dígitos, sin +, con código de país (ej. 51936956877)'], 422);
  }

  $stmt = $pdo->prepare(
    'INSERT INTO whatsapp_config (id, numero) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE numero = VALUES(numero)'
  );
  $stmt->execute([$numero]);
  send_json(['success' => true, 'numero' => $numero]);
}

send_json(['error' => 'Método no permitido'], 405);
