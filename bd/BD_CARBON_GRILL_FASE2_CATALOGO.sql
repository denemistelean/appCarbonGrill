-- ==============================================================================
-- CARBON GRILL — FASE 2: Catálogo, insumos, recetas (BOM) y precios por sucursal
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 1).
-- No descuenta stock (eso es Fase 3 / 6). No ALTER de sis_*.
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- UNIDAD DE MEDIDA ----------
CREATE TABLE IF NOT EXISTS `unidad_medida` (
  `id_unidad_medida` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(10) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_unidad_medida`),
  UNIQUE KEY `uk_unidad_codigo` (`codigo`),
  CONSTRAINT `fk_um_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_um_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Catálogo. Unidades de medida de insumos (kg, g, lt, ml, unid).';

INSERT INTO `unidad_medida` (`codigo`, `nombre`, `id_usuario_crea`)
SELECT v.codigo, v.nombre, 1
FROM (
  SELECT 'UNID' AS codigo, 'UNIDAD' AS nombre UNION ALL
  SELECT 'G', 'GRAMO' UNION ALL
  SELECT 'KG', 'KILOGRAMO' UNION ALL
  SELECT 'ML', 'MILILITRO' UNION ALL
  SELECT 'LT', 'LITRO'
) v
WHERE NOT EXISTS (SELECT 1 FROM `unidad_medida` u WHERE u.codigo = v.codigo);

-- ---------- CATEGORÍA DE PRODUCTO ----------
CREATE TABLE IF NOT EXISTS `producto_categoria` (
  `id_categoria` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `orden` int NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_categoria`),
  UNIQUE KEY `uk_categoria_nombre` (`nombre`),
  CONSTRAINT `fk_cat_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cat_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Catálogo corporativo. Categorías de carta (hamburguesas, combos, bebidas).';

INSERT INTO `producto_categoria` (`nombre`, `orden`, `id_usuario_crea`)
SELECT v.nombre, v.orden, 1
FROM (
  SELECT 'HAMBURGUESAS' AS nombre, 1 AS orden UNION ALL
  SELECT 'ACOMPANAMIENTOS', 2 UNION ALL
  SELECT 'BEBIDAS', 3 UNION ALL
  SELECT 'COMBOS', 4
) v
WHERE NOT EXISTS (SELECT 1 FROM `producto_categoria` c WHERE c.nombre = v.nombre);

-- ---------- INSUMO (maestro corporativo; stock por sucursal en Fase 3) ----------
CREATE TABLE IF NOT EXISTS `insumo` (
  `id_insumo` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) NOT NULL,
  `id_unidad_medida` int NOT NULL,
  `costo_unitario` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_insumo`),
  UNIQUE KEY `uk_insumo_nombre` (`nombre`),
  KEY `idx_insumo_um` (`id_unidad_medida`),
  CONSTRAINT `fk_insumo_um` FOREIGN KEY (`id_unidad_medida`) REFERENCES `unidad_medida` (`id_unidad_medida`) ON DELETE RESTRICT,
  CONSTRAINT `fk_insumo_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_insumo_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Catálogo. Insumos de receta. El kardex por sucursal llega en Fase 3.';

INSERT INTO `insumo` (`nombre`, `id_unidad_medida`, `costo_unitario`, `id_usuario_crea`)
SELECT v.nombre, um.id_unidad_medida, v.costo, 1
FROM (
  SELECT 'PAN HAMBURGUESA' AS nombre, 'UNID' AS um, 0.8000 AS costo UNION ALL
  SELECT 'CARNE RES', 'G', 0.0450 UNION ALL
  SELECT 'QUESO AMERICANO', 'UNID', 0.6000 UNION ALL
  SELECT 'CEBOLLA', 'G', 0.0040 UNION ALL
  SELECT 'PAPA', 'G', 0.0060 UNION ALL
  SELECT 'GASEOSA LATA', 'UNID', 2.2000
) v
INNER JOIN `unidad_medida` um ON um.codigo = v.um AND um.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM `insumo` i WHERE i.nombre = v.nombre);

-- ---------- PRODUCTO (maestro corporativo) ----------
CREATE TABLE IF NOT EXISTS `producto` (
  `id_producto` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `id_categoria` int NOT NULL,
  `precio` decimal(12,2) NOT NULL DEFAULT 0.00,
  `es_combo` tinyint(1) NOT NULL DEFAULT 0,
  `estacion` ENUM('COCINA','PARRILLA','BAR','NINGUNA') NOT NULL DEFAULT 'COCINA',
  `descripcion` varchar(255) DEFAULT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_producto`),
  UNIQUE KEY `uk_producto_codigo` (`codigo`),
  KEY `idx_producto_cat` (`id_categoria`),
  CONSTRAINT `fk_prod_cat` FOREIGN KEY (`id_categoria`) REFERENCES `producto_categoria` (`id_categoria`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prod_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prod_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Catálogo corporativo. Platos, bebidas y combos.';

INSERT INTO `producto` (`codigo`, `nombre`, `id_categoria`, `precio`, `es_combo`, `estacion`, `descripcion`, `id_usuario_crea`)
SELECT v.codigo, v.nombre, c.id_categoria, v.precio, v.es_combo, v.estacion, v.descripcion, 1
FROM (
  SELECT 'HAMB-CLAS' AS codigo, 'HAMBURGUESA CLASICA' AS nombre, 'HAMBURGUESAS' AS cat, 18.90 AS precio, 0 AS es_combo, 'PARRILLA' AS estacion, 'Pan, carne y queso' AS descripcion UNION ALL
  SELECT 'PAPAS', 'PAPAS FRITAS', 'ACOMPANAMIENTOS', 7.90, 0, 'COCINA', 'Porción de papas' UNION ALL
  SELECT 'GASEOSA', 'GASEOSA LATA', 'BEBIDAS', 5.00, 0, 'BAR', 'Gaseosa 355 ml' UNION ALL
  SELECT 'COMBO-CLAS', 'COMBO CLASICO', 'COMBOS', 28.90, 1, 'NINGUNA', 'Hamburguesa + papas + gaseosa'
) v
INNER JOIN `producto_categoria` c ON c.nombre = v.cat AND c.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM `producto` p WHERE p.codigo = v.codigo);

-- ---------- PRECIO / DISPONIBILIDAD POR SUCURSAL ----------
CREATE TABLE IF NOT EXISTS `producto_sucursal` (
  `id_producto_sucursal` int NOT NULL AUTO_INCREMENT,
  `id_producto` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `disponible` tinyint(1) NOT NULL DEFAULT 1,
  `precio_override` decimal(12,2) DEFAULT NULL COMMENT 'NULL = usa precio maestro',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_producto_sucursal`),
  UNIQUE KEY `uk_prod_suc` (`id_producto`, `id_sucursal`),
  KEY `idx_ps_sucursal` (`id_sucursal`),
  CONSTRAINT `fk_ps_prod` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ps_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ps_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ps_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Disponibilidad y precio por sucursal.';

INSERT INTO `producto_sucursal` (`id_producto`, `id_sucursal`, `disponible`, `precio_override`, `id_usuario_crea`)
SELECT p.id_producto, s.id_sucursal, 1, NULL, 1
FROM `producto` p
INNER JOIN `sucursal` s ON s.estado_registro = 'ACTIVO'
WHERE p.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `producto_sucursal` ps
    WHERE ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal
  );

