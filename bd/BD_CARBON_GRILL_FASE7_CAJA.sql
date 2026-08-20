-- ==============================================================================
-- CARBON GRILL — FASE 7: Caja, cuentas divididas y cobro interno
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 6).
-- Sin XML SUNAT ni correlativos legales (eso es Fase 8).
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

-- Pedido saldado (no se reabre comanda; la mesa pasa a LIMPIEZA)
ALTER TABLE `pedido`
  MODIFY COLUMN `estado` ENUM(
    'PENDIENTE_CONFIRMACION','CONFIRMADO','EN_PREPARACION','LISTO','ENTREGADO','PAGADO','ANULADO'
  ) NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION';

-- ---------- TURNO DE CAJA ----------
CREATE TABLE IF NOT EXISTS `caja_turno` (
  `id_turno` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `id_cajero` int NOT NULL,
  `estado` ENUM('ABIERTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  `monto_apertura` decimal(12,2) NOT NULL DEFAULT 0.00,
  `monto_cierre_esperado` decimal(12,2) DEFAULT NULL,
  `monto_cierre_contado` decimal(12,2) DEFAULT NULL,
  `diferencia` decimal(12,2) DEFAULT NULL,
  `fecha_apertura` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_cierre` datetime DEFAULT NULL,
  `notas` varchar(255) DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_turno`),
  KEY `idx_turno_sucursal` (`id_sucursal`, `estado`),
  KEY `idx_turno_cajero` (`id_cajero`),
  CONSTRAINT `fk_turno_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_turno_cajero` FOREIGN KEY (`id_cajero`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_turno_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_turno_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Un turno ABIERTO por sucursal (se valida en servicio).';

-- ---------- CUENTA (una por pedido cobrable) ----------
CREATE TABLE IF NOT EXISTS `cuenta` (
  `id_cuenta` int NOT NULL AUTO_INCREMENT,
  `id_pedido` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `id_mesa` int NOT NULL,
  `id_turno` int DEFAULT NULL COMMENT 'Turno que abrió/tocó por última vez la cuenta',
  `estado` ENUM('ABIERTA','PARCIAL','PAGADA','ANULADA') NOT NULL DEFAULT 'ABIERTA',
  `tipo_division` ENUM('COMPLETA','ITEMS','PARTES') DEFAULT NULL,
  `n_partes` tinyint NOT NULL DEFAULT 1,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `pagado` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_cuenta`),
  UNIQUE KEY `uk_cuenta_pedido` (`id_pedido`),
  KEY `idx_cuenta_sucursal` (`id_sucursal`, `estado`),
  KEY `idx_cuenta_mesa` (`id_mesa`),
  CONSTRAINT `fk_cta_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedido` (`id_pedido`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cta_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cta_mesa` FOREIGN KEY (`id_mesa`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cta_turno` FOREIGN KEY (`id_turno`) REFERENCES `caja_turno` (`id_turno`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cta_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cta_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Cuenta de cobro de un pedido. Totales recalculados en backend.';

CREATE TABLE IF NOT EXISTS `cuenta_item` (
  `id_cuenta_item` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `id_pedido_item` int NOT NULL,
  `monto` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('PENDIENTE','PAGADO') NOT NULL DEFAULT 'PENDIENTE',
  `id_cobro` int DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_cuenta_item`),
  UNIQUE KEY `uk_cuenta_item` (`id_cuenta`, `id_pedido_item`),
  KEY `idx_citem_cobro` (`id_cobro`),
  CONSTRAINT `fk_citem_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuenta` (`id_cuenta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_citem_item` FOREIGN KEY (`id_pedido_item`) REFERENCES `pedido_item` (`id_pedido_item`) ON DELETE RESTRICT,
  CONSTRAINT `fk_citem_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Ítems cobrables (líneas padre). Split por ítems marca PAGADO aquí.';

CREATE TABLE IF NOT EXISTS `cuenta_parte` (
  `id_cuenta_parte` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `n_parte` tinyint NOT NULL,
  `monto` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('PENDIENTE','PAGADA') NOT NULL DEFAULT 'PENDIENTE',
  `id_cobro` int DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_cuenta_parte`),
  UNIQUE KEY `uk_cuenta_parte` (`id_cuenta`, `n_parte`),
  CONSTRAINT `fk_cparte_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuenta` (`id_cuenta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cparte_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Partes iguales de una cuenta.';

-- ---------- COBRO ----------
CREATE TABLE IF NOT EXISTS `cobro` (
  `id_cobro` int NOT NULL AUTO_INCREMENT,
  `id_cuenta` int NOT NULL,
  `id_turno` int NOT NULL,
  `modo` ENUM('COMPLETA','ITEMS','PARTES') NOT NULL,
  `monto` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('REGISTRADO','ANULADO') NOT NULL DEFAULT 'REGISTRADO',
  `fecha_cobro` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notas` varchar(255) DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_cobro`),
  KEY `idx_cobro_cuenta` (`id_cuenta`),
  KEY `idx_cobro_turno` (`id_turno`, `fecha_cobro`),
  CONSTRAINT `fk_cobro_cuenta` FOREIGN KEY (`id_cuenta`) REFERENCES `cuenta` (`id_cuenta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cobro_turno` FOREIGN KEY (`id_turno`) REFERENCES `caja_turno` (`id_turno`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cobro_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cobro_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Pago interno. Sin serie SUNAT.';

CREATE TABLE IF NOT EXISTS `cobro_medio` (
  `id_cobro_medio` int NOT NULL AUTO_INCREMENT,
  `id_cobro` int NOT NULL,
  `medio` ENUM('EFECTIVO','TARJETA','YAPE','PLIN') NOT NULL,
  `monto` decimal(12,2) NOT NULL DEFAULT 0.00,
  `recibido` decimal(12,2) DEFAULT NULL COMMENT 'Solo EFECTIVO: billete entregado',
  `vuelto` decimal(12,2) DEFAULT NULL COMMENT 'Solo EFECTIVO',
  `referencia` varchar(80) DEFAULT NULL COMMENT 'Últimos 4, celular Yape/Plin, etc.',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_cobro_medio`),
  KEY `idx_cmedio_cobro` (`id_cobro`),
  KEY `idx_cmedio_medio` (`medio`),
  CONSTRAINT `fk_cmedio_cobro` FOREIGN KEY (`id_cobro`) REFERENCES `cobro` (`id_cobro`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cmedio_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Medios mixtos. Yape/Plin conciliación manual (sin webhook).';

-- FK diferidas (cuenta_item/parte → cobro) si no existen
SET @fk1 := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cuenta_item' AND CONSTRAINT_NAME = 'fk_citem_cobro'
);
SET @sql1 := IF(
  @fk1 = 0,
  'ALTER TABLE `cuenta_item` ADD CONSTRAINT `fk_citem_cobro` FOREIGN KEY (`id_cobro`) REFERENCES `cobro` (`id_cobro`) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @fk2 := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cuenta_parte' AND CONSTRAINT_NAME = 'fk_cparte_cobro'
);
SET @sql2 := IF(
  @fk2 = 0,
  'ALTER TABLE `cuenta_parte` ADD CONSTRAINT `fk_cparte_cobro` FOREIGN KEY (`id_cobro`) REFERENCES `cobro` (`id_cobro`) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- ---------- PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'CAJA', 'Caja y cobro' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'CAJA');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_caja' AS codigo, 'Ver turno y cuentas por cobrar' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'abrir_turno', 'Abrir turno de caja', 'CREATE' UNION ALL
  SELECT 'cerrar_turno', 'Cerrar turno de caja', 'UPDATE' UNION ALL
  SELECT 'cobrar', 'Registrar cobro (mixto / dividido)', 'CREATE' UNION ALL
  SELECT 'ver_precuenta', 'Imprimir o descargar pre-cuenta PDF', 'READ' UNION ALL
  SELECT 'pedir_cuenta', 'Marcar mesa pidiendo cuenta', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'CAJA'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_caja', 'abrir_turno', 'cerrar_turno', 'cobrar', 'ver_precuenta', 'pedir_cuenta'
)
WHERE r.nombre IN ('ADMIN_SUCURSAL', 'CAJA')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion = 'pedir_cuenta'
WHERE r.nombre = 'MOZO'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
