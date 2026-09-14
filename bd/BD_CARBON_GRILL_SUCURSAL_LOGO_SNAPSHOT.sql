-- ==============================================================================
-- CARBON GRILL — Logo por sucursal + snapshot emisor en comprobante
-- Ejecutar UNA vez sobre app_carbon_grill
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'logo_path');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `logo_path` varchar(500) DEFAULT NULL COMMENT ''Ruta relativa bajo uploads/'' AFTER `nombre_comercial`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'emisor_ruc');
SET @sql := IF(@c = 0, 'ALTER TABLE `comprobante` ADD COLUMN `emisor_ruc` varchar(11) DEFAULT NULL COMMENT ''Snapshot RUC al emitir'' AFTER `total`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'emisor_razon_social');
SET @sql := IF(@c = 0, 'ALTER TABLE `comprobante` ADD COLUMN `emisor_razon_social` varchar(200) DEFAULT NULL AFTER `emisor_ruc`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'emisor_nombre_comercial');
SET @sql := IF(@c = 0, 'ALTER TABLE `comprobante` ADD COLUMN `emisor_nombre_comercial` varchar(150) DEFAULT NULL AFTER `emisor_razon_social`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'emisor_logo_path');
SET @sql := IF(@c = 0, 'ALTER TABLE `comprobante` ADD COLUMN `emisor_logo_path` varchar(500) DEFAULT NULL AFTER `emisor_nombre_comercial`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

COMMIT;
