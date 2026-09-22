<?php
/**
 * El hero real es UNO solo, no un carrusel. Reducido a 3 campos de texto
 * plano: badge, título, bajada. Antes tenía también cta_texto/cta_subtexto
 * (la etiqueta del botón de GPS "Enviar mi ubicación") y catalogo_texto (el
 * botón "Ver todo el catálogo") — ambos botones se quitaron del sitio
 * público (GPS: WhatsApp pasa a ser 100% el canal; catálogo: lo reemplazó
 * el buscador horizontal por vehículo), así que esos campos quedaban
 * editando algo que ya no existe.
 */
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';
require_write_access();  // POST/PUT/PATCH/DELETE exigen sesión + CSRF

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pdo->exec('CREATE TABLE IF NOT EXISTS pagina_hero (
  id INT UNSIGNED PRIMARY KEY,
  badge VARCHAR(255) DEFAULT NULL,
  titulo VARCHAR(255) DEFAULT NULL,
  bajada VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
// Nota: una instalación vieja puede conservar las columnas cta_texto,
// cta_subtexto y catalogo_texto (ya no se leen ni se escriben desde acá) —
// quedan huérfanas en la tabla, sin efecto, no hace falta una migración
// para borrarlas.

function hero_row_to_json($fila) {
  return [
    'badge' => $fila['badge'] ?? null,
    'titulo' => $fila['titulo'] ?? null,
    'bajada' => $fila['bajada'] ?? null,
  ];
}

if ($method === 'GET') {
  $fila = $pdo->query('SELECT badge, titulo, bajada FROM pagina_hero WHERE id = 1')->fetch();
  if (!$fila) {
    // Nadie guardó el hero todavía: el panel se pre-rellena con los mismos
    // valores por defecto que el sitio público muestra (hero.json), en vez de
    // enseñar un formulario vacío que hace parecer que el hero "no existe".
    // Al guardar por primera vez (PUT) recién se crea la fila.
    $def = @json_decode(@file_get_contents(__DIR__ . '/../../../pagbateria/backend/data/hero.json') ?: 'null', true);
    if (is_array($def)) {
      send_json([
        'badge' => $def['badge'] ?? null,
        // hero.json trae 'titulo' => null a propósito (el título por defecto
        // real tiene <br> y un énfasis que un string plano no representa —
        // ver la nota en hero-config.js). Pero eso deja el campo del panel
        // en blanco, y desde el panel se ve como si el título "no existiera"
        // para editar. Solo en esta pre-carga del panel (nunca en el JSON
        // público ni en lo que ve el visitante) se rellena con la versión en
        // texto plano de ese mismo título, para que sea visible y editable —
        // guardarlo tal cual, sin cambios, no altera nada en el sitio público
        // porque coincide con el texto que ya se ve hoy.
        'titulo' => $def['titulo'] ?? 'El técnico llega hasta ti. Tú, tranquilo.',
        'bajada' => $def['bajada'] ?? null,
      ]);
    }
  }
  send_json(hero_row_to_json($fila ?: []));
}

if ($method === 'PUT') {
  $body = json_decode(file_get_contents('php://input') ?: 'null', true);
  if (!is_array($body)) {
    send_json(['error' => 'JSON inválido'], 400);
  }

  $cur = $pdo->query('SELECT badge, titulo, bajada FROM pagina_hero WHERE id = 1')->fetch() ?: [];
  /** @param string $campoJson @param string $campoDb */
  $valor = function (string $campoJson, string $campoDb) use ($body, $cur) {
    if (!array_key_exists($campoJson, $body)) return $cur[$campoDb] ?? null;
    $v = trim((string)($body[$campoJson] ?? ''));
    return $v === '' ? null : $v;
  };

  $badge = $valor('badge', 'badge');
  $titulo = $valor('titulo', 'titulo');
  $bajada = $valor('bajada', 'bajada');

  $stmt = $pdo->prepare(
    'INSERT INTO pagina_hero (id, badge, titulo, bajada) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE badge = VALUES(badge), titulo = VALUES(titulo), bajada = VALUES(bajada)'
  );
  $stmt->execute([$badge, $titulo, $bajada]);

  send_json(hero_row_to_json(['badge' => $badge, 'titulo' => $titulo, 'bajada' => $bajada]));
}

send_json(['error' => 'Método no permitido'], 405);
