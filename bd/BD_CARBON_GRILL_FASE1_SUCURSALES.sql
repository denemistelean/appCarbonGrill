-- ==============================================================================
-- CARBON GRILL — FASE 1: Sucursales, personal y roles operativos
-- Ejecutar UNA vez sobre app_carbon_grill (después del CORE).
-- No modifica tablas sis_* (solo INSERT de roles, módulos, acciones y usuarios).
-- ==============================================================================
-- Usuarios de prueba (correo = usuario de login, clave 123456):
--   mozo1    rol MOZO
--   caja1    rol CAJA
--   cocina1  rol COCINA
--   bar1     rol BAR (bebidas / tragos)
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- SUCURSAL ----------
CREATE TABLE IF NOT EXISTS `sucursal` (
  `id_sucursal` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `codigo_establecimiento_sunat` varchar(4) DEFAULT NULL COMMENT 'Código de local ante SUNAT (series Fase 8)',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_sucursal`),
  UNIQUE KEY `uk_sucursal_codigo` (`codigo`),
  CONSTRAINT `fk_sucursal_usuario_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sucursal_usuario_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Organización. Sucursales de Carbon Grill (stock y series independientes).';

INSERT INTO `sucursal` (`codigo`, `nombre`, `direccion`, `codigo_establecimiento_sunat`, `id_usuario_crea`)
SELECT 'PRINCIPAL', 'SUCURSAL PRINCIPAL', NULL, '0000', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sucursal` WHERE `codigo` = 'PRINCIPAL');

-- ---------- ASIGNACIÓN USUARIO ↔ SUCURSAL (historial, no ALTER sis_usuario) ----------
CREATE TABLE IF NOT EXISTS `sucursal_asignacion` (
  `id_asignacion` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `id_rol` int NOT NULL COMMENT 'Rol operativo vigente en ese período',
  `vigente_desde` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `vigente_hasta` datetime DEFAULT NULL COMMENT 'NULL = asignación actual',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_asignacion`),
  KEY `idx_asig_usuario_vigente` (`id_usuario`, `vigente_hasta`),
  KEY `idx_asig_sucursal` (`id_sucursal`),
  CONSTRAINT `fk_asig_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_asig_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_asig_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`) ON DELETE RESTRICT,
  CONSTRAINT `fk_asig_usuario_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_asig_usuario_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Historial de sucursal y función por trabajador. No altera sis_usuario.';

-- ---------- ROLES OPERATIVOS ----------
INSERT INTO `sis_rol` (`nombre`, `descripcion`)
SELECT 'ADMIN_SUCURSAL', 'Gerente de sucursal: opera solo su local'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sis_rol` WHERE `nombre` = 'ADMIN_SUCURSAL');

INSERT INTO `sis_rol` (`nombre`, `descripcion`)
SELECT 'MOZO', 'Comandero y mapa de mesas, acotado a su sucursal'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sis_rol` WHERE `nombre` = 'MOZO');

INSERT INTO `sis_rol` (`nombre`, `descripcion`)
SELECT 'CAJA', 'Cobro, división de cuenta y comprobantes de su sucursal'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sis_rol` WHERE `nombre` = 'CAJA');

INSERT INTO `sis_rol` (`nombre`, `descripcion`)
SELECT 'COCINA', 'KDS de estación de cocina / parrilla, acotado a su sucursal'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sis_rol` WHERE `nombre` = 'COCINA');

INSERT INTO `sis_rol` (`nombre`, `descripcion`)
SELECT 'BAR', 'KDS de barra: bebidas y tragos, acotado a su sucursal'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sis_rol` WHERE `nombre` = 'BAR');

-- ---------- USUARIOS DE PRUEBA (clave: 123456, mismo hash del CORE) ----------
INSERT INTO `sis_usuario` (`id_rol`, `nombres`, `apellidos`, `correo`, `password`)
SELECT r.id_rol, 'MOZO', 'UNO', 'mozo1', '$2b$10$BGlHSQGgS8b5iPw9zEh3SOP81mnYKQZ6zCHpWQUctlhDkuFTSBDYK'
FROM `sis_rol` r
WHERE r.nombre = 'MOZO'
  AND NOT EXISTS (SELECT 1 FROM `sis_usuario` u WHERE u.correo = 'mozo1');

