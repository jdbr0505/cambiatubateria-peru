<?php
require_once __DIR__ . '/../lib/response.php';
if (session_status() === PHP_SESSION_NONE) { session_start(); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST'){
  send_json(['error'=>'Método no permitido'], 405);
}

$_SESSION = [];
if (ini_get('session.use_cookies')){
  $params = session_get_cookie_params();
  setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}
session_destroy();

send_json(['ok'=>true]);
