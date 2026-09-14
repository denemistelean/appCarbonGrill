-- ==============================================================================
-- CARBON GRILL — Carta visual por sucursal/local
-- Ejecutar UNA vez sobre app_carbon_grill
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

-- carta_vitrina.id_sucursal
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_vitrina' AND COLUMN_NAME = 'id_sucursal');
SET @sql := IF(@c = 0, 'ALTER TABLE `carta_vitrina` ADD COLUMN `id_sucursal` int DEFAULT NULL AFTER `id_carta_vitrina`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- carta_vitrina_tag.id_sucursal
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_vitrina_tag' AND COLUMN_NAME = 'id_sucursal');
SET @sql := IF(@c = 0, 'ALTER TABLE `carta_vitrina_tag` ADD COLUMN `id_sucursal` int DEFAULT NULL AFTER `id_tag`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- producto_sucursal.visible_carta / orden_carta (visibilidad por local)
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_sucursal' AND COLUMN_NAME = 'visible_carta');
SET @sql := IF(@c = 0, 'ALTER TABLE `producto_sucursal` ADD COLUMN `visible_carta` tinyint(1) NOT NULL DEFAULT 0 AFTER `precio_override`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_sucursal' AND COLUMN_NAME = 'orden_carta');
SET @sql := IF(@c = 0, 'ALTER TABLE `producto_sucursal` ADD COLUMN `orden_carta` int NOT NULL DEFAULT 0 AFTER `visible_carta`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Sucursal origen: PRINCIPAL o primer LOCAL activo
SET @id_origen := (
  SELECT id_sucursal FROM sucursal
  WHERE estado_registro = 'ACTIVO' AND tipo = 'LOCAL'
  ORDER BY CASE WHEN codigo = 'PRINCIPAL' THEN 0 ELSE id_sucursal END
  LIMIT 1
);

-- Asignar carta y tags existentes a la sucursal origen
UPDATE carta_vitrina SET id_sucursal = @id_origen WHERE id_sucursal IS NULL AND estado_registro = 'ACTIVO';
UPDATE carta_vitrina_tag SET id_sucursal = @id_origen WHERE id_sucursal IS NULL AND estado_registro = 'ACTIVO';

-- Visibilidad en carta por sucursal origen (desde producto.visible_carta global)
UPDATE producto_sucursal ps
INNER JOIN producto p ON p.id_producto = ps.id_producto AND p.estado_registro = 'ACTIVO'
SET ps.visible_carta = IF(p.visible_carta = 1, 1, 0),
    ps.orden_carta = COALESCE(NULLIF(ps.orden_carta, 0), p.orden_carta, 0)
WHERE ps.id_sucursal = @id_origen AND ps.estado_registro = 'ACTIVO';

-- Crear carta vacía para otros LOCALES sin configuración
INSERT INTO carta_vitrina (id_sucursal, nombre, tagline, promo, moneda, id_usuario_crea)
SELECT s.id_sucursal, CONCAT(s.nombre_comercial, ' — Carta'), NULL, NULL, 'S/', 1
FROM sucursal s
WHERE s.estado_registro = 'ACTIVO' AND s.tipo = 'LOCAL'
  AND NOT EXISTS (
    SELECT 1 FROM carta_vitrina cv
    WHERE cv.id_sucursal = s.id_sucursal AND cv.estado_registro = 'ACTIVO'
  );

-- FK e índice único (una carta activa por sucursal)
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_vitrina' AND CONSTRAINT_NAME = 'fk_cv_sucursal');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `carta_vitrina` ADD CONSTRAINT `fk_cv_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @uk := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_vitrina' AND INDEX_NAME = 'uk_cv_sucursal_activo');
SET @sql := IF(@uk = 0,
  'CREATE UNIQUE INDEX `uk_cv_sucursal_activo` ON `carta_vitrina` (`id_sucursal`, `estado_registro`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

COMMIT;
