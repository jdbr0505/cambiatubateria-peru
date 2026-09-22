<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$dataFile = __DIR__ . '/../data/brands.json';
if (!file_exists($dataFile)){
  @file_put_contents($dataFile, json_encode([], JSON_UNESCAPED_UNICODE));
}

function read_brands($file){
  $raw = @file_get_contents($file);
  $arr = json_decode($raw, true);
  return is_array($arr) ? $arr : [];
}

function write_brands($file, $arr){
  // keep unique, trimmed names
  $set = [];
  foreach ($arr as $n){ $n = trim((string)$n); if ($n !== '') $set[$n] = true; }
  $out = array_keys($set);
  sort($out);
  @file_put_contents($file, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

// --- MySQL helpers (fallback a JSON si no disponible) ---
function db_available(){
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM marcas LIMIT 1');
    return true;
  } catch (Throwable $e){
    return false;
  }
}

function db_read_brands(){
  $pdo = get_pdo();
  // La columna `orden` se agregó después; una BD vieja puede no tenerla. Si
  // falta, este GET público NO debe alterar la tabla (eso lo hace el panel
  // admin) ni caer con 500 en cada visita: se reintenta sin `orden`, ordenando
  // por nombre. El panel es quien crea la columna y define el orden real.
  try {
    $stmt = $pdo->query('SELECT nombre, logo_path, COALESCE(orden, 0) AS orden FROM marcas ORDER BY orden, nombre');
  } catch (Throwable $e) {
    $stmt = $pdo->query('SELECT nombre, logo_path, 0 AS orden FROM marcas ORDER BY nombre');
  }
  $rows = $stmt->fetchAll();
  $names = array_map(function($r){ return $r['nombre']; }, $rows);
  $items = array_map(function($r){
    return [
      'name' => $r['nombre'],
      'logoPath' => $r['logo_path'] ?? null,
      'order' => (int)$r['orden'],
    ];
  }, $rows);
  return [ $names, $items ];
}

function db_insert_brand($name){
  $pdo = get_pdo();
  $stmt = $pdo->prepare('INSERT INTO marcas (nombre) VALUES (?)');
  $stmt->execute([$name]);
}

function db_update_brand($old, $new){
  $pdo = get_pdo();
  $stmt = $pdo->prepare('UPDATE marcas SET nombre = ? WHERE nombre = ?');
  $stmt->execute([$new, $old]);
  return $stmt->rowCount();
}

function db_delete_brand($name){
  $pdo = get_pdo();
  $stmt = $pdo->prepare('DELETE FROM marcas WHERE nombre = ?');
  $stmt->execute([$name]);
  return $stmt->rowCount();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$useDb = db_available();
$brands = [];
$items = [];
if ($useDb){
  list($brands, $items) = db_read_brands();
} else {
  $brands = read_brands($dataFile);
}

if ($method === 'GET'){
  // When using DB, the SELECT already comes ordered by 'orden, nombre'.
  // Only sort alphabetically when using JSON fallback.
  if (!$useDb) sort($brands);
  $payload = ['brands' => $brands];
  if ($items && is_array($items)) $payload['items'] = $items;
  send_json($payload);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'POST'){
  $name = trim($body['name'] ?? '');
  if ($name === '') send_json(['error' => 'name requerido'], 422);
  if ($useDb){
    try {
      db_insert_brand($name);
      list($names, $it) = db_read_brands();
      send_json(['success' => true, 'brands' => $names, 'items' => $it], 201);
    } catch (Throwable $e){
      // Duplicado u otro error
      send_json(['error' => 'No se pudo crear (posible duplicado)', 'detail' => $e->getMessage()], 400);
    }
  } else {
    $brands[] = $name;
    write_brands($dataFile, $brands);
    $names = read_brands($dataFile);
    send_json(['success' => true, 'brands' => $names], 201);
  }
}

if ($method === 'PUT'){
  $old = trim($body['old'] ?? ($_GET['old'] ?? ''));
  $new = trim($body['new'] ?? ($_GET['new'] ?? ''));
  if ($old === '' || $new === '') send_json(['error' => 'old y new requeridos'], 422);
  if ($useDb){
    try {
      $affected = db_update_brand($old, $new);
      if ($affected < 1) send_json(['error' => 'No encontrado'], 404);
      list($names, $it) = db_read_brands();
      send_json(['success' => true, 'brands' => $names, 'items' => $it]);
    } catch (Throwable $e){
      send_json(['error' => 'No se pudo actualizar', 'detail' => $e->getMessage()], 400);
    }
  } else {
    $found = false;
    foreach ($brands as &$b){ if (strcasecmp($b, $old) === 0){ $b = $new; $found = true; break; } }
    if (!$found) send_json(['error' => 'No encontrado'], 404);
    write_brands($dataFile, $brands);
    $names = read_brands($dataFile);
    send_json(['success' => true, 'brands' => $names]);
  }
}

if ($method === 'DELETE'){
  $name = trim(($_GET['name'] ?? '') ?: ($body['name'] ?? ''));
  if ($name === '') send_json(['error' => 'name requerido'], 422);
  if ($useDb){
    try {
      $affected = db_delete_brand($name);
      if ($affected < 1) send_json(['error' => 'No encontrado'], 404);
      list($names, $it) = db_read_brands();
      send_json(['success' => true, 'brands' => $names, 'items' => $it]);
    } catch (Throwable $e){
      send_json(['error' => 'No se pudo eliminar', 'detail' => $e->getMessage()], 400);
    }
  } else {
    $before = count($brands);
    $brands = array_values(array_filter($brands, function($b) use ($name){ return strcasecmp($b, $name) !== 0; }));
    if (count($brands) === $before) send_json(['error' => 'No encontrado'], 404);
    write_brands($dataFile, $brands);
    send_json(['success' => true, 'brands' => read_brands($dataFile)]);
  }
}

send_json(['error' => 'Método no permitido'], 405);
