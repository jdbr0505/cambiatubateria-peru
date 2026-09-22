<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Ensure table exists (compatible with BDbateria.sql)
// La tabla no existia en la base de produccion y db() lanza sin capturar, asi
// que este endpoint devolvia 500 (SQLSTATE[42S02]) mientras el resto del panel
// funcionaba. Mismo patron que usuarios.php, login.php y sitio.php.
$pdo->exec("CREATE TABLE IF NOT EXISTS contacto_info (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  direccion VARCHAR(255) DEFAULT NULL,
  map_url VARCHAR(255) DEFAULT NULL,
  telefono VARCHAR(60) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  horario_weekdays VARCHAR(120) DEFAULT NULL,
  horario_sabado VARCHAR(120) DEFAULT NULL,
  horario_domingo VARCHAR(120) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// GET lee y PUT actualiza siempre la fila id=1. Sin ella, el PUT no afectaria
// ninguna fila y el guardado fallaria en silencio.
$pdo->exec("INSERT INTO contacto_info (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");

if ($method === 'GET'){
  $row = $pdo->query('SELECT * FROM contacto_info WHERE id=1')->fetch();
  if (!$row){ send_json([]); }
  $out = [
    'address' => $row['direccion'],
    'mapUrl' => $row['map_url'],
    'phone' => $row['telefono'],
    'email' => $row['email'],
    'schedule' => [
      'weekdays' => $row['horario_weekdays'],
      'saturday' => $row['horario_sabado'],
      'sunday' => $row['horario_domingo']
    ]
  ];
  send_json($out);
}

if ($method === 'PUT'){
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $s = $body['schedule'] ?? [];
  $stmt = $pdo->prepare('UPDATE contacto_info SET direccion=?, map_url=?, telefono=?, email=?, horario_weekdays=?, horario_sabado=?, horario_domingo=? WHERE id=1');
  $stmt->execute([
    $body['address'] ?? null,
    $body['mapUrl'] ?? null,
    $body['phone'] ?? null,
    $body['email'] ?? null,
    $s['weekdays'] ?? null,
    $s['saturday'] ?? null,
    $s['sunday'] ?? null,
  ]);
  send_json(['success' => true]);
}

send_json(['error' => 'Método no permitido'], 405);
