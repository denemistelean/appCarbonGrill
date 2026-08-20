-- ==============================================================================
-- CARBON GRILL — Traslados: almacén central ≠ local de atención
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 3).
-- No altera tablas sis_* (solo INSERT de módulo/acciones/permisos).
-- ==============================================================================
-- Modelo:
--   sucursal.tipo = LOCAL     → mesas, comandero, caja, SUNAT
--   sucursal.tipo = ALMACEN   → recibe del proveedor y despacha a locales
--   DISTRIBUCION              → ALMACEN → LOCAL
--   TRANSFERENCIA             → LOCAL ↔ LOCAL
-- Stock: SOLICITADO no mueve; EN_TRANSITO baja origen; RECIBIDO sube destino.
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- sucursal.tipo ----------
SET @col_tipo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursal' AND COLUMN_NAME = 'tipo'
);
SET @sql_tipo := IF(
  @col_tipo = 0,
  'ALTER TABLE `sucursal` ADD COLUMN `tipo` ENUM(''LOCAL'',''ALMACEN'') NOT NULL DEFAULT ''LOCAL'' COMMENT ''LOCAL = atención; ALMACEN = depósito, no es un local'' AFTER `telefono`',
  'SELECT 1'
);
PREPARE stmt_tipo FROM @sql_tipo;
EXECUTE stmt_tipo;
DEALLOCATE PREPARE stmt_tipo;

UPDATE `sucursal` SET `tipo` = 'LOCAL' WHERE `tipo` IS NULL OR `tipo` = '';

