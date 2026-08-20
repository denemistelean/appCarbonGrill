-- ==============================================================================
-- CARBON GRILL — FASE 10: Reportes, cola ESC/POS y contingencia SUNAT
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 9).
-- No altera sis_* ni el algoritmo JWT.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'es_contingencia'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `comprobante` ADD COLUMN `es_contingencia` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''1 = emitido sin OSE; reintento masivo'' AFTER `estado`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idxc := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND INDEX_NAME = 'idx_comp_contingencia'
);
SET @sqlc := IF(
  @idxc = 0,
  'ALTER TABLE `comprobante` ADD KEY `idx_comp_contingencia` (`es_contingencia`, `estado`)',
  'SELECT 1'
);
PREPARE stmtc FROM @sqlc;
EXECUTE stmtc;
DEALLOCATE PREPARE stmtc;

SET @idxp := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido' AND INDEX_NAME = 'idx_pedido_fecha_estado'
);
SET @sqlp := IF(
  @idxp = 0,
  'ALTER TABLE `pedido` ADD KEY `idx_pedido_fecha_estado` (`id_sucursal`, `estado`, `fecha_confirma`)',
  'SELECT 1'
);
PREPARE stmtp FROM @sqlp;
EXECUTE stmtp;
DEALLOCATE PREPARE stmtp;

CREATE TABLE IF NOT EXISTS `cola_impresion` (
  `id_cola` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `tipo` ENUM('PRECUENTA','COMPROBANTE','COBRO') NOT NULL,
  `id_referencia` int NOT NULL COMMENT 'id_pedido o id_comprobante o id_cobro',
  `titulo` varchar(120) NOT NULL,
  `payload_texto` text NOT NULL,
  `payload_escpos` mediumblob NOT NULL,
  `estado` ENUM('PENDIENTE','IMPRESO','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  `intentos` int NOT NULL DEFAULT 0,
  `ultimo_error` varchar(255) DEFAULT NULL,
  `fecha_cola` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_impreso` datetime DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_cola`),
  KEY `idx_cola_suc_estado` (`id_sucursal`, `estado`, `fecha_cola`),
  CONSTRAINT `fk_cola_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cola_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cola_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Cola ESC/POS 80mm con reintento. Sin impresora física el ticket se descarga.';

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'REPORTES', 'Reportes y tickets' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'REPORTES');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_reporte' AS codigo, 'Ver reportes de ventas, platos, mermas y ocupación' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'exportar_reporte', 'Exportar reportes a Excel o PDF', 'READ' UNION ALL
  SELECT 'ver_cola_impresion', 'Ver cola de tickets térmicos', 'READ' UNION ALL
  SELECT 'imprimir_ticket', 'Encolar o descargar ticket ESC/POS', 'CREATE' UNION ALL
  SELECT 'reintentar_impresion', 'Reintentar o marcar ticket impreso', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'REPORTES'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'reintentar_ose', 'Reenviar lote de comprobantes en contingencia al OSE', 'SPECIAL'
FROM `sis_modulo` m
WHERE m.nombre = 'COMPROBANTES'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'reintentar_ose'
  );

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre IN ('REPORTES', 'COMPROBANTES')
  AND a.codigo_accion IN (
    'ver_reporte', 'exportar_reporte', 'ver_cola_impresion', 'imprimir_ticket',
    'reintentar_impresion', 'reintentar_ose'
  )
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_reporte', 'exportar_reporte', 'ver_cola_impresion', 'imprimir_ticket',
  'reintentar_impresion', 'reintentar_ose'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_reporte', 'ver_cola_impresion', 'imprimir_ticket', 'reintentar_impresion'
)
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
