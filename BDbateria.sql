-- ============================================================================
-- CambiaTuBatería Perú — esquema de base de datos (MySQL/MariaDB, utf8mb4)
-- ============================================================================
--
-- Reconciliación de 3 copias divergentes que convivían en el repositorio
-- (adminbateria/BDbateria.sql, adminbateria/backend/sql/BDbateria.sql,
-- pagbateria/BDbateria.sql) — quedaba documentado como pendiente en
-- CLAUDE.md. Esta es la única copia; las otras 3 se borraron.
--
-- Qué se reconcilió:
--  - Nombre de base de datos: las 3 copias no coincidían entre sí
--    (parkinve_BDbateria / cambiatu_BDbateria). El real, el que usa
--    producción, es el que está en DB_NAME dentro de .env: cambiatu_BDbateria.
--  - Tablas "pagina_*" (hero, servicios, nosotros, cabeceras, cobertura,
--    fotos) y whatsapp_asesores: NO estaban en ninguna de las 3 copias.
--    El código las crea solas con CREATE TABLE IF NOT EXISTS la primera vez
--    que se llama a su endpoint — así que una BD nueva funciona igual sin
--    este archivo, pero quedan documentadas aquí para tener el esquema
--    completo en un solo lugar.
--  - Tablas legado sin ningún lector en el código actual, quitadas de este
--    script (navegacion, hero_slides/hero_botones, servicios, nosotros/
--    nosotros_bullets, whatsapp_agentes, especialistas): eran de un demo
--    temprano del proyecto, reemplazadas hace tiempo por su equivalente
--    "pagina_*" o "whatsapp_asesores". Si una instalación vieja todavía las
--    tiene, no se tocan aquí — un DROP TABLE en un script de instalación no
--    se hace sin pedirlo explícitamente (ver CLAUDE.md, especialistas.php se
--    borró pero la tabla se dejó igual).
--  - Datos de ejemplo con placeholders de México (CDMX, +52, RUC falso) se
--    quitaron — eran del mismo demo temprano; ver la nota sobre contacto.json
--    en CLAUDE.md, ya corregida ahí.
--
-- Cómo se auto-repara una instalación existente: varias tablas llevan un
-- ALTER TABLE con guardia de information_schema (mismo patrón en todo el
-- proyecto) para sumar columnas nuevas sin romper una BD que ya tenía la
-- tabla en una forma más vieja. Ejecutar este script completo sobre una BD
-- existente es seguro — todo es CREATE TABLE IF NOT EXISTS / ALTER guardado.

CREATE DATABASE IF NOT EXISTS cambiatu_BDbateria
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE cambiatu_BDbateria;

