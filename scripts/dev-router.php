<?php
/**
 * Router para el servidor embebido de PHP — SOLO DESARROLLO LOCAL.
 *
 *   npm run serve      # http://127.0.0.1:8000
 *
 * El servidor embebido no lee .htaccess, así que sin esto las URLs locales no
 * coinciden con las de producción: "/" da 404 y "/catalogo.html" tampoco
 * existe (el archivo real está en /pagbateria/public/). Reproduce solo las
 * reglas del .htaccess de la raíz que afectan al enrutamiento y a la caché,
 * que son las que cambian el comportamiento observable del sitio.
 *
 * Vive en scripts/ porque el .htaccess ya responde 404 a esa carpeta entera:
 * aunque se despliegue por error, no queda accesible desde el dominio.
 */

$root = dirname(__DIR__);
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

/**
 * CTB_SIN_DB=1 fuerza el camino de respaldo JSON sin esperar a que expire la
 * conexión.
 *
 * En local no hay MySQL, pero el .env sí trae el host de producción: cada
 * endpoint intentaba conectarse y tardaba ~4 s en rendirse. Con el servidor
 * embebido, que atiende de a una petición, una página que pide media docena de
 * endpoints se pasaba del timeout del cliente y el catálogo aparecía vacío —
 * un síntoma que no existe en producción.
 *
 * Apunta a un puerto cerrado de localhost: la conexión se rechaza al instante.
 * Se escribe en $_SERVER y $_ENV además de putenv() porque config.php solo
 * respeta una variable ya existente si está en uno de esos dos arreglos.
 */
if (getenv('CTB_SIN_DB') === '1') {
    foreach (['DB_HOST' => '127.0.0.1', 'DB_PORT' => '1'] as $clave => $valor) {
        putenv("$clave=$valor");
        $_ENV[$clave] = $valor;
        $_SERVER[$clave] = $valor;
    }
}

// Carpetas no públicas y el .env: el .htaccess las bloquea en producción.
if (preg_match('#^/(tests|scripts|docs|node_modules)(/|$)#', $uri) || preg_match('#^/\.env#', $uri)) {
    http_response_code(404);
    exit;
}

// Un archivo real se sirve tal cual (return false = lo entrega el servidor).
$real = $root . $uri;
if ($uri !== '/' && file_exists($real) && !is_dir($real)) {
    return false;
}

// /login -> adminbateria/login.html
if (preg_match('#^/login/?$#', $uri)) {
    $uri = '/adminbateria/login.html';
}

// Raíz -> index del sitio público.
if ($uri === '/' || $uri === '') {
    $uri = '/pagbateria/public/index.html';
}

// Reescritura general hacia /pagbateria/public (excluye admin).
if (!str_starts_with($uri, '/pagbateria/') && !str_starts_with($uri, '/adminbateria/')) {
    $candidato = '/pagbateria/public' . $uri;
    if (file_exists($root . $candidato)) {
        $uri = $candidato;
    }
}

$destino = $root . $uri;
if (!file_exists($destino)) {
    http_response_code(404);
    echo "404 — no existe $uri";
    exit;
}

if (str_ends_with($destino, '.php')) {
    $_SERVER['SCRIPT_FILENAME'] = $destino;
    require $destino;
    exit;
}

$tipos = [
    'html' => 'text/html; charset=UTF-8',
    'css'  => 'text/css; charset=UTF-8',
    'js'   => 'text/javascript; charset=UTF-8',
    'json' => 'application/json; charset=UTF-8',
    'webmanifest' => 'application/manifest+json',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'ico'  => 'image/x-icon',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'txt'  => 'text/plain; charset=UTF-8',
    'xml'  => 'application/xml; charset=UTF-8',
];
$ext = strtolower(pathinfo($destino, PATHINFO_EXTENSION));
header('Content-Type: ' . ($tipos[$ext] ?? 'application/octet-stream'));

// Mismas cabeceras de caché que el .htaccess: sin esto el Service Worker se
// comporta distinto en local que en producción, y ese desfase ya causó un bug
// real (estáticos viejos servidos junto a HTML nuevo).
if (in_array($ext, ['html', 'css', 'js', 'webmanifest'], true)) {
    header('Cache-Control: no-cache, must-revalidate');
} else {
    header('Cache-Control: public, max-age=86400');
}
if (basename($destino) === 'sw.js') {
    header('Service-Worker-Allowed: /');
    header('Cache-Control: no-cache');
}

readfile($destino);
