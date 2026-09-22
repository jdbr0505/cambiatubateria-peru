<?php
require_once __DIR__ . '/../lib/response.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../../api/lib/auth.php';

start_secure_session();

try {
    $pdo = db();
} catch (Throwable $e) {
    // El detalle va al log del servidor, nunca al cuerpo de la respuesta:
    // getMessage() expone nombres de tablas, rutas y a veces credenciales.
    error_log('login.php DB error: ' . $e->getMessage());
    send_json(['ok' => false, 'error' => 'Servicio no disponible'], 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * Crea la tabla si falta, pero NO siembra ninguna cuenta.
 *
 * La versión anterior insertaba admin/admin cuando la tabla estaba vacía:
 * cada despliegue nuevo nacía con una puerta abierta que nadie recordaba
 * cerrar. El primer administrador se crea a mano (ver README).
 */
function ensure_users_table(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        nombre VARCHAR(120) DEFAULT NULL,
        email VARCHAR(160) DEFAULT NULL,
        rol VARCHAR(32) DEFAULT "admin",
        activo TINYINT(1) DEFAULT 1,
        intentos_fallidos INT NOT NULL DEFAULT 0,
        bloqueado_hasta DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )');

    // Instalaciones previas no tienen las columnas de bloqueo. Se añaden si
    // faltan, para que actualizar no obligue a migrar la base a mano.
    $columnas = $pdo->query("SHOW COLUMNS FROM usuarios LIKE 'intentos_fallidos'")->fetch();
    if (!$columnas) {
        $pdo->exec('ALTER TABLE usuarios
            ADD COLUMN intentos_fallidos INT NOT NULL DEFAULT 0,
            ADD COLUMN bloqueado_hasta DATETIME DEFAULT NULL');
    }
}

try {
    ensure_users_table($pdo);
} catch (Throwable $e) {
    error_log('login.php schema error: ' . $e->getMessage());
    send_json(['ok' => false, 'error' => 'Servicio no disponible'], 503);
}

// ---------------------------------------------------------------- GET
// Comprobación de sesión. Devuelve además el token CSRF, que el panel
// necesita para poder escribir tras el endurecimiento de los endpoints.
if ($method === 'GET') {
    $user = current_user();
    if ($user !== null) {
        send_json(['ok' => true, 'user' => $user, 'csrf' => issue_csrf_token()]);
    }
    send_json(['ok' => false, 'error' => 'No autenticado'], 401);
}

if ($method !== 'POST') {
    send_json(['ok' => false, 'error' => 'Método no permitido'], 405);
}

// --------------------------------------------------------------- POST
$body = json_decode(file_get_contents('php://input') ?: 'null', true);
if (!is_array($body)) {
    send_json(['ok' => false, 'error' => 'Solicitud inválida'], 400);
}

$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($username === '' || $password === '') {
    send_json(['ok' => false, 'error' => 'Credenciales incompletas'], 400);
}

/**
 * Mensaje único para cuenta inexistente, inactiva o contraseña errada.
 * Distinguirlos permitiría enumerar qué usuarios existen antes de atacar
 * la contraseña.
 */
const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos';

/** Hash de descarte, para gastar el mismo tiempo cuando el usuario no existe. */
const HASH_SEÑUELO = '$2y$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTU';

const MAX_INTENTOS = 5;
const BLOQUEO_SEGUNDOS = 900; // 15 minutos

try {
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
} catch (Throwable $e) {
    error_log('login.php query error: ' . $e->getMessage());
    send_json(['ok' => false, 'error' => 'Servicio no disponible'], 503);
}

// rol='tecnico' nunca fue pensado como una cuenta de panel — no una que
// deba entrar por login, en todo caso (el flujo de auxilio/GPS que lo
// motivó se quitó del sitio). Se mantiene el bloqueo como defensa en
// profundidad por si queda alguna fila 'tecnico' en la tabla: sin él
// entraría al panel COMPLETO con los mismos permisos que un admin — mismo
// mensaje genérico que credenciales inválidas, para no revelar que el rol
// existe.
if (!$user || (int)$user['activo'] !== 1 || $user['rol'] === 'tecnico') {
    // Se verifica contra un hash señuelo para que el tiempo de respuesta no
    // delate que la cuenta no existe.
    password_verify($password, HASH_SEÑUELO);
    send_json(['ok' => false, 'error' => CREDENCIALES_INVALIDAS], 401);
}

if ($user['bloqueado_hasta'] !== null && strtotime((string)$user['bloqueado_hasta']) > time()) {
    send_json(['ok' => false, 'error' => 'Cuenta bloqueada temporalmente. Intenta en unos minutos.'], 429);
}

// Solo bcrypt. Se elimina el respaldo que aceptaba contraseñas en texto
// plano guardadas en la columna password_hash: convertía cualquier volcado
// de la base de datos en acceso directo al panel.
if (!password_verify($password, (string)$user['password_hash'])) {
    $intentos = (int)$user['intentos_fallidos'] + 1;
    $bloqueo = $intentos >= MAX_INTENTOS
        ? date('Y-m-d H:i:s', time() + BLOQUEO_SEGUNDOS)
        : null;

    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
        ->execute([$intentos, $bloqueo, (int)$user['id']]);

    send_json(
        ['ok' => false, 'error' => CREDENCIALES_INVALIDAS],
        $bloqueo !== null ? 429 : 401
    );
}

// Autenticación correcta: se limpia el contador y se rota el identificador
// de sesión, para que un id conocido de antemano no quede autenticado.
$pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?')
    ->execute([(int)$user['id']]);

session_regenerate_id(true);

$_SESSION['user'] = [
    'id'       => (int)$user['id'],
    'username' => $user['username'],
    'nombre'   => $user['nombre'],
    'rol'      => $user['rol'],
];

send_json([
    'ok'   => true,
    'user' => $_SESSION['user'],
    'csrf' => issue_csrf_token(),
]);
