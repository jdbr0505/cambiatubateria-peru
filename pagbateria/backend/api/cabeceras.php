<?php
/**
 * Título/bajada de bloques de texto que estaban escritos a mano en el HTML:
 * la cabecera oscura (.hero--page) de Catálogo, Servicios, Cobertura y
 * Contacto, más 3 bloques intermedios sumados después ("Cómo trabajamos" de
 * Servicios, y la franja "Sin sorpresas" + "Nuestro catálogo" de Inicio).
 * Nosotros ya tenía su propio endpoint (nosotros.php); Inicio usa hero.php
 * para su propio hero. Este cubre el resto de título/bajada sueltos.
 *
 * "pagina" ya no es literal una página — es la clave del bloque (ver
 * data-cabecera-rol="<clave>-titulo"/"<clave>-bajada" en el HTML). Se
 * mantiene el nombre para no tocar la tabla/columna ya en producción.
 *
 * Público, solo lectura, sin sesión — lo consume cualquier visitante en cada
 * carga de esas páginas (cabeceras-config.js). Mismo patrón que hero.php y
 * pagina_fotos.php: intenta la BD y cae al JSON local si no hay conexión.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

const CABECERAS_PAGINAS = ['catalogo', 'servicios', 'cobertura', 'contacto', 'servicios-trabajo', 'inicio-franja', 'inicio-catalogo'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

// Respaldo: exactamente los textos que ya están horneados en el HTML hoy. Se
// carga PRIMERO para poder mezclarlo con lo que traiga la BD: si el admin
// guardó solo la cabecera de Catálogo, las otras 3 se toman del JSON — antes
// se descartaba el JSON entero en cuanto había una sola fila en la tabla, y
// las páginas no editadas se quedaban sin texto por el reemplazo del JS.
$respaldo = [];
$dataFile = __DIR__ . '/../data/cabeceras.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $decoded = json_decode($raw ?: 'null', true);
  if (is_array($decoded)) $respaldo = $decoded;
}

$items = $respaldo;

$pdo = get_pdo();
if ($pdo) {
  try {
    // Si la tabla no existe todavía (nadie ha guardado desde el panel), el
    // catch la cubre y nos quedamos con el respaldo — no es error, es el
    // primer estado normal del sitio.
    $rows = $pdo->query('SELECT pagina, titulo, bajada FROM pagina_cabeceras')->fetchAll();
    foreach ($rows as $r) {
      $pagina = $r['pagina'];
      // Fila con título/bajada vacíos: no pisa el respaldo — el admin puede
      // borrar accidentalmente un campo, y eso no debería vaciar el sitio.
      $titulo = $r['titulo'] !== null && $r['titulo'] !== '' ? $r['titulo'] : ($respaldo[$pagina]['titulo'] ?? null);
      $bajada = $r['bajada'] !== null && $r['bajada'] !== '' ? $r['bajada'] : ($respaldo[$pagina]['bajada'] ?? null);
      $items[$pagina] = ['titulo' => $titulo, 'bajada' => $bajada];
    }
  } catch (Throwable $e) {
    // Ignorado a propósito: nos quedamos con el respaldo. El detalle va al log.
    error_log('cabeceras.php público: ' . $e->getMessage());
  }
}

send_json(['items' => $items]);
