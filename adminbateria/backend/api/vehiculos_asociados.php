<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET'){
  // Lista de vehículos del catálogo
  // o asociaciones actuales para un vehículo específico
  if (isset($_GET['assoc_for'])){
    $vid = (int)$_GET['assoc_for'];
    if (!$vid) send_json(['error' => 'assoc_for inválido'], 422);
    // validar que exista vehículo en catálogo
    $chk = $pdo->prepare('SELECT id FROM producto_compatibilidad WHERE id = ?');
    $chk->execute([$vid]);
    if (!$chk->fetch()) send_json(['error' => 'vehículo no encontrado'], 404);
    $q = $pdo->prepare('SELECT producto_id FROM compatibilidad WHERE vehiculo_id = ?');
    $q->execute([$vid]);
    $ids = array_map(fn($r)=>(int)$r['producto_id'], $q->fetchAll());
    send_json(['product_ids' => $ids]);
  }

  // Filtros para listado de vehículos del catálogo
  $brand = isset($_GET['brand']) ? trim($_GET['brand']) : '';
  $model = isset($_GET['model']) ? trim($_GET['model']) : '';
  $year  = isset($_GET['year'])  ? (int)$_GET['year'] : 0;

  $sql = "SELECT v.id, v.marca, v.modelo, v.anio_desde, v.anio_hasta,
                 (SELECT COUNT(1) FROM compatibilidad c WHERE c.vehiculo_id = v.id) AS products
          FROM producto_compatibilidad v
          WHERE 1=1";
  $params = [];
  if ($brand !== ''){ $sql .= ' AND v.marca = ?'; $params[] = $brand; }
  if ($model !== ''){ $sql .= ' AND v.modelo = ?'; $params[] = $model; }
  if ($year){ $sql .= ' AND (? BETWEEN COALESCE(v.anio_desde, ?) AND COALESCE(v.anio_hasta, ?))'; array_push($params, $year, $year, $year); }

  $sql .= ' ORDER BY v.marca, v.modelo, COALESCE(v.anio_desde, 0), COALESCE(v.anio_hasta, 9999), v.id DESC LIMIT 500';
  $stmt = $pdo->prepare($sql); $stmt->execute($params);
  $rows = $stmt->fetchAll();
  $items = array_map(function($r){
    return [
      'id' => (int)$r['id'],
      'brand' => $r['marca'],
      'model' => $r['modelo'],
      'yearFrom' => $r['anio_desde'] !== null ? (int)$r['anio_desde'] : null,
      'yearTo' => $r['anio_hasta'] !== null ? (int)$r['anio_hasta'] : null,
      'productCount' => (int)$r['products'],
    ];
  }, $rows);
  send_json(['items' => $items]);
}

// Crea un vehículo en el catálogo (sin asociarlo a producto)
if ($method === 'POST'){
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $marca = trim($body['brand'] ?? '');
  $modelo = trim($body['model'] ?? '');
  $anio_desde = isset($body['yearFrom']) ? (int)$body['yearFrom'] : null;
  $anio_hasta = isset($body['yearTo']) ? (int)$body['yearTo'] : null;
  if ($marca === '' || $modelo === '') send_json(['error' => 'brand y model requeridos'], 422);

  // Buscar vehículo idéntico en catálogo
  $sql = 'SELECT id FROM producto_compatibilidad WHERE marca = ? AND modelo = ? AND
          COALESCE(anio_desde, -1) = COALESCE(?, -1) AND COALESCE(anio_hasta, -1) = COALESCE(?, -1)
          LIMIT 1';
  $st = $pdo->prepare($sql);
  $st->execute([$marca, $modelo, $anio_desde, $anio_hasta]);
  $row = $st->fetch();
  if ($row){
    send_json(['vehicle' => [
      'id' => (int)$row['id'], 'brand' => $marca, 'model' => $modelo,
      'yearFrom' => $anio_desde, 'yearTo' => $anio_hasta,
      'existed' => true
    ]], 200);
  }

  $ins = $pdo->prepare('INSERT INTO producto_compatibilidad (marca, modelo, anio_desde, anio_hasta) VALUES (?, ?, ?, ?)');
  $ins->execute([$marca, $modelo, $anio_desde, $anio_hasta]);
  $id = (int)$pdo->lastInsertId();
  send_json(['vehicle' => [
    'id' => $id, 'brand' => $marca, 'model' => $modelo,
    'yearFrom' => $anio_desde, 'yearTo' => $anio_hasta,
    'existed' => false
  ]], 201);
}

// Reemplaza asociaciones producto–vehículo para un vehículo del catálogo
if ($method === 'PUT'){
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $vehiculo_id = (int)($body['vehiculo_id'] ?? 0);
  if (!$vehiculo_id) send_json(['error' => 'vehiculo_id requerido'], 422);
  // validar vehículo catálogo
  $chk = $pdo->prepare('SELECT id FROM producto_compatibilidad WHERE id = ?');
  $chk->execute([$vehiculo_id]);
  if (!$chk->fetch()) send_json(['error' => 'vehículo no encontrado'], 404);

  $pdo->beginTransaction();
  try{
    // Si vienen campos de vehículo, actualizar catálogo
    $hasVehUpdate = array_key_exists('brand',$body) || array_key_exists('model',$body) || array_key_exists('yearFrom',$body) || array_key_exists('yearTo',$body);
    if ($hasVehUpdate){
      $pdo->prepare('UPDATE producto_compatibilidad SET marca = COALESCE(?, marca), modelo = COALESCE(?, modelo), anio_desde = COALESCE(?, anio_desde), anio_hasta = COALESCE(?, anio_hasta) WHERE id = ?')
          ->execute([
            isset($body['brand']) ? (string)$body['brand'] : null,
            isset($body['model']) ? (string)$body['model'] : null,
            array_key_exists('yearFrom',$body) ? ( $body['yearFrom']!==null ? (int)$body['yearFrom'] : null) : null,
            array_key_exists('yearTo',$body) ? ( $body['yearTo']!==null ? (int)$body['yearTo'] : null) : null,
            $vehiculo_id
          ]);
    }
    // Si vienen asociaciones, reemplazarlas
    if (isset($body['product_ids']) && is_array($body['product_ids'])){
      $product_ids = $body['product_ids'];
      $pdo->prepare('DELETE FROM compatibilidad WHERE vehiculo_id = ?')->execute([$vehiculo_id]);
      if (!empty($product_ids)){
        $ins = $pdo->prepare('INSERT INTO compatibilidad (producto_id, vehiculo_id) VALUES (?, ?)');
        foreach ($product_ids as $pid){ $pid = (int)$pid; if ($pid>0) $ins->execute([$pid, $vehiculo_id]); }
      }
    }
    $pdo->commit();
    send_json(['success' => true]);
  }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
}

if ($method === 'DELETE'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if (!$id) send_json(['error' => 'id requerido'], 400);
  $pdo->beginTransaction();
  try{
    $pdo->prepare('DELETE FROM compatibilidad WHERE vehiculo_id = ?')->execute([$id]);
    $stmt = $pdo->prepare('DELETE FROM producto_compatibilidad WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0){ $pdo->rollBack(); send_json(['error' => 'No encontrado'], 404); }
    $pdo->commit();
    send_json(['success' => true]);
  }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
}

send_json(['error' => 'Método no permitido'], 405);
