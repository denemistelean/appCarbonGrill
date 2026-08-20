-- ==============================================================================
-- CARBON GRILL — FASE 9: Carta QR, pre-pedido y llamar mozo
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 8).
-- La ruta pública /m/:token no usa JWT de staff.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

ALTER TABLE `mesa`
  ADD COLUMN `token_qr` varchar(32) DEFAULT NULL COMMENT 'Token impreso estable del QR de mesa' AFTER `estado`;

ALTER TABLE `mesa`
  ADD UNIQUE KEY `uk_mesa_token_qr` (`token_qr`);

UPDATE `mesa`
SET `token_qr` = LOWER(REPLACE(UUID(), '-', ''))
WHERE `token_qr` IS NULL AND `estado_registro` = 'ACTIVO';

ALTER TABLE `pedido`
  ADD COLUMN `origen` ENUM('MOZO','QR') NOT NULL DEFAULT 'MOZO' AFTER `notas`,
  ADD COLUMN `id_sesion` int DEFAULT NULL AFTER `origen`;

CREATE TABLE IF NOT EXISTS `mesa_sesion` (
  `id_sesion` int NOT NULL AUTO_INCREMENT,
  `id_mesa` int NOT NULL,
  `token` varchar(48) NOT NULL COMMENT 'Token efímero: un uso por apertura de mesa',
  `expira_en` datetime NOT NULL,
  `ultimo_acceso` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado` ENUM('ACTIVA','CERRADA','EXPIRADA') NOT NULL DEFAULT 'ACTIVA',
  `id_pedido` int DEFAULT NULL,
  `fecha_apertura` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_cierre` datetime DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_sesion`),
  UNIQUE KEY `uk_sesion_token` (`token`),
  KEY `idx_sesion_mesa` (`id_mesa`, `estado`),
  CONSTRAINT `fk_ses_mesa` FOREIGN KEY (`id_mesa`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ses_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedido` (`id_pedido`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ses_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ses_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Sesión QR de mesa. Muere al cerrar cuenta, limpieza o inactividad.';

ALTER TABLE `pedido`
  ADD CONSTRAINT `fk_ped_sesion` FOREIGN KEY (`id_sesion`) REFERENCES `mesa_sesion` (`id_sesion`) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS `llamado_mozo` (
  `id_llamado` int NOT NULL AUTO_INCREMENT,
  `id_sesion` int NOT NULL,
  `id_mesa` int NOT NULL,
  `motivo` ENUM('AYUDA','CUENTA','PEDIDO','OTRO') NOT NULL DEFAULT 'AYUDA',
  `detalle` varchar(200) DEFAULT NULL,
  `estado` ENUM('PENDIENTE','ATENDIDO') NOT NULL DEFAULT 'PENDIENTE',
  `fecha_llamado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_atiende` datetime DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL COMMENT 'Staff sistema o 1 si viene del QR',
  `id_usuario_atiende` int DEFAULT NULL,
  PRIMARY KEY (`id_llamado`),
  KEY `idx_llamado_mesa` (`id_mesa`, `estado`),
  KEY `idx_llamado_sesion` (`id_sesion`),
  CONSTRAINT `fk_llam_sesion` FOREIGN KEY (`id_sesion`) REFERENCES `mesa_sesion` (`id_sesion`) ON DELETE RESTRICT,
  CONSTRAINT `fk_llam_mesa` FOREIGN KEY (`id_mesa`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_llam_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_llam_atiende` FOREIGN KEY (`id_usuario_atiende`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Llamado al mozo desde la carta QR.';

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'CARTA', 'Carta QR' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'CARTA');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_qr_mesa' AS codigo, 'Ver y mostrar QR de mesa' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'gestionar_sesion_qr', 'Abrir o cerrar sesión QR de mesa', 'SPECIAL' UNION ALL
  SELECT 'ver_llamado', 'Ver llamados al mozo', 'READ' UNION ALL
  SELECT 'atender_llamado', 'Marcar llamado al mozo como atendido', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'CARTA'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'CARTA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_qr_mesa', 'gestionar_sesion_qr', 'ver_llamado', 'atender_llamado'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_qr_mesa', 'gestionar_sesion_qr', 'ver_llamado', 'atender_llamado'
)
WHERE r.nombre = 'MOZO'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_llamado', 'atender_llamado')
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
