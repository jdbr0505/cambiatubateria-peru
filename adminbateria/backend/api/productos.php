<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function fetch_product(PDO $pdo, int $id){
  $stmt = $pdo->prepare('SELECT p.*, m.nombre AS brand FROM productos p JOIN marcas m ON m.id = p.marca_id WHERE p.id = ?');
  $stmt->execute([$id]);
  $p = $stmt->fetch();
  if (!$p) return null;
  // compatibilidad (texto libre) ya no se usa, devolver arreglo vacío
  $p['compatibility'] = [];
  // structured fitments: usar nueva tabla compatibilidad -> catálogo de vehículos
  $fit = $pdo->prepare('SELECT v.marca, v.modelo, v.anio_desde, v.anio_hasta
                        FROM compatibilidad c
                        INNER JOIN producto_compatibilidad v ON v.id = c.vehiculo_id
                        WHERE c.producto_id = ?
                        ORDER BY v.marca, v.modelo, COALESCE(v.anio_desde,0), COALESCE(v.anio_hasta,9999), v.id');
  $fit->execute([$id]);
  $p['fitments'] = array_map(function($r){
    return [
      'brand' => $r['marca'],
      'model' => $r['modelo'],
      'yearFrom' => $r['anio_desde'] !== null ? (int)$r['anio_desde'] : null,
      'yearTo' => $r['anio_hasta'] !== null ? (int)$r['anio_hasta'] : null,
    ];
  }, $fit->fetchAll());
  $imgs = $pdo->prepare('SELECT ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id');
  $imgs->execute([$id]);
  $p['images'] = array_map(fn($r) => $r['ruta'], $imgs->fetchAll());
  // Map to frontend keys
  $out = [
    'id' => (int)$p['id'],
    'name' => $p['nombre'],
    'brand' => $p['brand'],
    'description' => $p['descripcion'],
    'price' => (float)$p['precio'],
    'cca' => $p['cca'] !== null ? (int)$p['cca'] : null,
    'capacity' => $p['capacidad_ah'] !== null ? (int)$p['capacidad_ah'] : null,
    'type' => $p['tipo'],
    'dimensions' => [ 'length' => $p['largo_mm'], 'width' => $p['ancho_mm'], 'height' => $p['alto_mm'] ],
    'weightKg' => $p['peso_kg'] !== null ? (float)$p['peso_kg'] : null,
    'polarity' => $p['polaridad'],
    'coreDiscount' => $p['core_descuento'] !== null ? (int)$p['core_descuento'] : null,
    'compatibility' => $p['compatibility'],
    'images' => $p['images'],
    'fitments' => $p['fitments'] ?? [],
    'active' => (bool)$p['activo'],
  ];
  return $out;
}

if ($method === 'GET'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if ($id){
    $prod = fetch_product($pdo, $id);
    if (!$prod) send_json(['error' => 'No encontrado'], 404);
    send_json(['product' => $prod]);
  }
  $brand = trim($_GET['brand'] ?? '');
  $q = trim($_GET['q'] ?? '');
  $sql = "SELECT p.id FROM productos p JOIN marcas m ON m.id = p.marca_id
          WHERE (? = '' OR m.nombre = ?) AND (? = '' OR CONCAT_WS(' ', p.nombre, m.nombre) LIKE CONCAT('%', ?, '%'))
          ORDER BY p.id DESC";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([$brand, $brand, $q, $q]);
  $ids = array_map(fn($r) => (int)$r['id'], $stmt->fetchAll());
  $products = [];
  foreach ($ids as $pid){ $p = fetch_product($pdo, $pid); if ($p) $products[] = $p; }
  send_json(['products' => $products]);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'POST'){
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $name = trim($body['name'] ?? '');
  $brand = trim($body['brand'] ?? '');
  if ($name === '' || $brand === '') send_json(['error' => 'name y brand requeridos'], 422);
  // Ensure brand exists or create
  $pdo->beginTransaction();
  try{
    $bid = null;
    $stmt = $pdo->prepare('SELECT id FROM marcas WHERE nombre = ?');
    $stmt->execute([$brand]);
    $row = $stmt->fetch();
    if ($row){ $bid = (int)$row['id']; }
    else { $pdo->prepare('INSERT INTO marcas (nombre) VALUES (?)')->execute([$brand]); $bid = (int)$pdo->lastInsertId(); }
    
    // Determinar el descuento de core a aplicar al crear:
    // 1) Si el payload proporciona explícitamente coreDiscount, usarlo (incluye null si viene así).
    // 2) En caso contrario, heredar el valor global actual desde sitio_config (id=1).
    $core = null;
    if (array_key_exists('coreDiscount', $body)){
      // Respetar el valor explícito enviado por el cliente
      $core = isset($body['coreDiscount']) ? (int)$body['coreDiscount'] : null;
    } else {
      // Como respaldo, usar el valor global actualmente configurado
      try{
        $cfg = $pdo->query('SELECT core_descuento FROM sitio_config WHERE id=1')->fetch();
        if ($cfg && $cfg['core_descuento'] !== null){ $core = (int)$cfg['core_descuento']; }
      }catch(Throwable $e){ /* ignore and keep null */ }
    }

    $ins = $pdo->prepare('INSERT INTO productos (nombre, marca_id, descripcion, precio, cca, capacidad_ah, tipo, largo_mm, ancho_mm, alto_mm, peso_kg, polaridad, core_descuento, activo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $ins->execute([
      $name,
      $bid,
      $body['description'] ?? null,
      isset($body['price']) ? (float)$body['price'] : 0,
      isset($body['cca']) ? (int)$body['cca'] : null,
      isset($body['capacity']) ? (int)$body['capacity'] : null,
      $body['type'] ?? null,
      $body['dimensions']['length'] ?? null,
      $body['dimensions']['width'] ?? null,
      $body['dimensions']['height'] ?? null,
      isset($body['weightKg']) ? (float)$body['weightKg'] : null,
      $body['polarity'] ?? null,
      $core,
      isset($body['active']) ? (int)!!$body['active'] : 1,
    ]);
    $pid = (int)$pdo->lastInsertId();

    // compatibility (texto libre) se eliminó en el nuevo esquema
    // fitments estructurados: ya no se insertan desde productos.php (se gestionan en vehiculos_asociados.php)
    // images
    if (isset($body['images']) && is_array($body['images'])){
      $ii = $pdo->prepare('INSERT INTO producto_imagenes (producto_id, ruta, orden) VALUES (?, ?, ?)');
      $ord = 0; foreach ($body['images'] as $img){ $ii->execute([$pid, (string)$img, $ord++]); }
    }

    $pdo->commit();
    send_json(['product' => fetch_product($pdo, $pid)], 201);
  }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
}

