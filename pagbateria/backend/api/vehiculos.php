<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

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

function compat_link_columns(){
  $candidates = ['producto_compatibilidad_id', 'pc_id', 'compat_id', 'vehiculo_id', 'producto_compatibilidad'];
  $out = [];
  foreach ($candidates as $col){ if (db_column_exists('compatibilidad', $col)) $out[] = $col; }
  return $out;
}

$pdo = get_pdo();
if (!$pdo || !db_table_exists('producto_compatibilidad')){
  send_json(['years' => []]);
}

$make  = isset($_GET['make'])  ? trim((string)$_GET['make'])  : '';
$model = isset($_GET['model']) ? trim((string)$_GET['model']) : '';

$params = [];
$where = [];
$joins = [];

// If compatibilidad exists, ensure we only consider vehicle rows linked to at least one producto
if (db_table_exists('compatibilidad')){
  $links = compat_link_columns();
  if ($links){
    $ors = array_map(fn($c) => "c.$c = pc.id", $links);
    $joins[] = 'JOIN compatibilidad c ON (' . implode(' OR ', $ors) . ')';
  }
}

if ($make !== ''){ $where[] = 'LOWER(pc.marca) = LOWER(?)'; $params[] = $make; }
if ($model !== ''){ $where[] = 'LOWER(pc.modelo) = LOWER(?)'; $params[] = $model; }

$hasDesde = db_column_exists('producto_compatibilidad','anio_desde');
$hasHasta = db_column_exists('producto_compatibilidad','anio_hasta');
$hasAnio  = db_column_exists('producto_compatibilidad','anio');

$sql = 'SELECT pc.* FROM producto_compatibilidad pc';
if ($joins){ $sql .= ' ' . implode(' ', $joins); }
if ($where){ $sql .= ' WHERE ' . implode(' AND ', $where); }
$sql .= ' LIMIT 10000';

$rows = [];
try{
  $st = $pdo->prepare($sql);
  $st->execute($params);
  $rows = $st->fetchAll();
}catch(Throwable $e){ send_json(['years' => []]); }

$yearsSet = [];
foreach ($rows as $r){
  if ($hasDesde || $hasHasta){
    $d = isset($r['anio_desde']) ? (int)$r['anio_desde'] : null;
    $h = isset($r['anio_hasta']) ? (int)$r['anio_hasta'] : null;
    if ($d && $h && $h >= $d){
      for ($y=$d; $y<=$h; $y++) $yearsSet[$y] = true;
    } elseif ($d && !$h) {
      $yearsSet[$d] = true;
    } elseif ($h && !$d) {
      $yearsSet[$h] = true;
    }
  } elseif ($hasAnio){
    $y = (int)$r['anio']; if ($y) $yearsSet[$y] = true;
  }
}
$years = array_keys($yearsSet);
sort($years, SORT_NUMERIC);

send_json(['years' => $years]);
