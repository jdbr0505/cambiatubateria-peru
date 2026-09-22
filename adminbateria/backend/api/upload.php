<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST'){
  send_json(['error' => 'Método no permitido'], 405);
}

if (!isset($_FILES['archivo'])){
  send_json(['error' => 'Campo archivo requerido'], 422);
}

$type = isset($_POST['tipo']) ? trim($_POST['tipo']) : '';
$map = [
  'marca' => __DIR__ . '/../../../pagbateria/public/assets/img/marcbaterias/',
  'producto' => __DIR__ . '/../../../pagbateria/public/assets/img/productos/',
  'hero' => __DIR__ . '/../../../pagbateria/public/assets/img/hero/',
  'api' => __DIR__ . '/../../../pagbateria/public/assets/img/apis/',
  'logo' => __DIR__ . '/../../../pagbateria/public/assets/img/logos/',
  'vehiculo' => __DIR__ . '/../../../pagbateria/public/assets/img/carros/',
  // Fotos de página (pestaña "Fotos" del panel, pagina_fotos.php) — carpeta
  // distinta de 'hero': ahí ya viven las fotos reales que usan las páginas
  // rediseñadas (hero-instalacion.jpg, servicios-instalacion.jpg, etc.),
  // 'hero' es del carrusel del sitio anterior y usa otra carpeta.
  'pagina' => __DIR__ . '/../../../pagbateria/public/assets/img/optimizadas/',
];

$targetDir = $map[$type] ?? '';
if ($targetDir === ''){
  send_json(['error' => 'tipo inválido: marca|producto|hero|api|logo|vehiculo|pagina'], 422);
}
if (!is_dir($targetDir)) @mkdir($targetDir, 0777, true);

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
  send_json(['error' => 'No se pudo guardar'], 500);
}

$publicRoot = realpath(__DIR__ . '/../../../pagbateria/public');
$realFinal = realpath($final);
$publicUrl = '';
if ($publicRoot && $realFinal && str_starts_with($realFinal, $publicRoot)){
  $publicUrl = '/pagbateria/public' . str_replace($publicRoot, '', $realFinal);
}

send_json(['success' => true, 'ruta' => $publicUrl, 'nombre' => basename($final)]);
