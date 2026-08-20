-- ==============================================================================
-- CARBON GRILL — POS mostrador, clientes e identity DNI/RUC
-- Ejecutar UNA vez (después de FASE 8). No altera sis_* (solo INSERT permisos).
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- Pedido de mostrador (sin ocupar mesa de salón)
SET @col_origen := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido' AND COLUMN_NAME = 'origen'
);
SET @sql_origen := IF(
  @col_origen > 0,
  'ALTER TABLE `pedido` MODIFY COLUMN `origen` ENUM(''MOZO'',''QR'',''POS'') NOT NULL DEFAULT ''MOZO''',
  'ALTER TABLE `pedido` ADD COLUMN `origen` ENUM(''MOZO'',''QR'',''POS'') NOT NULL DEFAULT ''MOZO'' AFTER `notas`'
);
PREPARE stmt_origen FROM @sql_origen;
EXECUTE stmt_origen;
DEALLOCATE PREPARE stmt_origen;

-- Mesa virtual POS por cada LOCAL (no aparece en el mapa de salón)
INSERT INTO `mesa` (`id_sucursal`, `numero`, `nombre`, `capacidad`, `zona`, `estado`, `pos_x`, `pos_y`, `id_usuario_crea`)
SELECT s.id_sucursal, 'POS', 'MOSTRADOR', 1, 'BAR', 'LIBRE', 0, 0, 1
FROM `sucursal` s
WHERE s.estado_registro = 'ACTIVO' AND s.tipo = 'LOCAL'
  AND NOT EXISTS (
    SELECT 1 FROM `mesa` m WHERE m.id_sucursal = s.id_sucursal AND m.numero = 'POS'
  );

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS `cliente` (
  `id_cliente` int NOT NULL AUTO_INCREMENT,
  `tipo_documento` ENUM('DNI','RUC','CE','PAS','OTRO') NOT NULL DEFAULT 'DNI',
  `numero_documento` varchar(20) NOT NULL,
  `razon_social` varchar(200) NOT NULL,
  `nombres` varchar(150) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `correo` varchar(150) DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_cliente`),
  UNIQUE KEY `uk_cliente_doc` (`tipo_documento`, `numero_documento`),
  KEY `idx_cliente_razon` (`razon_social`),
  CONSTRAINT `fk_cli_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Clientes de mostrador y facturación. Consulta DNI/RUC vía identity.';

INSERT INTO `cliente` (`tipo_documento`, `numero_documento`, `razon_social`, `id_usuario_crea`)
SELECT 'OTRO', '00000000', 'CLIENTES VARIOS', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `cliente` WHERE `numero_documento` = '00000000' AND `tipo_documento` = 'OTRO');

-- ---------- Documento interno (nota de venta / boleta simple, sin OSE) ----------
CREATE TABLE IF NOT EXISTS `documento_interno` (
  `id_documento` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `id_cuenta` int DEFAULT NULL,
  `id_cobro` int DEFAULT NULL,
  `tipo` ENUM('NOTA_VENTA','BOLETA_SIMPLE') NOT NULL,
  `serie` varchar(4) NOT NULL,
  `correlativo` int NOT NULL,
  `tipo_doc_cliente` ENUM('0','1','4','6','7') NOT NULL DEFAULT '0',
  `num_doc_cliente` varchar(15) DEFAULT NULL,
  `razon_social_cliente` varchar(200) NOT NULL,
  `direccion_cliente` varchar(255) DEFAULT NULL,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  `fecha_emision` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_documento`),
  UNIQUE KEY `uk_docint_suc_serie_nro` (`id_sucursal`, `serie`, `correlativo`, `tipo`),
  KEY `idx_docint_cuenta` (`id_cuenta`),
  CONSTRAINT `fk_docint_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_docint_cta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuenta` (`id_cuenta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_docint_cobro` FOREIGN KEY (`id_cobro`) REFERENCES `cobro` (`id_cobro`) ON DELETE RESTRICT,
  CONSTRAINT `fk_docint_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_docint_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Nota de venta y boleta simple. No se envían a SUNAT/OSE.';

-- ---------- Permisos ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'CLIENTES', 'Clientes' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'CLIENTES');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_cliente' AS codigo, 'Ver clientes' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_cliente', 'Crear cliente', 'CREATE' UNION ALL
  SELECT 'actualizar_cliente', 'Actualizar cliente', 'UPDATE' UNION ALL
  SELECT 'eliminar_cliente', 'Eliminar cliente', 'DELETE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'CLIENTES'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'POS', 'Venta mostrador' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'POS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_pos' AS codigo, 'Ver venta de mostrador' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_venta_pos', 'Registrar venta de mostrador', 'CREATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'POS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre IN ('CLIENTES', 'POS')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo AND m.nombre IN ('CLIENTES', 'POS')
WHERE r.nombre IN ('ADMIN_SUCURSAL', 'CAJA')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