if ($method === 'PUT'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);
  if (!$id) send_json(['error' => 'id requerido'], 400);
  $pdo->beginTransaction();
  try{
    // update brand if provided
    if (isset($body['brand'])){
      $brand = trim((string)$body['brand']);
      $bid = null;
      $r = $pdo->prepare('SELECT id FROM marcas WHERE nombre = ?');
      $r->execute([$brand]);
      $row = $r->fetch();
      if ($row){ $bid = (int)$row['id']; } else { $pdo->prepare('INSERT INTO marcas (nombre) VALUES (?)')->execute([$brand]); $bid = (int)$pdo->lastInsertId(); }
      $pdo->prepare('UPDATE productos SET marca_id = ? WHERE id = ?')->execute([$bid, $id]);
    }
    // main fields
    $pdo->prepare('UPDATE productos SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion), precio = COALESCE(?, precio), cca = COALESCE(?, cca), capacidad_ah = COALESCE(?, capacidad_ah), tipo = COALESCE(?, tipo), largo_mm = COALESCE(?, largo_mm), ancho_mm = COALESCE(?, ancho_mm), alto_mm = COALESCE(?, alto_mm), peso_kg = COALESCE(?, peso_kg), polaridad = COALESCE(?, polaridad), core_descuento = COALESCE(?, core_descuento), activo = COALESCE(?, activo) WHERE id = ?')
      ->execute([
        $body['name'] ?? null,
        $body['description'] ?? null,
        isset($body['price']) ? (float)$body['price'] : null,
        isset($body['cca']) ? (int)$body['cca'] : null,
        isset($body['capacity']) ? (int)$body['capacity'] : null,
        $body['type'] ?? null,
        $body['dimensions']['length'] ?? null,
        $body['dimensions']['width'] ?? null,
        $body['dimensions']['height'] ?? null,
        isset($body['weightKg']) ? (float)$body['weightKg'] : null,
        $body['polarity'] ?? null,
        isset($body['coreDiscount']) ? (int)$body['coreDiscount'] : null,
        isset($body['active']) ? (int)!!$body['active'] : null,
        $id
      ]);
    // compatibility (texto libre) ya no se gestiona
    // fitments estructurados: ya no se gestionan desde productos.php. Si envían 'fitments', se ignoran aquí.
    // replace images if provided
    if (isset($body['images']) && is_array($body['images'])){
      $pdo->prepare('DELETE FROM producto_imagenes WHERE producto_id = ?')->execute([$id]);
      $ii = $pdo->prepare('INSERT INTO producto_imagenes (producto_id, ruta, orden) VALUES (?, ?, ?)');
      $ord = 0; foreach ($body['images'] as $img){ $ii->execute([$id, (string)$img, $ord++]); }
    }
    $pdo->commit();
    send_json(['product' => fetch_product($pdo, $id)]);
  }catch(Throwable $e){ $pdo->rollBack(); send_json(['error' => $e->getMessage()], 500); }
}

if ($method === 'DELETE'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if (!$id) send_json(['error' => 'id requerido'], 400);
  $stmt = $pdo->prepare('DELETE FROM productos WHERE id = ?');
  $stmt->execute([$id]);
  if ($stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
  send_json(['success' => true]);
}

send_json(['error' => 'Método no permitido'], 405);
