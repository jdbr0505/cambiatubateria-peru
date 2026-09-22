<?php
/**
 * Nombre de marca + logo: ahora sí afectan el sitio real (nav+footer de las
 * 9 páginas con nav, vía pagbateria/backend/api/sitio.php + marca-config.js).
 * metaTitle/metaDescription/footer/nav quedaron fuera a propósito: cada
 * página real ya tiene su propio <title> SEO distinto y su propio pie de 4
 * columnas — ese esquema nunca tuvo dónde aplicarse en el sitio real.
 *
 * defaults.coreDiscount es la excepción: SÍ es un campo vivo hoy (se
 * propaga a productos.core_descuento, que products.php ya expone al
 * catálogo real) — se mantiene sin tocar.
 *
 * defaults.coreDiscountTexto es la misma idea para el TEXTO de la línea
 * verde ("entregando tu batería usada"): un solo campo global que, al
 * guardar, se propaga a TODOS los productos a la vez (igual que el monto),
 * no una edición producto por producto.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pdo->exec('CREATE TABLE IF NOT EXISTS sitio_config (
  id INT PRIMARY KEY,
  brand_name VARCHAR(255) DEFAULT NULL,
  logo_file VARCHAR(512) DEFAULT NULL,
  meta_title VARCHAR(255) DEFAULT NULL,
  meta_description TEXT DEFAULT NULL,
  footer_text VARCHAR(255) DEFAULT NULL,
  footer_email VARCHAR(255) DEFAULT NULL,
  footer_phone VARCHAR(64) DEFAULT NULL,
  footer_year INT DEFAULT NULL,
  core_descuento INT DEFAULT 300,
  core_descuento_texto VARCHAR(255) DEFAULT \'entregando tu batería usada\'
)');

// Instalaciones existentes: sitio_config y productos ya existían antes de
// este campo. ADD COLUMN idempotente, mismo patrón que cobertura/nosotros.
$colSitio = $pdo->query("SELECT COUNT(*) AS c FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'sitio_config' AND column_name = 'core_descuento_texto'")->fetch();
if ((int)($colSitio['c'] ?? 0) === 0) {
  $pdo->exec("ALTER TABLE sitio_config ADD COLUMN core_descuento_texto VARCHAR(255) DEFAULT 'entregando tu batería usada'");
}
$colProd = $pdo->query("SELECT COUNT(*) AS c FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'productos' AND column_name = 'core_descuento_texto'")->fetch();
if ((int)($colProd['c'] ?? 0) === 0) {
  $pdo->exec("ALTER TABLE productos ADD COLUMN core_descuento_texto VARCHAR(255) DEFAULT 'entregando tu batería usada'");
}

if ($method === 'GET') {
  $exists = $pdo->query('SELECT COUNT(*) AS c FROM sitio_config WHERE id = 1')->fetch();
  if ((int)($exists['c'] ?? 0) === 0) {
    $ins = $pdo->prepare('INSERT INTO sitio_config (id, brand_name, core_descuento) VALUES (1, ?, ?)');
    $ins->execute(['CambiaTuBatería', 300]);
  }

  $row = $pdo->query('SELECT brand_name, logo_file, core_descuento, core_descuento_texto FROM sitio_config WHERE id = 1')->fetch();
  send_json([
    'brandName' => $row['brand_name'] ?? null,
    'logoFile' => $row['logo_file'] ?? null,
    'defaults' => [
      'coreDiscount' => (int)($row['core_descuento'] ?? 300),
      'coreDiscountTexto' => $row['core_descuento_texto'] ?: 'entregando tu batería usada',
    ],
  ]);
}

if ($method === 'PUT') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) {
    send_json(['error' => 'JSON inválido'], 400);
  }

  $cur = $pdo->query('SELECT brand_name, logo_file, core_descuento, core_descuento_texto FROM sitio_config WHERE id = 1')->fetch() ?: [];
  $brandName = array_key_exists('brandName', $body) ? trim((string)($body['brandName'] ?? '')) : ($cur['brand_name'] ?? '');
  $logoFile = array_key_exists('logoFile', $body) ? ($body['logoFile'] ?: null) : ($cur['logo_file'] ?? null);
  $coreDiscount = isset($body['defaults']['coreDiscount'])
    ? (int)$body['defaults']['coreDiscount']
    : (int)($cur['core_descuento'] ?? 300);
  $coreDiscountTexto = isset($body['defaults']['coreDiscountTexto'])
    ? trim((string)$body['defaults']['coreDiscountTexto'])
    : ($cur['core_descuento_texto'] ?? 'entregando tu batería usada');
  if ($coreDiscountTexto === '') $coreDiscountTexto = 'entregando tu batería usada';

  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare(
      'INSERT INTO sitio_config (id, brand_name, logo_file, core_descuento, core_descuento_texto) VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE brand_name = VALUES(brand_name), logo_file = VALUES(logo_file), core_descuento = VALUES(core_descuento), core_descuento_texto = VALUES(core_descuento_texto)'
    );
    $stmt->execute([$brandName, $logoFile, $coreDiscount, $coreDiscountTexto]);

    // Propagar el descuento global (monto + texto) a los productos —
    // mismo comportamiento que ya existía para el monto.
    $pdo->prepare('UPDATE productos SET core_descuento = ?, core_descuento_texto = ?')->execute([$coreDiscount, $coreDiscountTexto]);

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    send_json(['error' => $e->getMessage()], 500);
  }

  send_json(['success' => true]);
}

send_json(['error' => 'Método no permitido'], 405);
