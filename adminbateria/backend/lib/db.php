<?php
// Conexion PDO reutilizable a MySQL (nube o local).
// Las credenciales viven en el .env de la raiz del proyecto, nunca en el codigo.
require_once __DIR__ . '/../../../api/lib/config.php';

function db(): PDO {
  static $pdo = null;
  if ($pdo instanceof PDO) return $pdo;

  $dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    config_require('DB_HOST'),
    config_get('DB_PORT', '3306'),
    config_require('DB_NAME')
  );

  $options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    // Sin esto, un MySQL caído/lento deja al panel colgado ~20-30s (timeout
    // de red por defecto del SO) antes de mostrar el error real. 3s es de
    // sobra para una conexión sana.
    PDO::ATTR_TIMEOUT => 3,
  ];

  // Si tu proveedor requiere SSL, descomenta y ajusta la ruta al CA
  // $options[PDO::MYSQL_ATTR_SSL_CA] = __DIR__ . '/ca-cert.pem';
  // $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false; // evitar en produccion

  // Sin try/catch a proposito: ping_db.php y test-db.php ya capturan la
  // PDOException de una conexion fallida. Devolver null aqui romperia esos
  // llamadores, que asumen que db() siempre entrega un PDO utilizable.
  $pdo = new PDO($dsn, config_require('DB_USER'), config_require('DB_PASS'), $options);
  return $pdo;
}
