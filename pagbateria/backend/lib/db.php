<?php
// Conexion PDO reutilizable a MySQL.
// Las credenciales viven en el .env de la raiz del proyecto, nunca en el codigo.
// Base: cambiatu_BDbateria (ver BDbateria.sql)
require_once __DIR__ . '/../../../api/lib/config.php';

function get_pdo(): ?PDO {
  static $pdo = null;
  static $intentado = false;
  if ($pdo instanceof PDO) {
    return $pdo;
  }
  // Varios endpoints llaman get_pdo() más de una vez por request (ej.
  // pagina_fotos.php: una vez para comprobar disponibilidad, otra para leer).
  // Sin esto, una conexión fallida se reintentaba en cada llamada dentro de
  // la MISMA request — con el timeout de 3s de abajo, eso duplicaba la
  // espera. $intentado solo vive dentro de esta request (static no persiste
  // entre requests en PHP), así que no esconde una BD que vuelve a estar
  // disponible en la siguiente carga.
  if ($intentado) {
    return null;
  }
  $intentado = true;

  $options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    // Sin esto, un MySQL caído/lento hace que CADA endpoint público tarde
    // ~20-30s (timeout de red por defecto del SO) antes de caer al respaldo
    // JSON — la degradación documentada deja de ser "graceful", el visitante
    // ve la página colgada. 3s es de sobra para una conexión local/misma-red
    // sana; si no contesta en eso, algo real está mal y hay que caer al
    // respaldo ya, no seguir esperando.
    PDO::ATTR_TIMEOUT => 3,
  ];

  try {
    // El DSN se arma DENTRO del try a proposito: config_require() lanza cuando
    // falta una credencial, y este backend debe degradar a los JSON de respaldo,
    // no responder 500. Con el sprintf() afuera, un .env incompleto tumbaba los
    // diez endpoints publicos con un error fatal en vez de caer al fallback.
    $dsn = sprintf(
      'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
      config_require('DB_HOST'),
      config_get('DB_PORT', '3306'),
      config_require('DB_NAME')
    );
    $pdo = new PDO($dsn, config_require('DB_USER'), config_require('DB_PASS'), $options);
  } catch (Throwable $e) {
    // Retornar null si no hay conexion para permitir fallback a JSON.
    // El detalle va al log del servidor, nunca a la respuesta HTTP.
    error_log('DB connection failed: ' . $e->getMessage());
    $pdo = null;
  }
  return $pdo;
}