-- ---------- Almacén central (no es PRINCIPAL) ----------
INSERT INTO `sucursal` (`codigo`, `nombre`, `direccion`, `tipo`, `codigo_establecimiento_sunat`, `id_usuario_crea`)
SELECT 'ALM-CEN', 'ALMACEN CENTRAL', NULL, 'ALMACEN', NULL, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sucursal` WHERE `codigo` = 'ALM-CEN');

INSERT INTO `insumo_stock` (`id_insumo`, `id_sucursal`, `stock_actual`, `stock_minimo`, `costo_promedio`, `id_usuario_crea`)
SELECT i.id_insumo, s.id_sucursal, 0, 0, i.costo_unitario, 1
FROM `insumo` i
INNER JOIN `sucursal` s ON s.codigo = 'ALM-CEN' AND s.estado_registro = 'ACTIVO'
WHERE i.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `insumo_stock` st
    WHERE st.id_insumo = i.id_insumo AND st.id_sucursal = s.id_sucursal
  );

-- ---------- Motivos de merma en recepción / transporte ----------
ALTER TABLE `merma`
  MODIFY `motivo` ENUM(
    'CARNE_QUEMADA',
    'INSUMO_VENCIDO',
    'DESPERDICIO_CORTE',
    'ERROR_COMANDA',
    'OTRO',
    'MERMA_TRANSPORTE',
    'PRODUCTO_DANADO',
    'ERROR_CONTEO'
  ) NOT NULL;

-- ---------- Documento de traslado ----------
CREATE TABLE IF NOT EXISTS `traslado` (
  `id_traslado` int NOT NULL AUTO_INCREMENT,
  `tipo` ENUM('DISTRIBUCION','TRANSFERENCIA') NOT NULL,
  `id_origen` int NOT NULL,
  `id_destino` int NOT NULL,
  `estado` ENUM('SOLICITADO','APROBADO','EN_TRANSITO','RECIBIDO','RECHAZADO','CANCELADO') NOT NULL DEFAULT 'SOLICITADO',
  `motivo` varchar(255) DEFAULT NULL,
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_aprobacion` datetime DEFAULT NULL,
  `fecha_despacho` datetime DEFAULT NULL,
  `fecha_recepcion` datetime DEFAULT NULL,
  `id_usuario_solicita` int NOT NULL,
  `id_usuario_aprueba` int DEFAULT NULL,
  `id_usuario_despacha` int DEFAULT NULL,
  `id_usuario_recibe` int DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_traslado`),
  KEY `idx_traslado_estado` (`estado`, `fecha_solicitud`),
  KEY `idx_traslado_origen` (`id_origen`, `estado`),
  KEY `idx_traslado_destino` (`id_destino`, `estado`),
  CONSTRAINT `chk_traslado_distintos` CHECK (`id_origen` <> `id_destino`),
  CONSTRAINT `fk_traslado_origen` FOREIGN KEY (`id_origen`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_destino` FOREIGN KEY (`id_destino`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_solicita` FOREIGN KEY (`id_usuario_solicita`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_aprueba` FOREIGN KEY (`id_usuario_aprueba`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_despacha` FOREIGN KEY (`id_usuario_despacha`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_recibe` FOREIGN KEY (`id_usuario_recibe`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_traslado_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Distribución almacén→local o transferencia entre locales. No es el local de mesas.';

CREATE TABLE IF NOT EXISTS `traslado_item` (
  `id_traslado_item` int NOT NULL AUTO_INCREMENT,
  `id_traslado` int NOT NULL,
  `id_insumo` int NOT NULL,
  `id_lote_origen` int DEFAULT NULL,
  `id_lote_destino` int DEFAULT NULL,
  `cantidad_enviada` decimal(12,4) NOT NULL,
  `cantidad_recibida` decimal(12,4) DEFAULT NULL,
  `motivo_diferencia` ENUM('MERMA_TRANSPORTE','PRODUCTO_DANADO','ERROR_CONTEO','OTRO') DEFAULT NULL,
  `detalle_diferencia` varchar(255) DEFAULT NULL,
  `id_kardex_salida` int DEFAULT NULL,
  `id_kardex_entrada` int DEFAULT NULL,
  `id_merma` int DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_traslado_item`),
  KEY `idx_titem_traslado` (`id_traslado`),
  KEY `idx_titem_insumo` (`id_insumo`),
  CONSTRAINT `chk_titem_enviada` CHECK (`cantidad_enviada` > 0),
  CONSTRAINT `fk_titem_traslado` FOREIGN KEY (`id_traslado`) REFERENCES `traslado` (`id_traslado`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_lote_ori` FOREIGN KEY (`id_lote_origen`) REFERENCES `insumo_lote` (`id_lote`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_lote_dst` FOREIGN KEY (`id_lote_destino`) REFERENCES `insumo_lote` (`id_lote`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_ksal` FOREIGN KEY (`id_kardex_salida`) REFERENCES `kardex` (`id_kardex`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_kent` FOREIGN KEY (`id_kardex_entrada`) REFERENCES `kardex` (`id_kardex`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_merma` FOREIGN KEY (`id_merma`) REFERENCES `merma` (`id_merma`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_titem_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Ítems de traslado. Diferencia en recepción genera merma.';

-- ---------- Permisos ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'TRASLADOS', 'Traslados' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'TRASLADOS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_traslado' AS codigo, 'Ver solicitudes y documentos de traslado' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'solicitar_traslado', 'Crear solicitud de distribución o transferencia', 'CREATE' UNION ALL
  SELECT 'aprobar_traslado', 'Aprobar o rechazar un traslado (solo administración central)', 'UPDATE' UNION ALL
  SELECT 'despachar_traslado', 'Marcar salida / en tránsito (descuenta origen)', 'UPDATE' UNION ALL
  SELECT 'recibir_traslado', 'Confirmar recepción en destino', 'UPDATE' UNION ALL
  SELECT 'cancelar_traslado', 'Cancelar un traslado', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'TRASLADOS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'TRASLADOS'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion
  );

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo AND m.nombre = 'TRASLADOS'
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND a.codigo_accion IN ('ver_traslado', 'solicitar_traslado', 'despachar_traslado', 'recibir_traslado', 'cancelar_traslado')
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion
  );

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
