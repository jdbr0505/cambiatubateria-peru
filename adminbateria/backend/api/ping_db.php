<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

try{
  $pdo = db();
  $pdo->query('SELECT 1');
  send_json(['ok' => true]);
}catch(Throwable $e){
  send_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
