-- ==============================================================================
-- CARBON GRILL — Emisor SUNAT por sucursal + permiso de consolidado
-- Ejecutar UNA vez. No altera sis_* (solo INSERT de acción/permiso).
-- Cada LOCAL factura con su propio RUC / credencial OSE.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

-- ---------- Columnas fiscales en sucursal ----------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'ruc');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `ruc` varchar(11) DEFAULT NULL COMMENT ''RUC emisor de este local'' AFTER `telefono`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'razon_social');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `razon_social` varchar(200) DEFAULT NULL AFTER `ruc`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'nombre_comercial');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `nombre_comercial` varchar(150) DEFAULT NULL AFTER `razon_social`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'ubigeo');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `ubigeo` varchar(6) DEFAULT NULL AFTER `nombre_comercial`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'departamento');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `departamento` varchar(50) DEFAULT NULL AFTER `ubigeo`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'provincia');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `provincia` varchar(50) DEFAULT NULL AFTER `departamento`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'distrito');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `distrito` varchar(50) DEFAULT NULL AFTER `provincia`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'direccion_fiscal');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `direccion_fiscal` varchar(255) DEFAULT NULL AFTER `distrito`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'nubefact_url');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `nubefact_url` varchar(255) DEFAULT NULL AFTER `codigo_establecimiento_sunat`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'nubefact_token');
SET @sql := IF(@c = 0, 'ALTER TABLE `sucursal` ADD COLUMN `nubefact_token` varchar(255) DEFAULT NULL AFTER `nubefact_url`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Seed emisor en PRINCIPAL si aún está vacío (valores de .env de ejemplo)
UPDATE `sucursal`
SET
  ruc = COALESCE(NULLIF(ruc, ''), '20123456789'),
  razon_social = COALESCE(NULLIF(razon_social, ''), 'CARBON GRILL SAC'),
  nombre_comercial = COALESCE(NULLIF(nombre_comercial, ''), 'CARBON GRILL'),
  ubigeo = COALESCE(NULLIF(ubigeo, ''), '150101'),
  departamento = COALESCE(NULLIF(departamento, ''), 'LIMA'),
  provincia = COALESCE(NULLIF(provincia, ''), 'LIMA'),
  distrito = COALESCE(NULLIF(distrito, ''), 'LIMA'),
  direccion_fiscal = COALESCE(NULLIF(direccion_fiscal, ''), direccion)
WHERE codigo = 'PRINCIPAL' AND estado_registro = 'ACTIVO';

COMMIT;