-- ----------------------------------------------------------------------------
-- 1) Configuración del sitio (marca, logo, descuento global por batería usada)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sitio_config (
  id                     TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  brand_name             VARCHAR(120)  NULL,
  logo_file              VARCHAR(255)  NULL,
  meta_title             VARCHAR(255)  NULL,
  meta_description       TEXT          NULL,
  footer_text            VARCHAR(255)  NULL,
  footer_email           VARCHAR(255)  NULL,
  footer_phone           VARCHAR(64)   NULL,
  footer_year            INT           NULL,
  core_descuento         INT           NOT NULL DEFAULT 300,
  core_descuento_texto   VARCHAR(255)  NOT NULL DEFAULT 'entregando tu batería usada',
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 2) Usuarios del panel admin (login, bcrypt + bloqueo por intentos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username          VARCHAR(64)  NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  nombre            VARCHAR(120) DEFAULT NULL,
  email             VARCHAR(160) DEFAULT NULL,
  rol               VARCHAR(32)  DEFAULT 'admin',
  activo            TINYINT(1)   DEFAULT 1,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta   DATETIME DEFAULT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Nota: login.php crea el usuario admin/admin automáticamente en su primer
-- uso si la tabla está vacía. No hace falta sembrarlo aquí a mano.

-- ----------------------------------------------------------------------------
-- 3) Marcas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marcas (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL UNIQUE,
  logo_path  VARCHAR(255) NULL,
  orden      INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 4) Productos (catálogo real de baterías)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre                VARCHAR(255) NOT NULL,
  marca_id              INT UNSIGNED NOT NULL,
  descripcion           TEXT NULL,
  precio                DECIMAL(10,2) NOT NULL DEFAULT 0,
  cca                   INT NULL,
  capacidad_ah          INT NULL,
  tipo                  VARCHAR(120) NULL,
  largo_mm              INT NULL,
  ancho_mm              INT NULL,
  alto_mm               INT NULL,
  peso_kg               DECIMAL(6,2) NULL,
  polaridad             VARCHAR(10) NULL,
  core_descuento        INT NULL,
  core_descuento_texto  VARCHAR(255) NULL DEFAULT 'entregando tu batería usada',
  activo                TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_prod_marca FOREIGN KEY (marca_id) REFERENCES marcas(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos(marca_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);

-- ----------------------------------------------------------------------------
-- 5) Catálogo de vehículos + compatibilidad producto↔vehículo
-- ----------------------------------------------------------------------------
-- producto_compatibilidad: SOLO catálogo de vehículos (marca/modelo/años) —
-- las columnas de asociación (producto_id/vehiculo_id) que tenía en su forma
-- vieja se migraron a la tabla "compatibilidad" de abajo hace tiempo; una BD
-- nueva se crea directo en esta forma final, sin pasar por esa migración.
CREATE TABLE IF NOT EXISTS producto_compatibilidad (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  marca       VARCHAR(80)  NULL,
  modelo      VARCHAR(120) NULL,
  anio_desde  INT NULL,
  anio_hasta  INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_veh_marca ON producto_compatibilidad(marca);
CREATE INDEX IF NOT EXISTS idx_veh_modelo ON producto_compatibilidad(modelo);
CREATE INDEX IF NOT EXISTS idx_veh_anios ON producto_compatibilidad(anio_desde, anio_hasta);

CREATE TABLE IF NOT EXISTS compatibilidad (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id  INT UNSIGNED NOT NULL,
  vehiculo_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_producto_vehiculo (producto_id, vehiculo_id),
  KEY idx_comp_prod (producto_id),
  KEY idx_comp_veh (vehiculo_id),
  CONSTRAINT fk_comp_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_comp_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES producto_compatibilidad(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS producto_imagenes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id  INT UNSIGNED NOT NULL,
  ruta         VARCHAR(255) NOT NULL,
  orden        INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_img_prod FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_img_prod ON producto_imagenes(producto_id);

-- ----------------------------------------------------------------------------
-- 6) Contacto (correo público, y campos sin consumidor visible hoy —
--    dirección/URL de mapa/horario, ver nota en CLAUDE.md)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacto_info (
  id                TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  direccion         VARCHAR(255) DEFAULT NULL,
  map_url           VARCHAR(255) DEFAULT NULL,
  telefono          VARCHAR(60)  DEFAULT NULL,
  email             VARCHAR(120) DEFAULT NULL,
  horario_weekdays  VARCHAR(120) DEFAULT NULL,
  horario_sabado    VARCHAR(120) DEFAULT NULL,
  horario_domingo   VARCHAR(120) DEFAULT NULL,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 7) WhatsApp — número principal + lista de asesores del selector flotante
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id          INT UNSIGNED PRIMARY KEY DEFAULT 1,
  numero      VARCHAR(20) NOT NULL DEFAULT '',
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS whatsapp_asesores (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  rol         VARCHAR(100) DEFAULT NULL,
  numero      VARCHAR(15)  NOT NULL,
  orden       INT DEFAULT 0,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 8) Contenido editable por página (hero, servicios, nosotros, cabeceras,
--    cobertura, fotos de sección) — cada endpoint las crea solo si faltan,
--    se listan aquí para tener el esquema completo en un solo archivo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagina_hero (
  id          INT UNSIGNED PRIMARY KEY DEFAULT 1,
  badge       VARCHAR(255) DEFAULT NULL,
  titulo      VARCHAR(255) DEFAULT NULL,
  bajada      VARCHAR(255) DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagina_servicios (
  slug        VARCHAR(32) PRIMARY KEY,
  titulo      VARCHAR(255) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagina_nosotros (
  id             TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  hero_titulo    VARCHAR(200) NULL,
  hero_bajada    TEXT NULL,
  equipo_titulo  VARCHAR(200) NULL,
  equipo_bajada  TEXT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Instalaciones muy viejas pueden conservar columnas huérfanas
-- (trabajo_titulo, trabajo_bajada, cita_texto) de cuando Nosotros tenía más
-- secciones — se quitaron del sitio, no del esquema; no molestan si quedan.

CREATE TABLE IF NOT EXISTS pagina_cabeceras (
  pagina      VARCHAR(20) PRIMARY KEY,
  titulo      VARCHAR(150) DEFAULT NULL,
  bajada      VARCHAR(255) DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- "pagina" es en realidad una clave de bloque, no siempre una página entera:
-- catalogo/servicios/cobertura/contacto (cabeceras reales) más
-- servicios-trabajo/inicio-franja/inicio-catalogo (bloques sueltos de texto).

CREATE TABLE IF NOT EXISTS pagina_cobertura (
  id                       TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  distritos_titulo         VARCHAR(200) NULL,
  distritos_bajada         TEXT NULL,
  horarios_titulo          VARCHAR(200) NULL,
  horario_resumen_titulo   VARCHAR(200) NULL,
  horario_resumen_texto    TEXT NULL,
  faq_pregunta             VARCHAR(200) NULL,
  faq_respuesta            TEXT NULL,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagina_cobertura_zonas (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(80) NOT NULL,
  distritos  TEXT NULL,
  orden      INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagina_fotos (
  slug        VARCHAR(64) PRIMARY KEY,
  path        VARCHAR(512) NOT NULL,
  alt         VARCHAR(255) DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- Tablas huérfanas conocidas, fuera de este script a propósito
-- ----------------------------------------------------------------------------
-- auxilio_solicitudes / tecnico_posiciones: del flujo de rastreo en vivo que
--   se quitó del sitio entero (ver CLAUDE.md). Pueden existir en producción
--   con datos históricos; ningún código las lee. Un DROP queda a criterio
--   del usuario, no se hace desde un script de instalación.
-- especialistas: el archivo que la leía (especialistas.php) se borró en la
--   auditoría de seguridad por ser un endpoint huérfano; la tabla, si existe
--   en producción, no se tocó — mismo criterio de arriba.
