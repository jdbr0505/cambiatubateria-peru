<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$dataFile = __DIR__ . '/../data/products.json';
if (!file_exists($dataFile)){
  @file_put_contents($dataFile, json_encode([], JSON_UNESCAPED_UNICODE));
}

// Detect image column in producto_imagenes
function product_image_column(){
  $cands = ['ruta','path','url','archivo','imagen','image'];
  foreach ($cands as $c){ if (db_column_exists('producto_imagenes', $c)) return $c; }
  return null;
}

function read_products($file){
  $raw = @file_get_contents($file);
  $arr = json_decode($raw, true);
  return is_array($arr) ? $arr : [];
}

function write_products($file, $arr){
  @file_put_contents($file, json_encode(array_values($arr), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

// --- MySQL helpers (fallback a JSON si no disponible) ---
function db_products_available(){
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM productos LIMIT 1');
    return true;
  } catch (Throwable $e){
    return false;
  }
}

// --- Schema helpers ---
function db_table_exists($name){
  $pdo = get_pdo(); if (!$pdo) return false;
  try {
    $st = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$name]);
    return (bool)$st->fetchColumn();
  } catch (Throwable $e){ return false; }
}

function db_column_exists($table, $column){
  $pdo = get_pdo(); if (!$pdo) return false;
  try {
    $st = $pdo->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (bool)$st->fetchColumn();
  } catch (Throwable $e){ return false; }
}

function compat_link_column(){
  // Detect the name of the FK column in compatibilidad that points to producto_compatibilidad
  // Prefer common names, then try to infer by scanning columns
  $common = ['producto_compatibilidad_id', 'pc_id', 'compat_id', 'vehiculo_id', 'producto_compatibilidad'];
  foreach ($common as $col){ if (db_column_exists('compatibilidad', $col)) return $col; }
  // Fallback: pick the first column on 'compatibilidad' that looks like a FK and is not id/producto_id
  $pdo = get_pdo(); if (!$pdo) return null;
  try{
    $st = $pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION');
    $st->execute(['compatibilidad']);
    $cols = $st->fetchAll(PDO::FETCH_COLUMN);
    foreach ($cols as $c){
      $lc = strtolower($c);
      if ($lc === 'id' || $lc === 'producto_id') continue;
      // heuristics: contains 'compat', 'vehic', or 'pc'
      if (strpos($lc, 'compat') !== false || strpos($lc, 'vehic') !== false || $lc === 'pc' || $lc === 'pcid'){
        return $c;
      }
    }
  } catch (Throwable $e){ /* ignore */ }
  return null;
}

function map_row_to_product($r){
  $dims = [
    'length' => isset($r['largo_mm']) ? (int)$r['largo_mm'] : null,
    'width'  => isset($r['ancho_mm']) ? (int)$r['ancho_mm'] : null,
    'height' => isset($r['alto_mm']) ? (int)$r['alto_mm'] : null,
  ];
  $compat = [];
  if (isset($r['compat']) && $r['compat'] !== null){
    $compat = array_values(array_filter(explode('||', (string)$r['compat']), fn($s) => $s !== ''));
  }
  return [
    'id' => (int)$r['id'],
    'name' => $r['nombre'],
    'brand' => $r['marca_nombre'],
    'price' => isset($r['precio']) ? (0 + $r['precio']) : 0,
    'cca' => isset($r['cca']) ? (int)$r['cca'] : null,
    'capacity' => isset($r['capacidad_ah']) ? (int)$r['capacidad_ah'] : null,
    'type' => $r['tipo'],
    'dimensions' => $dims,
    'weightKg' => isset($r['peso_kg']) ? (0 + $r['peso_kg']) : null,
    'polarity' => $r['polaridad'],
    'coreDiscount' => isset($r['core_descuento']) ? (int)$r['core_descuento'] : 0,
    'coreDiscountTexto' => !empty($r['core_descuento_texto']) ? $r['core_descuento_texto'] : 'entregando tu batería usada',
    'description' => $r['descripcion'],
    // Primary image from producto_imagenes join or optional explicit columns
    'image' => $r['product_image'] ?? ($r['imagen'] ?? ($r['image'] ?? null)),
    'compatibility' => $compat,
  ];
}

