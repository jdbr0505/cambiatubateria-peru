<?php
/**
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de página (marca-config.js). Mismo patrón que pagina_fotos.php y
 * whatsapp.php: intenta la BD y cae al JSON local si no hay conexión.
 *
 * Bug real que corrige esta reescritura: la versión anterior tenía
 * require_write_access() en TODOS los métodos, incluido GET — un visitante
 * normal (sin sesión de admin) recibía 401 al pedir esta info, así que
 * jamás pudo usarse desde el sitio público.
 *
 * Esquema reducido a { brandName, logoFile }: metaTitle/metaDescription/nav/
 * footer que trae adminbateria/backend/api/sitio.php no tienen dónde
 * aplicarse — cada página real ya tiene su propio <title> distinto (SEO por
 * página, no uno global) y su propio pie de 4 columnas. Aplicar esos campos
 * tal cual aplanaría el SEO en vez de mejorarlo.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_sitio_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM sitio_config LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_sitio_available()) {
  $pdo = get_pdo();
  $fila = $pdo->query('SELECT brand_name, logo_file FROM sitio_config WHERE id = 1')->fetch();
  if ($fila) {
    send_json(['brandName' => $fila['brand_name'], 'logoFile' => $fila['logo_file']]);
  }
}

$dataFile = __DIR__ . '/../data/site.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  if (is_array($data)) {
    send_json(['brandName' => $data['brandName'] ?? null, 'logoFile' => $data['logoFile'] ?? null]);
  }
}

send_json(['brandName' => null, 'logoFile' => null]);