-- ---------- RECETA (BOM producto → insumo, versionada) ----------
CREATE TABLE IF NOT EXISTS `receta` (
  `id_receta` int NOT NULL AUTO_INCREMENT,
  `id_producto` int NOT NULL,
  `id_insumo` int NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `vigente_desde` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `vigente_hasta` datetime DEFAULT NULL COMMENT 'NULL = versión vigente',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_receta`),
  KEY `idx_receta_prod_vig` (`id_producto`, `vigente_hasta`),
  KEY `idx_receta_insumo` (`id_insumo`),
  CONSTRAINT `fk_receta_prod` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`) ON DELETE RESTRICT,
  CONSTRAINT `fk_receta_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_receta_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_receta_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='BOM. Cantidad de insumo por plato. Versionado al editar receta.';

INSERT INTO `receta` (`id_producto`, `id_insumo`, `cantidad`, `id_usuario_crea`)
SELECT p.id_producto, i.id_insumo, v.cantidad, 1
FROM (
  SELECT 'HAMB-CLAS' AS codigo, 'PAN HAMBURGUESA' AS insumo, 1.0000 AS cantidad UNION ALL
  SELECT 'HAMB-CLAS', 'CARNE RES', 150.0000 UNION ALL
  SELECT 'HAMB-CLAS', 'QUESO AMERICANO', 1.0000 UNION ALL
  SELECT 'HAMB-CLAS', 'CEBOLLA', 20.0000 UNION ALL
  SELECT 'PAPAS', 'PAPA', 200.0000
) v
INNER JOIN `producto` p ON p.codigo = v.codigo AND p.estado_registro = 'ACTIVO'
INNER JOIN `insumo` i ON i.nombre = v.insumo AND i.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (
  SELECT 1 FROM `receta` r
  WHERE r.id_producto = p.id_producto AND r.id_insumo = i.id_insumo
    AND r.vigente_hasta IS NULL AND r.estado_registro = 'ACTIVO'
);

-- ---------- COMBO → PRODUCTOS (BOM anidado) ----------
CREATE TABLE IF NOT EXISTS `combo_item` (
  `id_combo_item` int NOT NULL AUTO_INCREMENT,
  `id_combo` int NOT NULL,
  `id_producto` int NOT NULL,
  `cantidad` decimal(12,3) NOT NULL DEFAULT 1.000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_combo_item`),
  UNIQUE KEY `uk_combo_prod` (`id_combo`, `id_producto`),
  KEY `idx_combo_item_prod` (`id_producto`),
  CONSTRAINT `fk_combo_padre` FOREIGN KEY (`id_combo`) REFERENCES `producto` (`id_producto`) ON DELETE RESTRICT,
  CONSTRAINT `fk_combo_hijo` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`) ON DELETE RESTRICT,
  CONSTRAINT `fk_combo_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_combo_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='BOM anidado. Un combo referencia platos, que a su vez tienen receta.';

