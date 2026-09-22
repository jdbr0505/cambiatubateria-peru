<?php
function send_json($payload, $code = 200){
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  // Simple CORS for local dev
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){
  send_json(['ok' => true]);
}
