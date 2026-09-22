<?php
require_once __DIR__ . '/../lib/response.php';

// Este endpoint es público y sin sesión: cualquiera puede escribir al log.
// Sin límites, un atacante llena el disco del hosting (DoS) o infla el log
// con mensajes gigantes. Tres defensas: tamaño por campo, frecuencia por IP,
// y tope del archivo de log.

const MAX_NAME_LEN    = 120;
const MAX_PHONE_LEN   = 30;
const MAX_MESSAGE_LEN = 2000;

const RATE_WINDOW_SECONDS = 60;   // ventana de conteo
const RATE_MAX_POR_VENTANA = 3;   // envíos permitidos por IP en la ventana

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB: a partir de aquí no se agrega

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  send_json(['success' => false, 'message' => 'Método no permitido'], 405);
}

$name    = trim($_POST['name'] ?? '');
$phone   = trim($_POST['phone'] ?? '');
$message = trim($_POST['message'] ?? '');

if ($name === '' || $phone === '' || $message === '') {
  send_json(['success' => false, 'message' => 'Todos los campos son obligatorios'], 422);
}

// --- Tope de tamaño por campo -----------------------------------------------
// mb_strlen cuenta caracteres, no bytes: un límite en bytes cortaría tildes y
// ñ a la mitad. Se rechaza antes de tocar el disco.
if (mb_strlen($name) > MAX_NAME_LEN
    || mb_strlen($phone) > MAX_PHONE_LEN
    || mb_strlen($message) > MAX_MESSAGE_LEN) {
  send_json(['success' => false, 'message' => 'Uno de los campos excede el tamaño permitido'], 413);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'desconocida';
$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
  @mkdir($dataDir, 0755, true);
}

// --- Límite de frecuencia por IP --------------------------------------------
// Un archivo por IP con las marcas de tiempo de la ventana actual. Es simple
// y no necesita base de datos ni sesión, que este endpoint no tiene. La IP se
// hashea para no guardar direcciones en texto plano en el nombre del archivo.
$ahora = time();
$rateFile = $dataDir . '/rate_' . hash('sha256', $ip) . '.json';

$marcas = [];
if (is_file($rateFile)) {
  $previas = json_decode((string)@file_get_contents($rateFile), true);
  if (is_array($previas)) {
    // Solo cuentan los envíos dentro de la ventana; los viejos se descartan.
    $marcas = array_filter($previas, static fn($t) => ($ahora - (int)$t) < RATE_WINDOW_SECONDS);
  }
}

if (count($marcas) >= RATE_MAX_POR_VENTANA) {
  send_json(['success' => false, 'message' => 'Demasiados envíos. Espera un momento e intenta otra vez.'], 429);
}

$marcas[] = $ahora;
@file_put_contents($rateFile, json_encode(array_values($marcas)), LOCK_EX);

// --- Tope del archivo de log ------------------------------------------------
// Si el log ya alcanzó el máximo, se deja de agregar en vez de llenar el
// disco. El envío se considera aceptado igual: perder una línea de log es
// mejor que tumbar el hosting, y el cliente no debe ver un error por eso.
$logFile = $dataDir . '/contacts.log';
$logLleno = is_file($logFile) && filesize($logFile) >= MAX_LOG_BYTES;

if (!$logLleno) {
  $entry = [
    'timestamp' => date('c'),
    'name'      => $name,
    'phone'     => $phone,
    'message'   => $message,
    'ip'        => $ip,
  ];
  @file_put_contents(
    $logFile,
    json_encode($entry, JSON_UNESCAPED_UNICODE) . PHP_EOL,
    FILE_APPEND | LOCK_EX
  );
} else {
  // Deja rastro de que el log topó, para que el negocio sepa que hay que
  // rotarlo, sin generar tráfico de disco por cada envío.
  error_log('contact.php: log lleno (' . MAX_LOG_BYTES . ' bytes), envío no registrado');
}

send_json(['success' => true]);
