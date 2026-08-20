-- ==============================================================================
-- CARBON GRILL — FASE 5: Pedidos / comandero (sin descontar stock)
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 4).
-- El kardex por receta llega en Fase 6 (KDS → EN_PREPARACION).
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- PEDIDO ----------
CREATE TABLE IF NOT EXISTS `pedido` (
  `id_pedido` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `id_mesa` int NOT NULL,
  `id_mozo` int NOT NULL,
  `estado` ENUM('PENDIENTE_CONFIRMACION','CONFIRMADO','EN_PREPARACION','LISTO','ENTREGADO','ANULADO') NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION',
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `notas` varchar(255) DEFAULT NULL,
  `fecha_pedido` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_confirma` datetime DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_pedido`),
  KEY `idx_pedido_sucursal` (`id_sucursal`, `estado`),
  KEY `idx_pedido_mesa` (`id_mesa`, `estado`),
  CONSTRAINT `fk_ped_sucursal` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ped_mesa` FOREIGN KEY (`id_mesa`) REFERENCES `mesa` (`id_mesa`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ped_mozo` FOREIGN KEY (`id_mozo`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ped_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ped_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Comanda de mesa. Totales siempre recalculados en backend.';

-- ---------- ÍTEM ----------
CREATE TABLE IF NOT EXISTS `pedido_item` (
  `id_pedido_item` int NOT NULL AUTO_INCREMENT,
  `id_pedido` int NOT NULL,
  `id_producto` int NOT NULL,
  `id_item_padre` int DEFAULT NULL COMMENT 'Hijo de combo (no se cobra)',
  `cantidad` decimal(12,3) NOT NULL DEFAULT 1.000,
  `precio_unitario` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot al confirmar',
  `costo_receta_snapshot` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estacion` ENUM('COCINA','PARRILLA','BAR','NINGUNA') NOT NULL DEFAULT 'COCINA',
  `notas` varchar(255) DEFAULT NULL COMMENT 'Término de carne, guarnición, etc.',
  `persona_asociada` varchar(40) DEFAULT NULL,
  `estado_preparacion` ENUM('PENDIENTE','EN_PREPARACION','LISTO','ENTREGADO','ANULADO') NOT NULL DEFAULT 'PENDIENTE',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_pedido_item`),
  KEY `idx_item_pedido` (`id_pedido`),
  KEY `idx_item_estacion` (`estacion`, `estado_preparacion`),
  KEY `idx_item_padre` (`id_item_padre`),
  CONSTRAINT `fk_item_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedido` (`id_pedido`) ON DELETE RESTRICT,
  CONSTRAINT `fk_item_producto` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`) ON DELETE RESTRICT,
  CONSTRAINT `fk_item_padre` FOREIGN KEY (`id_item_padre`) REFERENCES `pedido_item` (`id_pedido_item`) ON DELETE RESTRICT,
  CONSTRAINT `fk_item_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_item_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Línea de comanda. Precio y costo de receta en snapshot.';

-- ---------- MODIFICADORES extra / sin ----------
CREATE TABLE IF NOT EXISTS `pedido_mod` (
  `id_pedido_mod` int NOT NULL AUTO_INCREMENT,
  `id_pedido_item` int NOT NULL,
  `id_insumo` int NOT NULL,
  `accion` ENUM('AGREGAR','QUITAR') NOT NULL,
  `cantidad` decimal(12,4) NOT NULL DEFAULT 1.0000,
  `costo_adicional` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_pedido_mod`),
  KEY `idx_mod_item` (`id_pedido_item`),
  CONSTRAINT `fk_mod_item` FOREIGN KEY (`id_pedido_item`) REFERENCES `pedido_item` (`id_pedido_item`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mod_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mod_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Extra o sin insumo sobre un ítem de comanda.';

-- ---------- SEED: comanda confirmada en M03 (COMIENDO) ----------
INSERT INTO `pedido` (`id_sucursal`, `id_mesa`, `id_mozo`, `estado`, `subtotal`, `total`, `notas`, `fecha_confirma`, `id_usuario_crea`)
SELECT s.id_sucursal, m.id_mesa, u.id_usuario, 'CONFIRMADO', 26.80, 26.80, 'Seed Fase 5', NOW(), u.id_usuario
FROM `sucursal` s
INNER JOIN `mesa` m ON m.id_sucursal = s.id_sucursal AND m.numero = 'M03' AND m.estado_registro = 'ACTIVO'
INNER JOIN `sis_usuario` u ON u.correo = 'mozo1' AND u.estado_registro = 'ACTIVO'
WHERE s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
  AND NOT EXISTS (SELECT 1 FROM `pedido` p WHERE p.notas = 'Seed Fase 5' AND p.id_mesa = m.id_mesa);

INSERT INTO `pedido_item` (`id_pedido`, `id_producto`, `cantidad`, `precio_unitario`, `costo_receta_snapshot`, `estacion`, `notas`, `estado_preparacion`, `id_usuario_crea`)
SELECT p.id_pedido, pr.id_producto, 1, 18.90, 8.2300, 'PARRILLA', 'TERMINO: MEDIO', 'PENDIENTE', p.id_mozo
FROM `pedido` p
INNER JOIN `producto` pr ON pr.codigo = 'HAMB-CLAS' AND pr.estado_registro = 'ACTIVO'
WHERE p.notas = 'Seed Fase 5'
  AND NOT EXISTS (
    SELECT 1 FROM `pedido_item` i WHERE i.id_pedido = p.id_pedido AND i.id_producto = pr.id_producto AND i.id_item_padre IS NULL
  );

INSERT INTO `pedido_item` (`id_pedido`, `id_producto`, `cantidad`, `precio_unitario`, `costo_receta_snapshot`, `estacion`, `notas`, `estado_preparacion`, `id_usuario_crea`)
SELECT p.id_pedido, pr.id_producto, 1, 7.90, 1.2000, 'COCINA', NULL, 'PENDIENTE', p.id_mozo
FROM `pedido` p
INNER JOIN `producto` pr ON pr.codigo = 'PAPAS' AND pr.estado_registro = 'ACTIVO'
WHERE p.notas = 'Seed Fase 5'
  AND NOT EXISTS (
    SELECT 1 FROM `pedido_item` i WHERE i.id_pedido = p.id_pedido AND i.id_producto = pr.id_producto AND i.id_item_padre IS NULL
  );

INSERT INTO `pedido_mod` (`id_pedido_item`, `id_insumo`, `accion`, `cantidad`, `costo_adicional`, `id_usuario_crea`)
SELECT i.id_pedido_item, ins.id_insumo, 'QUITAR', 20.0000, 0, ped.id_mozo
FROM `pedido` ped
INNER JOIN `pedido_item` i ON i.id_pedido = ped.id_pedido
INNER JOIN `producto` pr ON pr.id_producto = i.id_producto AND pr.codigo = 'HAMB-CLAS'
INNER JOIN `insumo` ins ON ins.nombre = 'CEBOLLA' AND ins.estado_registro = 'ACTIVO'
WHERE ped.notas = 'Seed Fase 5'
  AND NOT EXISTS (SELECT 1 FROM `pedido_mod` m WHERE m.id_pedido_item = i.id_pedido_item);

-- ---------- PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'PEDIDOS', 'Pedidos' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'PEDIDOS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_pedido' AS codigo, 'Ver comandas y carta operativa' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_pedido', 'Crear o editar comanda en borrador', 'CREATE' UNION ALL
  SELECT 'confirmar_pedido', 'Confirmar comanda y enviarla a estaciones', 'SPECIAL' UNION ALL
  SELECT 'anular_pedido', 'Anular comanda', 'DELETE' UNION ALL
  SELECT 'ver_cocina', 'Ver listado de estación (cocina/parrilla/bar)', 'READ' UNION ALL
  SELECT 'actualizar_preparacion', 'Cambiar estado de preparación del ítem', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'PEDIDOS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'PEDIDOS'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_pedido', 'crear_pedido', 'confirmar_pedido', 'anular_pedido', 'ver_cocina', 'actualizar_preparacion'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_pedido', 'crear_pedido', 'confirmar_pedido', 'anular_pedido', 'actualizar_preparacion'
)
WHERE r.nombre = 'MOZO'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_cocina', 'actualizar_preparacion')
WHERE r.nombre IN ('COCINA', 'BAR')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion = 'ver_pedido'
WHERE r.nombre = 'CAJA'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
