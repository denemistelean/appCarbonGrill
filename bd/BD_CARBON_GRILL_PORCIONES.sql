-- ==============================================================================
-- CARBON GRILL — Porciones vendibles (no insumos)
-- Ejecutar UNA vez sobre app_carbon_grill.
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `producto_porcion` (
  `id_porcion` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `precio` decimal(12,2) NOT NULL DEFAULT 0.00,
  `aplica_estacion` ENUM('TODAS','PARRILLA','COCINA','BAR') NOT NULL DEFAULT 'TODAS',
  `orden` int NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_porcion`),
  KEY `idx_porcion_est` (`aplica_estacion`, `estado_registro`),
  CONSTRAINT `fk_porcion_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_porcion_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Extras vendibles: papas, ensalada, etc.';

SET @ddl = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_porcion'
    ),
    'SELECT 1',
    'CREATE TABLE `pedido_porcion` (
      `id_pedido_porcion` int NOT NULL AUTO_INCREMENT,
      `id_pedido_item` int NOT NULL,
      `id_porcion` int NOT NULL,
      `precio` decimal(12,2) NOT NULL DEFAULT 0.00,
      `cantidad` decimal(12,3) NOT NULL DEFAULT 1.000,
      `estado_registro` ENUM(''ACTIVO'',''ELIMINADO'') NOT NULL DEFAULT ''ACTIVO'',
      `id_usuario_crea` int NOT NULL,
      PRIMARY KEY (`id_pedido_porcion`),
      KEY `idx_pporcion_item` (`id_pedido_item`),
      CONSTRAINT `fk_pporcion_item` FOREIGN KEY (`id_pedido_item`) REFERENCES `pedido_item` (`id_pedido_item`) ON DELETE RESTRICT,
      CONSTRAINT `fk_pporcion_cat` FOREIGN KEY (`id_porcion`) REFERENCES `producto_porcion` (`id_porcion`) ON DELETE RESTRICT
    ) ENGINE=InnoDB COMMENT=''Porciones vendidas en una línea de comanda'''
  )
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `producto_porcion` (`nombre`, `precio`, `aplica_estacion`, `orden`, `id_usuario_crea`)
SELECT v.nombre, v.precio, v.est, v.orden, 1
FROM (
  SELECT 'PAPAS FRITAS' AS nombre, 8.00 AS precio, 'TODAS' AS est, 10 AS orden UNION ALL
  SELECT 'PAPAS DORADAS', 9.00, 'TODAS', 20 UNION ALL
  SELECT 'ENSALADA', 6.00, 'TODAS', 30 UNION ALL
  SELECT 'ARROZ', 5.00, 'PARRILLA', 40 UNION ALL
  SELECT 'CAMOTE FRITO', 7.00, 'PARRILLA', 50
) v
WHERE NOT EXISTS (
  SELECT 1 FROM `producto_porcion` p WHERE p.nombre = v.nombre AND p.estado_registro = 'ACTIVO'
);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
