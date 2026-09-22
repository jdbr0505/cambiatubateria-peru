-- Migration: Normalize producto_compatibilidad for vehicle catalog + N:M associations
-- 1) Uniques to prevent duplicates
ALTER TABLE producto_compatibilidad
  ADD UNIQUE KEY IF NOT EXISTS uq_producto_vehiculo (producto_id, vehiculo_id);

-- Nota: múltiples NULL en índices únicos son permitidos en MySQL; esto no impedirá otras filas con valores NULL.

-- 2) Triggers to enforce row shapes
DROP TRIGGER IF EXISTS trg_pc_bi;
DROP TRIGGER IF EXISTS trg_pc_bu;
DELIMITER //
CREATE TRIGGER trg_pc_bi
BEFORE INSERT ON producto_compatibilidad
FOR EACH ROW
BEGIN
  -- Etiqueta libre para producto: permitido
  IF NEW.producto_id IS NOT NULL AND NEW.vehiculo_id IS NULL AND NEW.etiqueta IS NOT NULL THEN
    SET NEW.marca = NULL; SET NEW.modelo = NULL; SET NEW.anio_desde = NULL; SET NEW.anio_hasta = NULL;
    SET NEW.motor = NULL; SET NEW.`trim` = NULL;
  ELSEIF NEW.producto_id IS NULL THEN
    -- Catálogo de vehículo
    SET NEW.vehiculo_id = NULL;
    IF NEW.marca IS NULL OR NEW.marca = '' OR NEW.modelo IS NULL OR NEW.modelo = '' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Catálogo: marca y modelo son obligatorios';
    END IF;
  ELSE
    -- Asociación producto–vehículo
    IF NEW.vehiculo_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Asociación: vehiculo_id es obligatorio';
    END IF;
    SET NEW.etiqueta = NULL;
    SET NEW.marca = NULL; SET NEW.modelo = NULL; SET NEW.anio_desde = NULL; SET NEW.anio_hasta = NULL;
    SET NEW.motor = NULL; SET NEW.`trim` = NULL;
    IF (SELECT COUNT(1) FROM producto_compatibilidad v WHERE v.id = NEW.vehiculo_id AND v.producto_id IS NULL) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'vehiculo_id debe referenciar un vehículo de catálogo (producto_id IS NULL)';
    END IF;
  END IF;
END//
CREATE TRIGGER trg_pc_bu
BEFORE UPDATE ON producto_compatibilidad
FOR EACH ROW
BEGIN
  -- Etiqueta libre para producto: permitido
  IF NEW.producto_id IS NOT NULL AND NEW.vehiculo_id IS NULL AND NEW.etiqueta IS NOT NULL THEN
    SET NEW.marca = NULL; SET NEW.modelo = NULL; SET NEW.anio_desde = NULL; SET NEW.anio_hasta = NULL;
    SET NEW.motor = NULL; SET NEW.`trim` = NULL;
  ELSEIF NEW.producto_id IS NULL THEN
    -- Catálogo de vehículo
    SET NEW.vehiculo_id = NULL;
    IF NEW.marca IS NULL OR NEW.marca = '' OR NEW.modelo IS NULL OR NEW.modelo = '' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Catálogo: marca y modelo son obligatorios';
    END IF;
  ELSE
    -- Asociación producto–vehículo
    IF NEW.vehiculo_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Asociación: vehiculo_id es obligatorio';
    END IF;
    SET NEW.etiqueta = NULL;
    SET NEW.marca = NULL; SET NEW.modelo = NULL; SET NEW.anio_desde = NULL; SET NEW.anio_hasta = NULL;
    SET NEW.motor = NULL; SET NEW.`trim` = NULL;
    IF (SELECT COUNT(1) FROM producto_compatibilidad v WHERE v.id = NEW.vehiculo_id AND v.producto_id IS NULL) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'vehiculo_id debe referenciar un vehículo de catálogo (producto_id IS NULL)';
    END IF;
  END IF;
END//
DELIMITER ;

-- 3) Migración de datos históricos
-- 3.1 Crear filas de catálogo a partir de filas antiguas con datos de vehículo en líneas de producto
INSERT INTO producto_compatibilidad (producto_id, vehiculo_id, etiqueta, marca, modelo, anio_desde, anio_hasta, motor, `trim`)
SELECT NULL, NULL, NULL, t.marca, t.modelo, t.anio_desde, t.anio_hasta, t.motor, t.`trim`
FROM (
  SELECT DISTINCT marca, modelo, anio_desde, anio_hasta, motor, `trim`
  FROM producto_compatibilidad
  WHERE producto_id IS NOT NULL AND vehiculo_id IS NULL AND (marca IS NOT NULL OR modelo IS NOT NULL)
) t
LEFT JOIN producto_compatibilidad v
  ON v.producto_id IS NULL
 AND v.marca=t.marca AND v.modelo=t.modelo
 AND COALESCE(v.anio_desde,-1)=COALESCE(t.anio_desde,-1)
 AND COALESCE(v.anio_hasta,-1)=COALESCE(t.anio_hasta,-1)
 AND COALESCE(v.motor,'')=COALESCE(t.motor,'')
 AND COALESCE(v.`trim`,'')=COALESCE(t.`trim`,'')
WHERE v.id IS NULL;

-- 3.2 Apuntar asociaciones a catálogo y limpiar columnas de vehículo
UPDATE producto_compatibilidad pc
JOIN producto_compatibilidad v
  ON v.producto_id IS NULL
 AND v.marca=pc.marca AND v.modelo=pc.modelo
 AND COALESCE(v.anio_desde,-1)=COALESCE(pc.anio_desde,-1)
 AND COALESCE(v.anio_hasta,-1)=COALESCE(pc.anio_hasta,-1)
 AND COALESCE(v.motor,'')=COALESCE(pc.motor,'')
 AND COALESCE(v.`trim`,'')=COALESCE(pc.`trim`,'')
SET pc.vehiculo_id = v.id,
    pc.marca = NULL, pc.modelo = NULL,
    pc.anio_desde = NULL, pc.anio_hasta = NULL,
    pc.motor = NULL, pc.`trim` = NULL,
    pc.etiqueta = CASE WHEN pc.etiqueta IS NOT NULL THEN pc.etiqueta ELSE NULL END
WHERE pc.producto_id IS NOT NULL AND pc.vehiculo_id IS NULL AND (pc.marca IS NOT NULL OR pc.modelo IS NOT NULL);

-- 3.3 Eliminar filas inválidas: asociaciones sin vehiculo_id y sin etiqueta
DELETE FROM producto_compatibilidad
WHERE producto_id IS NOT NULL AND vehiculo_id IS NULL AND etiqueta IS NULL AND marca IS NULL AND modelo IS NULL AND anio_desde IS NULL AND anio_hasta IS NULL AND motor IS NULL AND `trim` IS NULL;
