<?php
/**
 * Lectura pública de la página Cobertura — sin sesión. La lista de zonas y
 * distritos, y los dos títulos de sección ("Cobertura confirmada",
 * "Atendemos siempre") estaban escritos a mano en cobertura.html sin ningún
 * campo en el panel — el jefe reportó que no podía editar esto.
 *
 * Mismo patrón que hero.php/nosotros.php: intenta la BD y cae al JSON local
 * si no hay conexión.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
  send_json(['error' => 'Método no permitido'], 405);
}

function db_cobertura_available(): bool {
  $pdo = get_pdo();
  if (!$pdo) return false;
  try {
    $pdo->query('SELECT 1 FROM pagina_cobertura LIMIT 1');
    $pdo->query('SELECT 1 FROM pagina_cobertura_zonas LIMIT 1');
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

if (db_cobertura_available()) {
  $pdo = get_pdo();
  $row = $pdo->query('SELECT * FROM pagina_cobertura WHERE id = 1')->fetch() ?: [];
  $zonasRows = $pdo->query('SELECT nombre, distritos FROM pagina_cobertura_zonas ORDER BY orden, id')->fetchAll();

  $zonas = [];
  foreach ($zonasRows as $z) {
    $zonas[] = [
      'nombre' => $z['nombre'],
      'distritos' => array_values(array_filter(array_map('trim', explode(',', (string)$z['distritos'])))),
    ];
  }

  if ($zonas) {
    send_json([
      'distritosTitulo'      => $row['distritos_titulo']       ?? null,
      'distritosBajada'      => $row['distritos_bajada']       ?? null,
      'horariosTitulo'       => $row['horarios_titulo']        ?? null,
      'horarioResumenTitulo' => $row['horario_resumen_titulo'] ?? null,
      'horarioResumenTexto'  => $row['horario_resumen_texto']  ?? null,
      'faqPregunta'          => $row['faq_pregunta']           ?? null,
      'faqRespuesta'         => $row['faq_respuesta']          ?? null,
      'zonas' => $zonas,
    ]);
  }
  // Sin zonas guardadas todavía: cae al respaldo (misma rama de abajo) para
  // no dejar la página sin distritos en una BD recién desplegada.
}

$dataFile = __DIR__ . '/../data/cobertura.json';
if (file_exists($dataFile)) {
  $raw = @file_get_contents($dataFile);
  $data = json_decode($raw, true);
  send_json(is_array($data) ? $data : []);
}

send_json(['zonas' => []]);
