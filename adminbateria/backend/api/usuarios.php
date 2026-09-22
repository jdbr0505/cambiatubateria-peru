<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_auth();          // GET también: lista administradores
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Ensure table exists (compatible with BDbateria.sql)
$pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(120) DEFAULT NULL,
  email VARCHAR(160) DEFAULT NULL,
  rol VARCHAR(32) DEFAULT 'admin',
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

function map_user_row($r){
  return [
    'id' => (int)$r['id'],
    'username' => $r['username'],
    'nombre' => $r['nombre'],
    'email' => $r['email'],
    'rol' => $r['rol'],
    'activo' => (int)$r['activo'] === 1,
    'created_at' => $r['created_at'] ?? null,
    'updated_at' => $r['updated_at'] ?? null,
  ];
}

if ($method === 'GET'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if ($id){
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) send_json(['error'=>'No encontrado'], 404);
    send_json(['user'=> map_user_row($r)]);
  }
  $rows = $pdo->query('SELECT * FROM usuarios ORDER BY id DESC')->fetchAll();
  send_json(['users' => array_map('map_user_row', $rows)]);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'POST'){
  if (!is_array($body)) send_json(['error'=>'JSON inválido'], 400);
  $username = trim((string)($body['username'] ?? ''));
  $password = (string)($body['password'] ?? '');
  $nombre = isset($body['nombre']) ? trim((string)$body['nombre']) : null;
  $email = isset($body['email']) ? trim((string)$body['email']) : null;
  $rol = isset($body['rol']) ? trim((string)$body['rol']) : 'admin';
  $activo = isset($body['activo']) ? (int)!!$body['activo'] : 1;
  if ($username === '' || $password === '') send_json(['error'=>'username y password requeridos'], 422);
  try{
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $st = $pdo->prepare('INSERT INTO usuarios (username, password_hash, nombre, email, rol, activo) VALUES (?,?,?,?,?,?)');
    $st->execute([$username, $hash, $nombre, $email, $rol, $activo]);
    $id = (int)$pdo->lastInsertId();
    $r = $pdo->query('SELECT * FROM usuarios WHERE id='.(int)$id)->fetch();
    send_json(['user'=> map_user_row($r)], 201);
  }catch(Throwable $e){
    if (strpos($e->getMessage(), 'Duplicate') !== false) send_json(['error'=>'username ya existe'], 409);
    send_json(['error'=>$e->getMessage()], 500);
  }
}

if ($method === 'PUT'){
  if (!is_array($body)) send_json(['error'=>'JSON inválido'], 400);
  $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);
  if (!$id) send_json(['error'=>'id requerido'], 400);
  // Build dynamic update
  $fields = [];
  $params = [];
  if (array_key_exists('username', $body)){ $fields[] = 'username = ?'; $params[] = trim((string)$body['username']); }
  if (array_key_exists('nombre', $body)){ $fields[] = 'nombre = ?'; $params[] = $body['nombre'] !== null ? trim((string)$body['nombre']) : null; }
  if (array_key_exists('email', $body)){ $fields[] = 'email = ?'; $params[] = $body['email'] !== null ? trim((string)$body['email']) : null; }
  if (array_key_exists('rol', $body)){ $fields[] = 'rol = ?'; $params[] = trim((string)$body['rol'] ?? 'admin'); }
  if (array_key_exists('activo', $body)){ $fields[] = 'activo = ?'; $params[] = (int)!!$body['activo']; }
  // Optional password change: new_password
  if (!empty($body['new_password'])){
    $fields[] = 'password_hash = ?';
    $params[] = password_hash((string)$body['new_password'], PASSWORD_BCRYPT);
  }
  if (empty($fields)) send_json(['error'=>'Nada para actualizar'], 400);
  $params[] = $id;
  try{
    $sql = 'UPDATE usuarios SET '.implode(', ', $fields).' WHERE id = ?';
    $st = $pdo->prepare($sql); $st->execute($params);
    $r = $pdo->query('SELECT * FROM usuarios WHERE id='.(int)$id)->fetch();
    if (!$r) send_json(['error'=>'No encontrado'], 404);
    send_json(['user'=> map_user_row($r)]);
  }catch(Throwable $e){
    if (strpos($e->getMessage(), 'Duplicate') !== false) send_json(['error'=>'username ya existe'], 409);
    send_json(['error'=>$e->getMessage()], 500);
  }
}

if ($method === 'DELETE'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);
  if (!$id) send_json(['error'=>'id requerido'], 400);
  $st = $pdo->prepare('DELETE FROM usuarios WHERE id = ?');
  $st->execute([$id]);
  if ($st->rowCount() === 0) send_json(['error'=>'No encontrado'], 404);
  send_json(['success'=>true]);
}

send_json(['error'=>'Método no permitido'], 405);
