<?php
// api/lib/config.php

function loadEnv(string $filePath): bool {
    if (!file_exists($filePath)) {
        return false;
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        // Ignorar comentarios o líneas vacías
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }

        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"'");

            if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
                putenv(sprintf('%s=%s', $name, $value));
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
    }
    return true;
}

// Cargar el archivo .env desde la raíz
$envPath = dirname(__DIR__, 2) . '/.env';
loadEnv($envPath);

/**
 * Lee una variable de entorno ya cargada por loadEnv().
 *
 * Una cadena vacía se trata como ausencia: una credencial en blanco es tan
 * inútil como la que falta, y devolverla provoca un error de conexión opaco
 * en vez de uno que nombre la variable culpable.
 */
function config_get(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

/**
 * Igual que config_get(), pero lanza si la variable no está definida.
 *
 * Los dos backends la usan para las credenciales de MySQL. Cada llamador
 * decide qué hacer con la excepción: pagbateria/ la captura y degrada a los
 * JSON de respaldo, adminbateria/ la deja propagar (ver el comentario en su
 * propio db.php).
 */
function config_require(string $key): string {
    $value = config_get($key);
    if ($value === null) {
        throw new RuntimeException(
            sprintf('Falta la variable de entorno obligatoria: %s', $key)
        );
    }
    return $value;
}

// Definición de constantes del sistema
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: '');
define('DB_USER', getenv('DB_USER') ?: '');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('APP_ENV', getenv('APP_ENV') ?: 'production');