INSERT INTO `combo_item` (`id_combo`, `id_producto`, `cantidad`, `id_usuario_crea`)
SELECT combo.id_producto, item.id_producto, v.cantidad, 1
FROM (
  SELECT 'COMBO-CLAS' AS combo, 'HAMB-CLAS' AS item, 1.000 AS cantidad UNION ALL
  SELECT 'COMBO-CLAS', 'PAPAS', 1.000 UNION ALL
  SELECT 'COMBO-CLAS', 'GASEOSA', 1.000
) v
INNER JOIN `producto` combo ON combo.codigo = v.combo AND combo.es_combo = 1 AND combo.estado_registro = 'ACTIVO'
INNER JOIN `producto` item ON item.codigo = v.item AND item.es_combo = 0 AND item.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (
  SELECT 1 FROM `combo_item` ci
  WHERE ci.id_combo = combo.id_producto AND ci.id_producto = item.id_producto
);

-- ---------- PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'INSUMOS', 'Insumos' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'INSUMOS');

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'PRODUCTOS', 'Productos' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'PRODUCTOS');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_insumo' AS codigo, 'Ver insumos' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_insumo', 'Crear insumo', 'CREATE' UNION ALL
  SELECT 'actualizar_insumo', 'Actualizar insumo', 'UPDATE' UNION ALL
  SELECT 'eliminar_insumo', 'Eliminar insumo', 'DELETE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'INSUMOS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_producto' AS codigo, 'Ver productos, recetas, combos y maestros de carta' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_producto', 'Crear producto / categoría / unidad', 'CREATE' UNION ALL
  SELECT 'actualizar_producto', 'Actualizar producto / receta / combo', 'UPDATE' UNION ALL
  SELECT 'eliminar_producto', 'Eliminar producto / categoría / unidad', 'DELETE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'PRODUCTOS'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre IN ('INSUMOS', 'PRODUCTOS')
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion
  );

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_insumo', 'ver_producto')
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion
  );

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
