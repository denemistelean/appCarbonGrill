-- ==============================================================================
-- CARBON GRILL — FASE 6: KDS / descuento de stock al pasar a EN_PREPARACION
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 5).
-- Sin tablas grandes nuevas. El REST de Fase 5 sigue siendo la fuente de verdad.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

-- Idempotencia: no descontar dos veces el mismo ítem si el KDS reintenta
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_item' AND COLUMN_NAME = 'stock_descontado'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `pedido_item` ADD COLUMN `stock_descontado` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''1 = BOM ya salió a kardex'' AFTER `estado_preparacion`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_item' AND INDEX_NAME = 'idx_item_kds'
);
SET @sql2 := IF(
  @idx = 0,
  'ALTER TABLE `pedido_item` ADD KEY `idx_item_kds` (`estado_preparacion`, `estacion`, `stock_descontado`)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idxk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kardex' AND INDEX_NAME = 'idx_kardex_motivo_detalle'
);
SET @sql3 := IF(
  @idxk = 0,
  'ALTER TABLE `kardex` ADD KEY `idx_kardex_motivo_detalle` (`motivo`, `detalle`(80))',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Permisos de pantalla KDS (misma gente de estación)
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'KDS', 'KDS cocina / bar' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'KDS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'ver_kds', 'Ver pantalla KDS en tiempo real', 'READ'
FROM `sis_modulo` m
WHERE m.nombre = 'KDS'
  AND NOT EXISTS (SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'ver_kds');

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'KDS'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_kds', 'ver_cocina', 'actualizar_preparacion')
WHERE r.nombre IN ('ADMIN_SUCURSAL', 'COCINA', 'BAR')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