function db_fetch_products($filters){
  $pdo = get_pdo();
  $params = [];
  $where = [];
  $joins = [];
  $byId = isset($filters['id']) && $filters['id'] > 0;
  if ($byId){ $where[] = 'p.id = ?'; $params[] = (int)$filters['id']; }
  if (isset($filters['brand']) && $filters['brand'] !== ''){ $where[] = 'm.nombre = ?'; $params[] = $filters['brand']; }
  // Vehicle filters from producto_compatibilidad
  $make  = isset($filters['make'])  ? trim((string)$filters['make'])  : '';
  $model = isset($filters['model']) ? trim((string)$filters['model']) : '';
  $year  = isset($filters['year'])  ? (int)$filters['year']           : 0;
  if ($make !== '' || $model !== '' || $year > 0){
    // Prefer new schema with linking table 'compatibilidad'
    $useNew = db_table_exists('compatibilidad') && db_table_exists('producto_compatibilidad');
    if ($useNew){
      // Build list of existing candidate link columns
      $cands = ['producto_compatibilidad_id','pc_id','compat_id','vehiculo_id','producto_compatibilidad'];
      $exists = array_values(array_filter($cands, fn($c) => db_column_exists('compatibilidad',$c)));
      if ($exists){
        // Use EXISTS subquery to guarantee restriction even if JOINs vary by schema
        if (db_column_exists('compatibilidad','vehiculo_id')){
          $ors = ["c.vehiculo_id = pc.id"]; // prefer explicit column if present
        } else {
          $ors = array_map(fn($c) => "c.$c = pc.id", $exists);
        }
        $existsSql = 'EXISTS (SELECT 1 FROM compatibilidad c JOIN producto_compatibilidad pc ON (' . implode(' OR ', $ors) . ') WHERE c.producto_id = p.id';
        if ($make !== ''){ $existsSql .= ' AND TRIM(LOWER(pc.marca)) = TRIM(LOWER(?))'; $params[] = $make; }
        if ($model !== ''){ $existsSql .= ' AND TRIM(LOWER(pc.modelo)) = TRIM(LOWER(?))'; $params[] = $model; }
        if ($year > 0){
          $hasDesde = db_column_exists('producto_compatibilidad','anio_desde');
          $hasHasta = db_column_exists('producto_compatibilidad','anio_hasta');
          $hasAnio  = db_column_exists('producto_compatibilidad','anio');
          if ($hasDesde || $hasHasta){
            $existsSql .= ' AND ( (pc.anio_desde IS NULL OR ? >= pc.anio_desde) AND (pc.anio_hasta IS NULL OR ? <= pc.anio_hasta) )';
            $params[] = $year; $params[] = $year;
          } elseif ($hasAnio) {
            $existsSql .= ' AND pc.anio = ?';
            $params[] = $year;
          }
        }
        $existsSql .= ')';
        $where[] = $existsSql;
      } else {
        // Fallback to legacy dual-mode if no candidate columns were found
        $useNew = false;
      }
    }
    if (!$useNew){
      // Legacy support: direct rows or association via vehiculo_id
      $joins[] = 'LEFT JOIN producto_compatibilidad pc_a ON pc_a.producto_id = p.id AND pc_a.vehiculo_id IS NOT NULL';
      $joins[] = 'LEFT JOIN producto_compatibilidad v ON v.id = pc_a.vehiculo_id';
      $joins[] = 'LEFT JOIN producto_compatibilidad pc_d ON pc_d.producto_id = p.id AND pc_d.vehiculo_id IS NULL';

      $condV = [];
      $condD = [];
      if ($make !== ''){ $condV[] = 'v.marca = ?'; $params[] = $make; $condD[] = 'pc_d.marca = ?'; $params[] = $make; }
      if ($model !== ''){ $condV[] = 'v.modelo = ?'; $params[] = $model; $condD[] = 'pc_d.modelo = ?'; $params[] = $model; }
      if ($year > 0){
        $condV[] = '( (v.anio_desde IS NULL OR ? >= v.anio_desde) AND (v.anio_hasta IS NULL OR ? <= v.anio_hasta) )';
        $params[] = $year; $params[] = $year;
        $condD[] = '( (pc_d.anio_desde IS NULL OR ? >= pc_d.anio_desde) AND (pc_d.anio_hasta IS NULL OR ? <= pc_d.anio_hasta) )';
        $params[] = $year; $params[] = $year;
      }
      if ($condV || $condD){
        $left = $condV ? '(' . implode(' AND ', $condV) . ')' : '0';
        $right = $condD ? '(' . implode(' AND ', $condD) . ')' : '0';
        $where[] = "( $left OR $right )";
      }
    }
  }
  // Build SELECT with compatibility summary depending on schema
  $compatSelect = '(SELECT GROUP_CONCAT(etiqueta SEPARATOR "||") FROM producto_compatibilidad pc WHERE pc.producto_id = p.id)';
  if (db_table_exists('compatibilidad') && db_table_exists('producto_compatibilidad')){
    $linkCol = compat_link_column();
    if ($linkCol){
      $compatSelect = "(SELECT GROUP_CONCAT(DISTINCT CONCAT_WS(' ', pc2.marca, pc2.modelo) SEPARATOR '||') FROM compatibilidad c2 JOIN producto_compatibilidad pc2 ON pc2.id = c2.$linkCol WHERE c2.producto_id = p.id)";
    }
  }
  // Detect image support
  $joinPI = '';
  $selectPI = '';
  if (db_table_exists('producto_imagenes')){
    $imgCol = product_image_column();
    if ($imgCol){
      // Pick first image by id for each product
      $joinPI = ' LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id AND pi.id = (SELECT MIN(pi2.id) FROM producto_imagenes pi2 WHERE pi2.producto_id = p.id)';
      $selectPI = ', pi.' . $imgCol . ' AS product_image';
    }
  }
  $sql = 'SELECT p.*, m.nombre AS marca_nombre, ' . $compatSelect . ' AS compat' . $selectPI . ' '
       . 'FROM productos p '
       . 'JOIN marcas m ON m.id = p.marca_id' . $joinPI;
  if ($joins){ $sql .= ' ' . implode(' ', $joins); }
  if ($where){ $sql .= ' WHERE ' . implode(' AND ', $where); }
  $sql .= ' ORDER BY p.id';
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  $list = array_map('map_row_to_product', $rows);
  // filtro q en PHP sobre name/brand/compat
  $q = isset($filters['q']) ? mb_strtolower(trim($filters['q'])) : '';
  if ($q !== ''){
    $list = array_values(array_filter($list, function($p) use ($q){
      $compat = is_array($p['compatibility']) ? implode(' ', $p['compatibility']) : '';
      $haystack = mb_strtolower(($p['name'] ?? '') . ' ' . ($p['brand'] ?? '') . ' ' . $compat);
      return mb_strpos($haystack, $q) !== false;
    }));
  }
  return $list;
}

