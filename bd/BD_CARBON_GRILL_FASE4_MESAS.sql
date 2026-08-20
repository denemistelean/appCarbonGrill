-- ==============================================================================
-- CARBON GRILL — FASE 4: Mesas de salón por sucursal
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 1).
-- Sin pedidos ni QR (Fases 5 y 9). Estados editables a mano para validar UX.
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- MESAS ----------
CREATE TABLE IF NOT EXISTS `mesa` (
  `id_mesa` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `numero` varchar(10) NOT NULL COMMENT 'Etiqueta visible: M01, T02',
  `nombre` varchar(60) DEFAULT NULL COMMENT 'Alias opcional: Terraza VIP',
  `capacidad` tinyint NOT NULL DEFAULT 4,
  `zona` ENUM('SALON','TERRAZA','BAR') NOT NULL DEFAULT 'SALON',
  `estado` ENUM('LIBRE','OCUPADA','ESPERANDO_CONFIRMACION','COMIENDO','PIDIENDO_CUENTA','LIMPIEZA') NOT NULL DEFAULT 'LIBRE',
  `mesa_padre_id` int DEFAULT NULL COMMENT 'NULL = mesa independiente o principal de grupo unido',
  `pos_x` smallint NOT NULL DEFAULT 0 COMMENT 'Posición X en mapa (grid 0-100)',
  `pos_y` smallint NOT NULL DEFAULT 0 COMMENT 'Posición Y en mapa (grid 0-100)',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_mesa`),
  UNIQUE KEY `uk_mesa_suc_num` (`id_sucursal`, `numero`),
  KEY `idx_mesa_sucursal` (`id_sucursal`, `estado`),
  KEY `idx_mesa_padre` (`mesa_padre_id`),
  CONSTRAINT `fk_mesa_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mesa_padre` FOREIGN KEY (`mesa_padre_id`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mesa_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mesa_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Mesas del salón. Una sucursal no ve mesas de otra.';

-- ---------- HISTORIAL UNIR / SEPARAR ----------
CREATE TABLE IF NOT EXISTS `mesa_union` (
  `id_union` int NOT NULL AUTO_INCREMENT,
  `id_mesa_principal` int NOT NULL,
  `id_mesa_secundaria` int NOT NULL,
  `accion` ENUM('UNIR','SEPARAR') NOT NULL,
  `fecha_registro` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_union`),
  KEY `idx_union_principal` (`id_mesa_principal`),
  KEY `idx_union_secundaria` (`id_mesa_secundaria`),
  CONSTRAINT `fk_union_principal` FOREIGN KEY (`id_mesa_principal`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_union_secundaria` FOREIGN KEY (`id_mesa_secundaria`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_union_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Trazabilidad de mesas unidas o separadas.';

-- ---------- SEED PRINCIPAL (10 mesas + 1 unión de ejemplo M09+M10) ----------
INSERT INTO `mesa` (`id_sucursal`, `numero`, `nombre`, `capacidad`, `zona`, `estado`, `pos_x`, `pos_y`, `id_usuario_crea`)
SELECT s.id_sucursal, v.numero, v.nombre, v.capacidad, v.zona, v.estado, v.pos_x, v.pos_y, 1
FROM `sucursal` s
INNER JOIN (
  SELECT 'M01' AS numero, NULL AS nombre, 4 AS capacidad, 'SALON' AS zona, 'LIBRE' AS estado, 5 AS pos_x, 5 AS pos_y UNION ALL
  SELECT 'M02', NULL, 4, 'SALON', 'OCUPADA', 25, 5 UNION ALL
  SELECT 'M03', NULL, 2, 'SALON', 'COMIENDO', 45, 5 UNION ALL
  SELECT 'M04', NULL, 4, 'SALON', 'PIDIENDO_CUENTA', 65, 5 UNION ALL
  SELECT 'M05', NULL, 6, 'SALON', 'LIMPIEZA', 85, 5 UNION ALL
  SELECT 'M06', 'TERRAZA 1', 4, 'TERRAZA', 'LIBRE', 5, 35 UNION ALL
  SELECT 'M07', 'TERRAZA 2', 4, 'TERRAZA', 'ESPERANDO_CONFIRMACION', 25, 35 UNION ALL
  SELECT 'M08', NULL, 2, 'BAR', 'LIBRE', 45, 35 UNION ALL
  SELECT 'M09', NULL, 4, 'SALON', 'COMIENDO', 65, 35 UNION ALL
  SELECT 'M10', NULL, 4, 'SALON', 'COMIENDO', 85, 35
) v ON 1=1
WHERE s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
  AND NOT EXISTS (SELECT 1 FROM `mesa` m WHERE m.id_sucursal = s.id_sucursal AND m.numero = v.numero);

UPDATE `mesa` hijo
INNER JOIN `mesa` padre ON padre.numero = 'M09' AND padre.id_sucursal = hijo.id_sucursal
INNER JOIN `sucursal` s ON s.id_sucursal = hijo.id_sucursal AND s.codigo = 'PRINCIPAL'
SET hijo.mesa_padre_id = padre.id_mesa, hijo.estado = padre.estado
WHERE hijo.numero = 'M10' AND hijo.mesa_padre_id IS NULL AND hijo.estado_registro = 'ACTIVO';

INSERT INTO `mesa_union` (`id_mesa_principal`, `id_mesa_secundaria`, `accion`, `id_usuario_crea`)
SELECT p.id_mesa, h.id_mesa, 'UNIR', 1
FROM `mesa` p
INNER JOIN `mesa` h ON h.numero = 'M10' AND h.id_sucursal = p.id_sucursal
INNER JOIN `sucursal` s ON s.id_sucursal = p.id_sucursal AND s.codigo = 'PRINCIPAL'
WHERE p.numero = 'M09'
  AND NOT EXISTS (
    SELECT 1 FROM `mesa_union` u
    WHERE u.id_mesa_principal = p.id_mesa AND u.id_mesa_secundaria = h.id_mesa AND u.accion = 'UNIR'
  );

-- ---------- PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'MESAS', 'Mesas y salón' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'MESAS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_mesa' AS codigo, 'Ver mapa y listado de mesas' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_mesa', 'Registrar mesa en el salón', 'CREATE' UNION ALL
  SELECT 'actualizar_mesa', 'Editar mesa, estado, posición y uniones', 'UPDATE' UNION ALL
  SELECT 'eliminar_mesa', 'Eliminar mesa del mapa', 'DELETE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'MESAS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'MESAS'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_mesa', 'crear_mesa', 'actualizar_mesa', 'eliminar_mesa')
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_mesa', 'actualizar_mesa')
WHERE r.nombre = 'MOZO'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion = 'ver_mesa'
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
