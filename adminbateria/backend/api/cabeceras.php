<?php
/**
 * Escritura del título/bajada de las cabeceras de Catálogo, Servicios,
 * Cobertura y Contacto, más 3 bloques intermedios ("Cómo trabajamos" de
 * Servicios; franja "Sin sorpresas" y "Nuestro catálogo" de Inicio) — ver
 * el público pagbateria/backend/api/cabeceras.php para el detalle. Mismo
 * patrón que pagina_fotos.php: slugs fijos, sin admitir cualquier valor.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

const PAGINAS = ['catalogo', 'servicios', 'cobertura', 'contacto', 'servicios-trabajo', 'inicio-franja', 'inicio-catalogo'];

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pdo->exec('CREATE TABLE IF NOT EXISTS pagina_cabeceras (
  pagina VARCHAR(20) PRIMARY KEY,
  titulo VARCHAR(150) DEFAULT NULL,
  bajada VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

if ($method === 'GET') {
  $rows = $pdo->query('SELECT pagina, titulo, bajada FROM pagina_cabeceras')->fetchAll();
  $items = [];
  foreach ($rows as $r) {
    $items[$r['pagina']] = ['titulo' => $r['titulo'], 'bajada' => $r['bajada']];
  }
  // Nadie guardó todavía: el panel se pre-rellena con los mismos valores por
  // defecto que el sitio público muestra (cabeceras.json), en vez de enseñar
  // 4 formularios vacíos que hacen parecer que el contenido "no existe".
  $faltantes = array_diff(PAGINAS, array_keys($items));
  if ($faltantes) {
    $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/cabeceras.json') ?: 'null', true);
    if (is_array($def)) {
      foreach ($faltantes as $pagina) {
        if (isset($def[$pagina])) $items[$pagina] = $def[$pagina];
      }
    }
  }
  send_json(['items' => $items]);
}

if ($method === 'PUT') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body) || !isset($body['pagina'])) {
    send_json(['error' => 'JSON inválido: falta "pagina"'], 400);
  }
  $pagina = (string)$body['pagina'];
  if (!in_array($pagina, PAGINAS, true)) {
    send_json(['error' => 'Página desconocida: ' . $pagina], 422);
  }
  $titulo = trim((string)($body['titulo'] ?? ''));
  $bajada = trim((string)($body['bajada'] ?? ''));
  $titulo = $titulo === '' ? null : $titulo;
  $bajada = $bajada === '' ? null : $bajada;

  $stmt = $pdo->prepare(
    'INSERT INTO pagina_cabeceras (pagina, titulo, bajada) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), bajada = VALUES(bajada)'
  );
  $stmt->execute([$pagina, $titulo, $bajada]);

  send_json(['pagina' => $pagina, 'titulo' => $titulo, 'bajada' => $bajada]);
}

send_json(['error' => 'Método no permitido'], 405);