INSERT INTO `sis_usuario` (`id_rol`, `nombres`, `apellidos`, `correo`, `password`)
SELECT r.id_rol, 'CAJA', 'UNO', 'caja1', '$2b$10$BGlHSQGgS8b5iPw9zEh3SOP81mnYKQZ6zCHpWQUctlhDkuFTSBDYK'
FROM `sis_rol` r
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_usuario` u WHERE u.correo = 'caja1');

INSERT INTO `sis_usuario` (`id_rol`, `nombres`, `apellidos`, `correo`, `password`)
SELECT r.id_rol, 'COCINA', 'UNO', 'cocina1', '$2b$10$BGlHSQGgS8b5iPw9zEh3SOP81mnYKQZ6zCHpWQUctlhDkuFTSBDYK'
FROM `sis_rol` r
WHERE r.nombre = 'COCINA'
  AND NOT EXISTS (SELECT 1 FROM `sis_usuario` u WHERE u.correo = 'cocina1');

INSERT INTO `sis_usuario` (`id_rol`, `nombres`, `apellidos`, `correo`, `password`)
SELECT r.id_rol, 'BAR', 'UNO', 'bar1', '$2b$10$BGlHSQGgS8b5iPw9zEh3SOP81mnYKQZ6zCHpWQUctlhDkuFTSBDYK'
FROM `sis_rol` r
WHERE r.nombre = 'BAR'
  AND NOT EXISTS (SELECT 1 FROM `sis_usuario` u WHERE u.correo = 'bar1');

-- Asignar personal de prueba a sucursal PRINCIPAL
INSERT INTO `sucursal_asignacion` (`id_usuario`, `id_sucursal`, `id_rol`, `id_usuario_crea`)
SELECT u.id_usuario, s.id_sucursal, u.id_rol, 1
FROM `sis_usuario` u
INNER JOIN `sucursal` s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
WHERE u.correo IN ('mozo1', 'caja1', 'cocina1', 'bar1')
  AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `sucursal_asignacion` a
    WHERE a.id_usuario = u.id_usuario AND a.vigente_hasta IS NULL AND a.estado_registro = 'ACTIVO'
  );

-- ---------- MÓDULOS Y PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'SUCURSALES', 'Sucursales' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'SUCURSALES');

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'PERSONAL', 'Personal' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'PERSONAL');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'ver_sucursal', 'Ver sucursales', 'READ' FROM sis_modulo m
WHERE m.nombre = 'SUCURSALES'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'ver_sucursal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'crear_sucursal', 'Crear sucursal', 'CREATE' FROM sis_modulo m
WHERE m.nombre = 'SUCURSALES'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'crear_sucursal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'actualizar_sucursal', 'Actualizar sucursal', 'UPDATE' FROM sis_modulo m
WHERE m.nombre = 'SUCURSALES'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'actualizar_sucursal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'eliminar_sucursal', 'Eliminar sucursal', 'DELETE' FROM sis_modulo m
WHERE m.nombre = 'SUCURSALES'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'eliminar_sucursal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'ver_personal', 'Ver personal y asignaciones de sucursal', 'READ' FROM sis_modulo m
WHERE m.nombre = 'PERSONAL'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'ver_personal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'asignar_personal', 'Reasignar sucursal y función de un trabajador', 'SPECIAL' FROM sis_modulo m
WHERE m.nombre = 'PERSONAL'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'asignar_personal');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, 'ver_historial_personal', 'Ver historial de asignaciones', 'READ' FROM sis_modulo m
WHERE m.nombre = 'PERSONAL'
  AND NOT EXISTS (SELECT 1 FROM sis_accion a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = 'ver_historial_personal');

-- SUPERADMIN: todas las acciones nuevas
INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre IN ('SUCURSALES', 'PERSONAL')
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion
  );

-- ADMIN_SUCURSAL: ver sucursales + gestionar personal (no crea/elimina sucursales)
INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_dashboard', 'ver_sucursal', 'ver_personal', 'asignar_personal', 'ver_historial_personal'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion
  );

-- MOZO / CAJA / COCINA / BAR: pueden entrar al sistema (dashboard). El resto llega en fases posteriores.
INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion = 'ver_dashboard'
WHERE r.nombre IN ('MOZO', 'CAJA', 'COCINA', 'BAR')
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion
  );

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
