<?php
function send_json($payload, $code = 200){
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS'){
  send_json(['ok' => true]);
}

// Evitar HTML en errores y devolver JSON
@ini_set('display_errors', '0');
set_exception_handler(function($e){
  $msg = $e->getMessage();
  send_json(['error' => $msg], 500);
});
set_error_handler(function($severity, $message, $file, $line){
  // Convertir errores a excepciones para que pasen por el handler
  throw new ErrorException($message, 0, $severity, $file, $line);
});
