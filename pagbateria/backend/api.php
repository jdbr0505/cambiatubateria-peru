<?php
// /pagbateria/backend/api.php
declare(strict_types=1);

// ===== Config =====
$ADMIN_TOKEN = getenv('ADMIN_TOKEN') ?: 'cambia-este-token-super-seguro';
$DATA_FILE   = __DIR__ . '/contact.json';

// ===== CORS seguro (si hay cross-domain) =====
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
  header('Access-Control-Allow-Origin: ' . $origin); // NO usar '*'
  header('Vary: Origin');
  header('Access-Control-Allow-Credentials: true');   // permite cookies
} else {
  header('Access-Control-Allow-Origin: *');           // mismo origen
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ===== Sesión (aceptar cookie del panel) =====
function has_admin_session(): bool {
  // Unifica cookie de sesión a nivel sitio si puedes (ver Opción B)
  // Si tu panel usa un nombre de sesión custom, ponlo aquí:
  // session_name('PHPSESSID'); // o el que uses
  @session_start();
  // Ajusta la condición a tu sistema (ejemplos):
  if (!empty($_SESSION['user']) && ($_SESSION['user']['rol'] ?? '') === 'admin') return true;
  if (!empty($_SESSION['is_admin'])) return true;
  return false;
}

function require_auth_or_token(string $ADMIN_TOKEN): void {
  if (has_admin_session()) return; // sesión válida => ok
  $headers = function_exists('getallheaders') ? getallheaders() : [];
  $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? '';
  if (!$token || $token !== $ADMIN_TOKEN) {
    http_response_code(401);
    echo json_encode(['ok'=>false, 'error'=>'UNAUTHORIZED']);
    exit;
  }
}


// ===== Headers =====
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ===== Helpers =====
function json_out($data, int $code=200) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
  exit;
}
function load_values(string $file): array {
  if (!is_file($file)) return [];
  $raw = @file_get_contents($file);
  if ($raw === false) return [];
  $j = json_decode($raw, true);
  return is_array($j) ? $j : [];
}
function save_values(string $file, array $values): bool {
  $tmp = $file . '.tmp';
  $ok  = @file_put_contents($tmp, json_encode($values, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT));
  if ($ok === false) return false;
  return @rename($tmp, $file);
}

// ===== Router =====
$action = $_GET['action'] ?? '';

try {
  if ($action === 'get_contact') {
    // Estructura esperada por el panel: { values: {...} }
    $vals = load_values($DATA_FILE);
    // saneo mínimo / esquema por defecto
    $defaults = [
      'address' => '',
      'mapUrl'  => '',
      'phone'   => '',
      'email'   => '',
      'ruc'     => '',
      'schedule'=> [
        'weekdays' => '',
        'saturday' => '',
        'sunday'   => ''
      ]
    ];
    // merge recursivo sencillo
    $values = array_replace_recursive($defaults, $vals);
    json_out(['values' => $values]);
  }

  if ($action === 'save_contact') {
    // Autenticación por header X-Admin-Token
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? '';
    if (!$token || $token !== $ADMIN_TOKEN) {
      json_out(['ok' => false, 'error' => 'UNAUTHORIZED'], 401);
    }

    $raw = file_get_contents('php://input');
    $j = json_decode($raw, true);
    if (!is_array($j)) {
      json_out(['ok'=>false, 'error'=>'BAD_JSON'], 400);
    }
    $values = $j['values'] ?? null;
    if (!is_array($values)) {
      json_out(['ok'=>false, 'error'=>'MISSING_VALUES'], 400);
    }

    // Normalizar estructura
    $out = [
      'address' => (string)($values['address'] ?? ''),
      'mapUrl'  => (string)($values['mapUrl']  ?? ''),
      'phone'   => (string)($values['phone']   ?? ''),
      'email'   => (string)($values['email']   ?? ''),
      'ruc'     => (string)($values['ruc']     ?? ''),
      'schedule'=> [
        'weekdays' => (string)($values['schedule']['weekdays'] ?? ''),
        'saturday' => (string)($values['schedule']['saturday'] ?? ''),
        'sunday'   => (string)($values['schedule']['sunday']   ?? '')
      ]
    ];

    if (!save_values($DATA_FILE, $out)) {
      json_out(['ok'=>false, 'error'=>'WRITE_FAILED'], 500);
    }
    json_out(['ok'=>true]);
  }

  // Acción desconocida
  json_out(['error'=>'NOT_FOUND'], 404);

} catch (Throwable $e) {
  json_out(['error'=>'SERVER_ERROR', 'detail'=>$e->getMessage()], 500);
}
