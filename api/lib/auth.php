<?php
// api/lib/auth.php — Guardián de sesión y CSRF para los endpoints de la API.
require_once __DIR__ . '/config.php';

function start_secure_session(): void {
    if (session_status() !== PHP_SESSION_NONE) return;

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => true,      // solo por HTTPS
        'httponly' => true,      // inaccesible desde JavaScript
        'samesite' => 'Strict',  // corta CSRF entre sitios
    ]);
    session_start();
}

function current_user(): ?array {
    // Sin cookie de sesión no hay nada que leer: arrancar una sesión aquí
    // crearía un archivo en disco por cada visitante anónimo del catálogo
    // público, que es justo el endpoint que debe responder más rápido.
    if (session_status() === PHP_SESSION_NONE && !isset($_COOKIE[session_name()])) {
        return null;
    }
    start_secure_session();
    return $_SESSION['user'] ?? null;
}

function require_auth(): array {
    $user = current_user();
    if ($user === null) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        exit(json_encode(['ok' => false, 'error' => 'No autenticado']));
    }
    return $user;
}

function issue_csrf_token(): string {
    start_secure_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void {
    start_secure_session();
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $stored = $_SESSION['csrf'] ?? '';
    // hash_equals evita filtrar el token por diferencia de tiempo de comparación.
    if ($stored === '' || !hash_equals($stored, $sent)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        exit(json_encode(['ok' => false, 'error' => 'Token CSRF inválido']));
    }
}

/** Exige sesión y CSRF en todo método que modifique datos. */
function require_write_access(): array {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        $user = require_auth();
        require_csrf();
        return $user;
    }
    return current_user() ?? [];
}
