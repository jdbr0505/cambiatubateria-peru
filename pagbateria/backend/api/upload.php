<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

// POST multipart/form-data
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST'){
  send_json(['error' => 'Método no permitido'], 405);
}

if (!isset($_FILES['archivo'])){
  send_json(['error' => 'No se recibió el archivo (campo "archivo")'], 400);
}

$type = isset($_POST['tipo']) ? trim($_POST['tipo']) : '';
// tipos soportados: marca, producto, hero, api (logos whatsapp)
$map = [
  'marca' => __DIR__ . '/../../public/assets/img/marcbaterias/',
  'producto' => __DIR__ . '/../../public/assets/img/productos/',
  'hero' => __DIR__ . '/../../public/assets/img/hero/',
  'api' => __DIR__ . '/../../public/assets/img/apis/',
];

$targetDir = $map[$type] ?? '';
if ($targetDir === ''){
  send_json(['error' => 'tipo inválido. Usa: marca | producto | hero | api'], 422);
}

// crear carpeta si no existe
if (!is_dir($targetDir)){
  @mkdir($targetDir, 0777, true);
}

// ---------------------------------------------------------------------------
// VALIDACIÓN DE LA SUBIDA
//
// Tres vías de ataque cerradas aquí:
//   1. SVG con <script>: es XML ejecutable. Servido desde el mismo dominio
//      puede robar la sesión del administrador que lo abra. Queda excluido.
//   2. PHP renombrado a .png: la extensión no prueba nada. Se deduce el tipo
//      real del contenido y se exige que sea una imagen decodificable.
//   3. Nombre elegido por el cliente: permitía '../' (traversal) y
//      'shell.php.png' (doble extensión). Ahora lo genera el servidor.
// ---------------------------------------------------------------------------

$allowedExt  = ['png', 'jpg', 'jpeg', 'webp'];
$allowedMime = ['image/png', 'image/jpeg', 'image/webp'];
$maxSize = 5 * 1024 * 1024; // 5 MB basta para un logo o una foto de producto

$up = $_FILES['archivo'];

if (!is_uploaded_file($up['tmp_name'])) {
  send_json(['error' => 'Subida inválida'], 400);
}
if ($up['size'] > $maxSize) {
  send_json(['error' => 'Archivo demasiado grande (máx 5 MB)'], 413);
}

$ext = strtolower(pathinfo($up['name'], PATHINFO_EXTENSION));
if (!in_array($ext, $allowedExt, true)) {
  send_json(['error' => 'Formato no permitido. Usa PNG, JPG o WEBP.'], 415);
}

// El MIME se deduce del contenido, no de la cabecera que envía el cliente:
// esa es falsificable y es como se cuela un ejecutable renombrado.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_file($finfo, $up['tmp_name']);
finfo_close($finfo);
if (!in_array($mime, $allowedMime, true)) {
  send_json(['error' => 'El contenido no es una imagen válida'], 415);
}

// getimagesize falla en cualquier archivo que no sea una imagen real.
if (getimagesize($up['tmp_name']) === false) {
  send_json(['error' => 'Archivo corrupto o no es una imagen'], 415);
}

// Nombre generado por el servidor. Elimina de raíz el traversal y la doble
// extensión, sin depender de sanear una cadena hostil.
$final = $targetDir . bin2hex(random_bytes(12)) . '.' . $ext;


if (!@move_uploaded_file($up['tmp_name'], $final)){
  send_json(['error' => 'No se pudo guardar el archivo'], 500);
}

// ruta pública relativa
$publicRoot = realpath(__DIR__ . '/../../public');
$realFinal = realpath($final);
$publicUrl = '';
if ($publicRoot && $realFinal && str_starts_with($realFinal, $publicRoot)){
  $publicUrl = '/pagbateria/public' . str_replace($publicRoot, '', $realFinal);
} else {
  // fallback generando ruta relativa esperada
  $publicUrl = '/pagbateria/public' . str_replace('\\', '/', substr($final, strpos($final, '/public')));
}

send_json([
  'success' => true,
  'archivo' => [
    'nombre' => basename($final),
    'ruta' => $publicUrl,
    'tipo' => $type,
  ]
]);
