<?php
/**
 * Panel admin — pestaña Cobertura. La página real (cobertura.html) tenía dos
 * bloques escritos a mano sin ningún campo en el panel: la lista de zonas +
 * distritos ("Lima Moderna: San Isidro, Miraflores...") y el título de
 * "Horarios" — el jefe reportó que no podía tocar esto desde el panel.
 *
 * Las zonas son una lista abierta (a diferencia de las 4 tarjetas fijas de
 * Nosotros/Servicios): el negocio agrega distritos según va creciendo su
 * cobertura, así que el PUT reemplaza la lista entera en cada guardado
 * (mismo patrón que el reordenar de marcas.php) en vez de upsert por slug.
 */

require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();

$pdo = db();

$pdo->exec("CREATE TABLE IF NOT EXISTS pagina_cobertura (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  distritos_titulo VARCHAR(200) NULL,
  distritos_bajada TEXT NULL,
  horarios_titulo VARCHAR(200) NULL,
  horario_resumen_titulo VARCHAR(200) NULL,
  horario_resumen_texto TEXT NULL,
  faq_pregunta VARCHAR(200) NULL,
  faq_respuesta TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/**
 * Instalaciones existentes ya tenían la tabla sin estas 4 columnas — el
 * FAQ de horarios se sumó después. Guardia por columna (información_schema),
 * mismo patrón que cita_texto en nosotros.php: ADD COLUMN falla en el
 * segundo intento si no se revisa primero.
 */
function cobertura_asegurar_columnas_faq(PDO $pdo): void {
  $columnas = ['horario_resumen_titulo' => 'VARCHAR(200) NULL', 'horario_resumen_texto' => 'TEXT NULL', 'faq_pregunta' => 'VARCHAR(200) NULL', 'faq_respuesta' => 'TEXT NULL'];
  foreach ($columnas as $nombre => $tipo) {
    try {
      $existe = $pdo->query(
        "SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'pagina_cobertura' AND column_name = '$nombre'"
      )->fetch();
      if ((int)($existe['c'] ?? 0) === 0) {
        $pdo->exec("ALTER TABLE pagina_cobertura ADD COLUMN $nombre $tipo");
      }
    } catch (Throwable $e) {
      // Si no se puede inspeccionar/alterar, la consulta de abajo da su
      // propio error claro; no se traga nada crítico en silencio.
    }
  }
}
cobertura_asegurar_columnas_faq($pdo);

$pdo->exec("CREATE TABLE IF NOT EXISTS pagina_cobertura_zonas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  distritos TEXT NULL,
  orden INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/** Valores por defecto que el sitio público ya muestra — mismo patrón que nosotros.php/servicios.php. */
function cobertura_defaults(): array {
  $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/cobertura.json') ?: 'null', true);
  return is_array($def) ? $def : [];
}

function cobertura_leer(PDO $pdo): array {
  $def = cobertura_defaults();
  $row = $pdo->query('SELECT * FROM pagina_cobertura WHERE id = 1')->fetch() ?: [];
  $zonas = $pdo->query('SELECT nombre, distritos FROM pagina_cobertura_zonas ORDER BY orden, id')->fetchAll();

  $out = [
    'distritosTitulo'     => $row['distritos_titulo']       ?? $def['distritosTitulo']     ?? null,
    'distritosBajada'     => $row['distritos_bajada']        ?? $def['distritosBajada']     ?? null,
    'horariosTitulo'      => $row['horarios_titulo']         ?? $def['horariosTitulo']      ?? null,
    'horarioResumenTitulo' => $row['horario_resumen_titulo'] ?? $def['horarioResumenTitulo'] ?? null,
    'horarioResumenTexto'  => $row['horario_resumen_texto']  ?? $def['horarioResumenTexto']  ?? null,
    'faqPregunta'          => $row['faq_pregunta']           ?? $def['faqPregunta']          ?? null,
    'faqRespuesta'         => $row['faq_respuesta']          ?? $def['faqRespuesta']          ?? null,
    'zonas' => [],
  ];

  if ($zonas) {
    foreach ($zonas as $z) {
      $out['zonas'][] = [
        'nombre' => $z['nombre'],
        'distritos' => array_values(array_filter(array_map('trim', explode(',', (string)$z['distritos'])))),
      ];
    }
  } else {
    // Nadie guardó zonas todavía: mostrar las del JSON, igual que Nosotros/
    // Servicios pre-rellenan sus tarjetas en una BD recién desplegada.
    $out['zonas'] = $def['zonas'] ?? [];
  }

  return $out;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  send_json(cobertura_leer($pdo));
}

if ($method === 'PUT' || $method === 'POST') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) send_json(['error' => 'JSON inválido'], 400);

  $pdo->exec("INSERT INTO pagina_cobertura (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");
  $cur = $pdo->query('SELECT * FROM pagina_cobertura WHERE id = 1')->fetch();

  $valor = function ($campoJson, $campoDb) use ($body, $cur) {
    if (!array_key_exists($campoJson, $body)) return $cur[$campoDb] ?? null;
    $v = trim((string)$body[$campoJson]);
    return $v === '' ? null : $v;
  };

  $stmt = $pdo->prepare('UPDATE pagina_cobertura SET
    distritos_titulo = ?, distritos_bajada = ?, horarios_titulo = ?,
    horario_resumen_titulo = ?, horario_resumen_texto = ?, faq_pregunta = ?, faq_respuesta = ?
    WHERE id = 1');
  $stmt->execute([
    $valor('distritosTitulo', 'distritos_titulo'),
    $valor('distritosBajada', 'distritos_bajada'),
    $valor('horariosTitulo', 'horarios_titulo'),
    $valor('horarioResumenTitulo', 'horario_resumen_titulo'),
    $valor('horarioResumenTexto', 'horario_resumen_texto'),
    $valor('faqPregunta', 'faq_pregunta'),
    $valor('faqRespuesta', 'faq_respuesta'),
  ]);

  if (isset($body['zonas']) && is_array($body['zonas'])) {
    $pdo->beginTransaction();
    try {
      $pdo->exec('DELETE FROM pagina_cobertura_zonas');
      $ins = $pdo->prepare('INSERT INTO pagina_cobertura_zonas (nombre, distritos, orden) VALUES (?, ?, ?)');
      $orden = 0;
      foreach ($body['zonas'] as $z) {
        $nombre = trim((string)($z['nombre'] ?? ''));
        $lista = is_array($z['distritos'] ?? null) ? $z['distritos'] : [];
        $distritos = implode(', ', array_values(array_filter(array_map(fn($d) => trim((string)$d), $lista))));
        if ($nombre === '' && $distritos === '') continue;
        $ins->execute([$nombre, $distritos, $orden]);
        $orden++;
      }
      $pdo->commit();
    } catch (Throwable $e) {
      $pdo->rollBack();
      send_json(['error' => 'No se pudieron guardar las zonas', 'detail' => $e->getMessage()], 400);
    }
  }

  send_json(cobertura_leer($pdo));
}

send_json(['error' => 'Método no permitido'], 405);
