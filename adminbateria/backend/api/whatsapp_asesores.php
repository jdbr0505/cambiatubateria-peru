<?php
/**
 * Lista de asesores de WhatsApp para el botón flotante (pestaña "WhatsApp",
 * debajo del número único de siempre). Pedido del jefe: poder agregar varios
 * números y que el visitante elija a quién escribir, como en el popover de
 * "El Mundo de las Baterías".
 *
 * OJO — esto NO es el viejo roster "agentes por marca de auto" que se quitó
 * en 73a7b44 (esa era una demo de otro rubro, nunca correspondió al
 * negocio). Es una lista nueva, genérica: nombre + rol + número, sin
 * relación con marcas de auto. El sitio público solo muestra el selector si
 * hay 2 o más asesores activos; con 0 o 1, el botón flotante sigue siendo un
 * link directo de toda la vida (whatsapp-config.js).
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pdo->exec('CREATE TABLE IF NOT EXISTS whatsapp_asesores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  rol VARCHAR(100) DEFAULT NULL,
  numero VARCHAR(15) NOT NULL,
  orden INT DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

/** 9-11 dígitos: mismo criterio que whatsapp.php para el número único. */
function numero_valido(string $n): bool {
  return (bool)preg_match('/^\d{9,11}$/', $n);
}

function list_asesores(PDO $pdo) {
  $rows = $pdo->query('SELECT id, nombre, rol, numero, orden, activo FROM whatsapp_asesores ORDER BY orden, id')->fetchAll();
  foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['orden'] = (int)$r['orden'];
    $r['activo'] = (bool)$r['activo'];
  }
  send_json(['asesores' => $rows]);
}

if ($method === 'GET') {
  list_asesores($pdo);
}

$body = json_decode(file_get_contents('php://input') ?: 'null', true);

if ($method === 'POST') {
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);
  $nombre = trim((string)($body['nombre'] ?? ''));
  $rol = trim((string)($body['rol'] ?? ''));
  $numero = trim((string)($body['numero'] ?? ''));
  if ($nombre === '') send_json(['error' => 'El nombre es obligatorio'], 422);
  if (!numero_valido($numero)) send_json(['error' => 'Número inválido: solo dígitos, 9 a 11 caracteres'], 422);

  $orden = (int)$pdo->query('SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM whatsapp_asesores')->fetch()['n'];
  $stmt = $pdo->prepare('INSERT INTO whatsapp_asesores (nombre, rol, numero, orden) VALUES (?, ?, ?, ?)');
  $stmt->execute([$nombre, $rol === '' ? null : $rol, $numero, $orden]);
  list_asesores($pdo);
}

if ($method === 'PUT') {
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);

  // Modo: reordenar en bloque — [{id, orden}, ...].
  if (isset($body['order']) && is_array($body['order'])) {
    $pdo->beginTransaction();
    try {
      $upd = $pdo->prepare('UPDATE whatsapp_asesores SET orden = ? WHERE id = ?');
      foreach ($body['order'] as $o) {
        $id = (int)($o['id'] ?? 0);
        $ord = (int)($o['orden'] ?? 0);
        if ($id > 0) $upd->execute([$ord, $id]);
      }
      $pdo->commit();
    } catch (Throwable $e) {
      $pdo->rollBack();
      send_json(['error' => $e->getMessage()], 500);
    }
    list_asesores($pdo);
  }

  // Modo normal: editar un asesor por id.
  $id = (int)($body['id'] ?? 0);
  if ($id <= 0) send_json(['error' => 'id requerido'], 422);
  $nombre = trim((string)($body['nombre'] ?? ''));
  $rol = trim((string)($body['rol'] ?? ''));
  $numero = trim((string)($body['numero'] ?? ''));
  $activo = array_key_exists('activo', $body) ? (int)(bool)$body['activo'] : 1;
  if ($nombre === '') send_json(['error' => 'El nombre es obligatorio'], 422);
  if (!numero_valido($numero)) send_json(['error' => 'Número inválido: solo dígitos, 9 a 11 caracteres'], 422);

  $stmt = $pdo->prepare('UPDATE whatsapp_asesores SET nombre = ?, rol = ?, numero = ?, activo = ? WHERE id = ?');
  $stmt->execute([$nombre, $rol === '' ? null : $rol, $numero, $activo, $id]);
  if ($stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
  list_asesores($pdo);
}

if ($method === 'DELETE') {
  $id = (int)($_GET['id'] ?? ($body['id'] ?? 0));
  if ($id <= 0) send_json(['error' => 'id requerido'], 422);
  $stmt = $pdo->prepare('DELETE FROM whatsapp_asesores WHERE id = ?');
  $stmt->execute([$id]);
  if ($stmt->rowCount() === 0) send_json(['error' => 'No encontrado'], 404);
  list_asesores($pdo);
}

send_json(['error' => 'Método no permitido'], 405);
