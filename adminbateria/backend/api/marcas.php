<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * La tabla `marcas` es esquema base (viene de BDbateria.sql), pero la columna
 * `orden` se agregó después: una BD creada antes no la tiene, y sin ella
 * TODO en esta pestaña rompe — el SELECT con COALESCE(orden) y el UPDATE del
 * reordenamiento fallan con "Unknown column 'orden'". Se asegura una vez, de
 * forma idempotente (mismo patrón de auto-creación que hero/fotos/servicios).
 * MySQL no soporta ADD COLUMN IF NOT EXISTS, así que se consulta primero.
 */
function ensure_orden_column(PDO $pdo){
  try {
    $has = $pdo->query(
      "SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'marcas' AND column_name = 'orden'"
    )->fetch();
    if ((int)($has['c'] ?? 0) === 0) {
      $pdo->exec('ALTER TABLE marcas ADD COLUMN orden INT DEFAULT 0');
    }
  } catch (Throwable $e) {
    // Si no se puede inspeccionar/alterar, las consultas de abajo darán su
    // propio error claro; no se traga nada crítico en silencio.
  }
}

ensure_orden_column($pdo);

function list_brands(PDO $pdo){
  // Intentar incluir columna 'orden' si existe; si no, caerá igual
  $rows = $pdo->query('SELECT nombre, logo_path, COALESCE(orden, 0) AS orden FROM marcas ORDER BY COALESCE(orden,0), nombre')->fetchAll();
  $names = array_map(fn($r) => $r["nombre"], $rows);
  send_json(['brands' => $names, 'rows' => $rows]);
}

if ($method === 'GET'){
  return list_brands($pdo);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'POST'){
  $name = trim($body['name'] ?? '');
  $logo = isset($body['logo_path']) ? trim($body['logo_path']) : null;
  if ($name === '') send_json(['error' => 'name requerido'], 422);
  $stmt = $pdo->prepare('INSERT INTO marcas (nombre, logo_path) VALUES (?, ?)');
  try{
    $stmt->execute([$name, $logo]);
  } catch (Throwable $e){
    // Si existe, intentamos actualizar logo
    $pdo->prepare('UPDATE marcas SET logo_path = COALESCE(?, logo_path) WHERE nombre = ?')->execute([$logo, $name]);
  }
  return list_brands($pdo);
}

if ($method === 'PUT'){
  // Dos modos: rename por old/new, o update por id
  $old = trim($body['old'] ?? '');
  $new = trim($body['new'] ?? '');
  // Modo: actualizar orden en bloque
  if (isset($body['order']) && is_array($body['order'])){
    $pdo->beginTransaction();
    try{
      $upd = $pdo->prepare('UPDATE marcas SET orden = ? WHERE nombre = ?');
      foreach ($body['order'] as $o){
        $ord = isset($o['order']) ? (int)$o['order'] : (int)($o['orden'] ?? 0);
        $nam = (string)($o['name'] ?? $o['nombre'] ?? '');
        if ($nam !== ''){ $upd->execute([$ord, $nam]); }
      }
      $pdo->commit();
      return list_brands($pdo);
    }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
  }
  if ($old !== '' && $new !== ''){
    $stmt = $pdo->prepare('UPDATE marcas SET nombre = ? WHERE nombre = ?');
    $ok = $stmt->execute([$new, $old]);
    if (!$ok || $stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
    return list_brands($pdo);
  }
  $id = (int)($body['id'] ?? 0);

  // Modo normal: intentar eliminar y capturar violación de FK
  try{
    if ($id){
      $stmt = $pdo->prepare('DELETE FROM marcas WHERE id = ?');
      $stmt->execute([$id]);
    } else {
      $stmt = $pdo->prepare('DELETE FROM marcas WHERE nombre = ?');
      $stmt->execute([$name]);
    }
    if ($stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
    return list_brands($pdo);
  }catch(Throwable $e){
    $msg = $e->getMessage();
    if (strpos($msg, '1451') !== false || strpos($msg, 'foreign key') !== false){
      send_json([
        'error' => 'No se puede eliminar la marca porque tiene productos asociados. Elimina o reasigna esos productos antes de eliminar la marca.',
        'code' => 'FK_CONSTRAINT'
      ], 409);
    }
    send_json(['error' => $msg], 500);
  }
}

if ($method === 'DELETE'){
  $name = trim($_GET['name'] ?? ($body['name'] ?? ''));
  $id = (int)($_GET['id'] ?? ($body['id'] ?? 0));
  $force = (int)($_GET['force'] ?? ($body['force'] ?? 0));
  if ($name === '' && !$id) send_json(['error' => 'name o id requerido'], 422);

  if ($force){
    // Eliminar productos asociados y luego la marca
    $pdo->beginTransaction();
    try{
      if (!$id && $name !== ''){
        $q = $pdo->prepare('SELECT id FROM marcas WHERE nombre = ?');
        $q->execute([$name]);
        $row = $q->fetch();
        $id = $row ? (int)$row['id'] : 0;
      }
      if (!$id){ $pdo->rollBack(); send_json(['error' => 'No encontrado'], 404); }
      $pdo->prepare('DELETE FROM productos WHERE marca_id = ?')->execute([$id]);
      $pdo->prepare('DELETE FROM marcas WHERE id = ?')->execute([$id]);
      $pdo->commit();
      return list_brands($pdo);
    }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
  }

  try{
    if ($id){
      $stmt = $pdo->prepare('DELETE FROM marcas WHERE id = ?');
      $stmt->execute([$id]);
    } else {
      $stmt = $pdo->prepare('DELETE FROM marcas WHERE nombre = ?');
      $stmt->execute([$name]);
    }
    if ($stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
    return list_brands($pdo);
  }catch(Throwable $e){
    $msg = $e->getMessage();
    if (strpos($msg, '1451') !== false || strpos($msg, 'foreign key') !== false){
      send_json([
        'error' => 'No se puede eliminar la marca porque tiene productos asociados. Elimina o reasigna esos productos antes de eliminar la marca.',
        'code' => 'FK_CONSTRAINT'
      ], 409);
    }
    send_json(['error' => $msg], 500);
  }
}

send_json(['error' => 'Método no permitido'], 405);