function db_get_brand_id($brand){
  $pdo = get_pdo();
  $s = $pdo->prepare('SELECT id FROM marcas WHERE nombre = ?');
  $s->execute([$brand]);
  $id = $s->fetchColumn();
  return $id ? (int)$id : 0;
}

function db_insert_product($data){
  $pdo = get_pdo();
  $name = trim((string)($data['name'] ?? ''));
  $brand = trim((string)($data['brand'] ?? ''));
  if ($name === '' || $brand === ''){
    send_json(['error' => 'name y brand son obligatorios'], 422);
  }
  $marcaId = db_get_brand_id($brand);
  if ($marcaId < 1){
    send_json(['error' => 'La marca no existe'], 422);
  }
  $precio = isset($data['price']) ? (float)$data['price'] : 0;
  $cca = isset($data['cca']) ? (int)$data['cca'] : null;
  $cap = isset($data['capacity']) ? (int)$data['capacity'] : null;
  $tipo = isset($data['type']) ? (string)$data['type'] : null;
  $dim  = is_array($data['dimensions'] ?? null) ? $data['dimensions'] : [];
  $largo = isset($dim['length']) ? (int)$dim['length'] : null;
  $ancho = isset($dim['width']) ? (int)$dim['width'] : null;
  $alto  = isset($dim['height']) ? (int)$dim['height'] : null;
  $peso  = isset($data['weightKg']) ? (float)$data['weightKg'] : null;
  $pol   = isset($data['polarity']) ? (string)$data['polarity'] : null;
  $core  = isset($data['coreDiscount']) ? (int)$data['coreDiscount'] : null;
  $desc  = isset($data['description']) ? (string)$data['description'] : null;
  $img   = isset($data['image']) ? (string)$data['image'] : null;

  $pdo->beginTransaction();
  try {
    // Try to insert image if the column exists; otherwise ignore
    $hasImage = false;
    try {
      $pdo->query('SELECT imagen FROM productos LIMIT 1');
      $hasImage = true;
    } catch (Throwable $e) { $hasImage = false; }
    if ($hasImage){
      $ins = $pdo->prepare('INSERT INTO productos (nombre, marca_id, descripcion, precio, cca, capacidad_ah, tipo, largo_mm, ancho_mm, alto_mm, peso_kg, polaridad, core_descuento, imagen, activo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
      $ins->execute([$name, $marcaId, $desc, $precio, $cca, $cap, $tipo, $largo, $ancho, $alto, $peso, $pol, $core, $img]);
    } else {
      $ins = $pdo->prepare('INSERT INTO productos (nombre, marca_id, descripcion, precio, cca, capacidad_ah, tipo, largo_mm, ancho_mm, alto_mm, peso_kg, polaridad, core_descuento, activo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
      $ins->execute([$name, $marcaId, $desc, $precio, $cca, $cap, $tipo, $largo, $ancho, $alto, $peso, $pol, $core]);
    }
    $pid = (int)$pdo->lastInsertId();
    $compat = is_array($data['compatibility'] ?? null) ? $data['compatibility'] : [];
    if ($compat){
      $ci = $pdo->prepare('INSERT INTO producto_compatibilidad (producto_id, etiqueta) VALUES (?, ?)');
      foreach ($compat as $etq){ $etq = trim((string)$etq); if ($etq !== '') $ci->execute([$pid, $etq]); }
    }
    $pdo->commit();
    // devolver recién insertado
    $list = db_fetch_products(['id' => $pid]);
    return $list ? $list[0] : null;
  } catch (Throwable $e){
    $pdo->rollBack();
    throw $e;
  }
}

function db_update_product($id, $data){
  $pdo = get_pdo();
  if ($id < 1) send_json(['error' => 'id inválido'], 400);
  // construir set dinámico
  $fields = [];
  $params = [];
  if (isset($data['name'])){ $fields[] = 'nombre = ?'; $params[] = trim((string)$data['name']); }
  if (isset($data['brand'])){
    $marcaId = db_get_brand_id(trim((string)$data['brand']));
    if ($marcaId < 1) send_json(['error' => 'La marca no existe'], 422);
    $fields[] = 'marca_id = ?'; $params[] = $marcaId;
  }
  if (array_key_exists('price', $data)){ $fields[] = 'precio = ?'; $params[] = (float)$data['price']; }
  if (array_key_exists('cca', $data)){ $fields[] = 'cca = ?'; $params[] = (int)$data['cca']; }
  if (array_key_exists('capacity', $data)){ $fields[] = 'capacidad_ah = ?'; $params[] = (int)$data['capacity']; }
  if (array_key_exists('type', $data)){ $fields[] = 'tipo = ?'; $params[] = (string)$data['type']; }
  if (array_key_exists('description', $data)){ $fields[] = 'descripcion = ?'; $params[] = (string)$data['description']; }
  if (array_key_exists('weightKg', $data)){ $fields[] = 'peso_kg = ?'; $params[] = (float)$data['weightKg']; }
  if (array_key_exists('polarity', $data)){ $fields[] = 'polaridad = ?'; $params[] = (string)$data['polarity']; }
  if (array_key_exists('coreDiscount', $data)){ $fields[] = 'core_descuento = ?'; $params[] = (int)$data['coreDiscount']; }
  if (array_key_exists('image', $data)){
    // Only attempt to update if column exists
    try { $pdo->query('SELECT imagen FROM productos LIMIT 1'); $fields[] = 'imagen = ?'; $params[] = (string)$data['image']; } catch (Throwable $e) { /* ignore if no column */ }
  }
  if (isset($data['dimensions']) && is_array($data['dimensions'])){
    $dim = $data['dimensions'];
    if (array_key_exists('length', $dim)){ $fields[] = 'largo_mm = ?'; $params[] = (int)$dim['length']; }
    if (array_key_exists('width',  $dim)){ $fields[] = 'ancho_mm = ?'; $params[] = (int)$dim['width']; }
    if (array_key_exists('height', $dim)){ $fields[] = 'alto_mm = ?';  $params[] = (int)$dim['height']; }
  }
  if (!$fields){
    // Nada que actualizar, pero permitimos actualizar compatibilidades solamente
    $fields[] = 'id = id';
  }
  $params[] = $id;

  $pdo->beginTransaction();
  try {
    $sql = 'UPDATE productos SET ' . implode(', ', $fields) . ' WHERE id = ?';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    if (array_key_exists('compatibility', $data)){
      $pdo->prepare('DELETE FROM producto_compatibilidad WHERE producto_id = ?')->execute([$id]);
      $compat = is_array($data['compatibility']) ? $data['compatibility'] : [];
      if ($compat){
        $ci = $pdo->prepare('INSERT INTO producto_compatibilidad (producto_id, etiqueta) VALUES (?, ?)');
        foreach ($compat as $etq){ $etq = trim((string)$etq); if ($etq !== '') $ci->execute([$id, $etq]); }
      }
    }
    $pdo->commit();
  } catch (Throwable $e){
    $pdo->rollBack();
    throw $e;
  }
}

function db_delete_product($id){
  $pdo = get_pdo();
  $st = $pdo->prepare('DELETE FROM productos WHERE id = ?');
  $st->execute([(int)$id]);
  return $st->rowCount();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$useDb = db_products_available();

// GET: list with filters or single by id
if ($method === 'GET'){
  if ($useDb){
    $filters = [];
    if (isset($_GET['id'])) $filters['id'] = (int)$_GET['id'];
    if (isset($_GET['brand'])) $filters['brand'] = trim((string)$_GET['brand']);
    if (isset($_GET['q'])) $filters['q'] = (string)$_GET['q'];
    // vehicle filters
    if (isset($_GET['make']))  $filters['make']  = trim((string)$_GET['make']);
    if (isset($_GET['model'])) $filters['model'] = trim((string)$_GET['model']);
    if (isset($_GET['year']))  $filters['year']  = (int)$_GET['year'];
    $list = db_fetch_products($filters);
    if (isset($filters['id']) && $filters['id'] > 0){
      if (!$list) send_json(['error' => 'No encontrado'], 404);
      send_json(['product' => $list[0]]);
    }
    send_json(['products' => $list]);
  }

  $products = read_products($dataFile);
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if ($id){
    foreach ($products as $p){ if ((int)$p['id'] === $id){ send_json(['product' => $p]); } }
    send_json(['error' => 'No encontrado'], 404);
  }
  $brand = isset($_GET['brand']) ? trim($_GET['brand']) : '';
  $q = isset($_GET['q']) ? mb_strtolower(trim($_GET['q'])) : '';
  // Vehicle filters via DB even if main products table is not available
  $make  = isset($_GET['make'])  ? trim((string)$_GET['make'])  : '';
  $model = isset($_GET['model']) ? trim((string)$_GET['model']) : '';
  $year  = isset($_GET['year'])  ? (int)$_GET['year']           : 0;
  $allowedIds = null;
  if ($make !== '' || $model !== '' || $year > 0){
    $pdo = get_pdo();
    if ($pdo && db_table_exists('compatibilidad') && db_table_exists('producto_compatibilidad')){
      $cands = ['producto_compatibilidad_id','pc_id','compat_id','vehiculo_id','producto_compatibilidad'];
      $exists = array_values(array_filter($cands, fn($c) => db_column_exists('compatibilidad',$c)));
      if ($exists){
        if (db_column_exists('compatibilidad','vehiculo_id')){ $ors = ["c.vehiculo_id = pc.id"]; }
        else { $ors = array_map(fn($c) => "c.$c = pc.id", $exists); }
        $sql = 'SELECT DISTINCT c.producto_id FROM compatibilidad c JOIN producto_compatibilidad pc ON (' . implode(' OR ', $ors) . ') WHERE 1=1';
        $params = [];
        if ($make !== ''){ $sql .= ' AND TRIM(LOWER(pc.marca)) = TRIM(LOWER(?))'; $params[] = $make; }
        if ($model !== ''){ $sql .= ' AND TRIM(LOWER(pc.modelo)) = TRIM(LOWER(?))'; $params[] = $model; }
        if ($year > 0){
          $hasDesde = db_column_exists('producto_compatibilidad','anio_desde');
          $hasHasta = db_column_exists('producto_compatibilidad','anio_hasta');
          $hasAnio  = db_column_exists('producto_compatibilidad','anio');
          if ($hasDesde || $hasHasta){
            $sql .= ' AND ( (pc.anio_desde IS NULL OR ? >= pc.anio_desde) AND (pc.anio_hasta IS NULL OR ? <= pc.anio_hasta) )';
            $params[] = $year; $params[] = $year;
          } elseif ($hasAnio) {
            $sql .= ' AND pc.anio = ?';
            $params[] = $year;
          }
        }
        try{
          $st = $pdo->prepare($sql);
          $st->execute($params);
          $allowedIds = array_map('intval', array_column($st->fetchAll(), 'producto_id'));
        } catch (Throwable $e){ $allowedIds = []; }
      } else {
        $allowedIds = [];
      }
    } else {
      $allowedIds = [];
    }
  }
  $filtered = array_values(array_filter($products, function($p) use ($brand, $q, $allowedIds){
    if (is_array($allowedIds)){
      if (!in_array((int)($p['id'] ?? 0), $allowedIds, true)) return false;
    }
    if ($brand && strcasecmp($p['brand'] ?? '', $brand) !== 0) return false;
    if ($q){
      $compat = is_array($p['compatibility'] ?? null) ? implode(' ', $p['compatibility']) : '';
      $haystack = mb_strtolower(($p['name'] ?? '') . ' ' . ($p['brand'] ?? '') . ' ' . $compat);
      if (mb_strpos($haystack, $q) === false) return false;
    }
    return true;
  }));
  send_json(['products' => $filtered]);
}

// Parse JSON body for write operations
$body = json_decode(file_get_contents('php://input') ?: 'null', true);
if ($method === 'POST'){
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  if ($useDb){
    try {
      $created = db_insert_product($body);
      send_json(['product' => $created], 201);
    } catch (Throwable $e){
      send_json(['error' => 'No se pudo crear', 'detail' => $e->getMessage()], 400);
    }
  }
  // fallback JSON
  $products = read_products($dataFile);
  $maxId = 0; foreach ($products as $p){ $maxId = max($maxId, (int)($p['id'] ?? 0)); }
  $new = $body;
  $new['id'] = $maxId + 1;
  $new['name'] = trim($new['name'] ?? '');
  $new['brand'] = trim($new['brand'] ?? '');
  if ($new['name'] === '' || $new['brand'] === ''){
    send_json(['error' => 'name y brand son obligatorios'], 422);
  }
  $products[] = $new;
  write_products($dataFile, $products);
  send_json(['product' => $new], 201);
}

if ($method === 'PUT'){
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($body['id'] ?? 0);
  if (!$id) send_json(['error' => 'id requerido'], 400);
  if ($useDb){
    try {
      db_update_product($id, $body);
      $list = db_fetch_products(['id' => $id]);
      if (!$list) send_json(['error' => 'No encontrado'], 404);
      send_json(['product' => $list[0]]);
    } catch (Throwable $e){
      send_json(['error' => 'No se pudo actualizar', 'detail' => $e->getMessage()], 400);
    }
  }
  // fallback JSON
  $products = read_products($dataFile);
  $found = false;
  foreach ($products as &$p){
    if ((int)$p['id'] === $id){
      $body['id'] = $id;
      $p = array_merge($p, $body);
      $found = true;
      break;
    }
  }
  if (!$found) send_json(['error' => 'No encontrado'], 404);
  write_products($dataFile, $products);
  send_json(['product' => $p]);
}

if ($method === 'DELETE'){
  $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
  if (!$id) send_json(['error' => 'id requerido'], 400);
  if ($useDb){
    try {
      $n = db_delete_product($id);
      if ($n < 1) send_json(['error' => 'No encontrado'], 404);
      send_json(['success' => true]);
    } catch (Throwable $e){
      send_json(['error' => 'No se pudo eliminar', 'detail' => $e->getMessage()], 400);
    }
  }
  // fallback JSON
  $products = read_products($dataFile);
  $before = count($products);
  $products = array_values(array_filter($products, function($p) use ($id){ return (int)($p['id'] ?? 0) !== $id; }));
  if (count($products) === $before){ send_json(['error' => 'No encontrado'], 404); }
  write_products($dataFile, $products);
  send_json(['success' => true]);
}

send_json(['error' => 'Método no permitido'], 405);
