-- ==============================================================================
-- CARBON GRILL — FASE 8: Comprobantes electrónicos SUNAT (OSE/PSE)
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 7).
-- Emisión vía OSE homologado (Nubefact). No hay envío directo a SUNAT.
-- Contingencia offline se aplaza a Fase 10.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `comprobante_serie` (
  `id_serie` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `tipo` ENUM('01','03','07') NOT NULL COMMENT '01 Factura, 03 Boleta, 07 NC',
  `serie` varchar(4) NOT NULL,
  `correlativo_actual` int NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_serie`),
  UNIQUE KEY `uk_serie_suc_tipo` (`id_sucursal`, `tipo`, `serie`),
  CONSTRAINT `fk_cser_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cser_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cser_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Series y correlativos por sucursal. UNIQUE(sucursal, tipo, serie).';

CREATE TABLE IF NOT EXISTS `comprobante` (
  `id_comprobante` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `id_serie` int NOT NULL,
  `id_cuenta` int DEFAULT NULL,
  `id_cobro` int DEFAULT NULL,
  `id_comprobante_afectado` int DEFAULT NULL COMMENT 'NC: documento origen',
  `tipo` ENUM('01','03','07') NOT NULL,
  `serie` varchar(4) NOT NULL,
  `correlativo` int NOT NULL,
  `tipo_doc_cliente` ENUM('0','1','4','6','7') NOT NULL DEFAULT '0' COMMENT '0 sin doc, 1 DNI, 4 CE, 6 RUC, 7 pasaporte',
  `num_doc_cliente` varchar(15) DEFAULT NULL,
  `razon_social_cliente` varchar(200) NOT NULL,
  `direccion_cliente` varchar(255) DEFAULT NULL,
  `moneda` char(3) NOT NULL DEFAULT 'PEN',
  `op_gravada` decimal(12,2) NOT NULL DEFAULT 0.00,
  `igv` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('REGISTRADO','ENVIADO','ACEPTADO','RECHAZADO','ANULADO') NOT NULL DEFAULT 'REGISTRADO',
  `ose_hash` varchar(80) DEFAULT NULL,
  `ose_mensaje` varchar(500) DEFAULT NULL,
  `ose_enlace_pdf` varchar(500) DEFAULT NULL,
  `xml_enviado` mediumtext,
  `xml_cdr` mediumtext,
  `fecha_emision` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_comprobante`),
  UNIQUE KEY `uk_comp_suc_serie_nro` (`id_sucursal`, `serie`, `correlativo`),
  KEY `idx_comp_cuenta` (`id_cuenta`),
  KEY `idx_comp_estado` (`id_sucursal`, `estado`, `fecha_emision`),
  CONSTRAINT `fk_comp_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_serie` FOREIGN KEY (`id_serie`) REFERENCES `comprobante_serie` (`id_serie`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuenta` (`id_cuenta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_cobro` FOREIGN KEY (`id_cobro`) REFERENCES `cobro` (`id_cobro`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_afectado` FOREIGN KEY (`id_comprobante_afectado`) REFERENCES `comprobante` (`id_comprobante`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Comprobante electrónico. Totales recalculados en backend. XML/CDR se conservan.';

CREATE TABLE IF NOT EXISTS `comprobante_item` (
  `id_comprobante_item` int NOT NULL AUTO_INCREMENT,
  `id_comprobante` int NOT NULL,
  `id_cuenta_item` int DEFAULT NULL,
  `codigo` varchar(30) DEFAULT NULL,
  `descripcion` varchar(255) NOT NULL,
  `unidad` varchar(6) NOT NULL DEFAULT 'NIU',
  `cantidad` decimal(12,3) NOT NULL DEFAULT 1.000,
  `valor_unitario` decimal(12,4) NOT NULL DEFAULT 0.0000 COMMENT 'Sin IGV',
  `precio_unitario` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Con IGV',
  `op_gravada` decimal(12,2) NOT NULL DEFAULT 0.00,
  `igv` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_comprobante_item`),
  KEY `idx_citem_comp` (`id_comprobante`),
  KEY `idx_citem_cuenta_item` (`id_cuenta_item`),
  CONSTRAINT `fk_ci_comp` FOREIGN KEY (`id_comprobante`) REFERENCES `comprobante` (`id_comprobante`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ci_citem` FOREIGN KEY (`id_cuenta_item`) REFERENCES `cuenta_item` (`id_cuenta_item`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ci_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Líneas del comprobante. Precio de carta incluye IGV 18%.';

-- Series seed sucursal PRINCIPAL
INSERT INTO `comprobante_serie` (`id_sucursal`, `tipo`, `serie`, `correlativo_actual`, `id_usuario_crea`)
SELECT s.id_sucursal, v.tipo, v.serie, 0, 1
FROM `sucursal` s
INNER JOIN (
  SELECT '03' AS tipo, 'B001' AS serie UNION ALL
  SELECT '01', 'F001' UNION ALL
  SELECT '07', 'BC01' UNION ALL
  SELECT '07', 'FC01'
) v ON 1=1
WHERE s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `comprobante_serie` x
    WHERE x.id_sucursal = s.id_sucursal AND x.tipo = v.tipo AND x.serie = v.serie AND x.estado_registro = 'ACTIVO'
  );

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'COMPROBANTES', 'Comprobantes SUNAT' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'COMPROBANTES');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_comprobante' AS codigo, 'Ver listado y detalle de comprobantes' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'emitir_comprobante', 'Emitir boleta, factura o nota de crédito', 'CREATE' UNION ALL
  SELECT 'anular_comprobante', 'Anular o emitir NC de anulación', 'DELETE' UNION ALL
  SELECT 'ver_xml', 'Descargar XML enviado y CDR', 'READ' UNION ALL
  SELECT 'gestionar_serie', 'Crear series de comprobante por sucursal', 'CREATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'COMPROBANTES'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'COMPROBANTES'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_comprobante', 'emitir_comprobante', 'anular_comprobante', 'ver_xml', 'gestionar_serie'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_comprobante', 'emitir_comprobante', 'anular_comprobante', 'ver_xml'
)
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
