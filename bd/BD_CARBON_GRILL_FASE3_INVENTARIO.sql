-- ==============================================================================
-- CARBON GRILL — FASE 3: Stock por sucursal, kardex, lotes y mermas
-- Ejecutar UNA vez sobre app_carbon_grill (después de FASE 2).
-- No transfiere entre sucursales. No descuenta por receta/KDS (Fase 6).
-- ==============================================================================

USE app_carbon_grill;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- ---------- STOCK POR SUCURSAL ----------
CREATE TABLE IF NOT EXISTS `insumo_stock` (
  `id_insumo_stock` int NOT NULL AUTO_INCREMENT,
  `id_insumo` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `stock_actual` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `stock_minimo` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `costo_promedio` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_insumo_stock`),
  UNIQUE KEY `uk_insumo_sucursal` (`id_insumo`, `id_sucursal`),
  KEY `idx_stock_sucursal` (`id_sucursal`),
  CONSTRAINT `chk_stock_no_negativo` CHECK (`stock_actual` >= 0),
  CONSTRAINT `fk_istock_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_istock_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_istock_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_istock_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Stock y costo promedio de insumo, independiente por sucursal.';

INSERT INTO `insumo_stock` (`id_insumo`, `id_sucursal`, `stock_actual`, `stock_minimo`, `costo_promedio`, `id_usuario_crea`)
SELECT i.id_insumo, s.id_sucursal, 0, 0, i.costo_unitario, 1
FROM `insumo` i
INNER JOIN `sucursal` s ON s.estado_registro = 'ACTIVO'
WHERE i.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `insumo_stock` st
    WHERE st.id_insumo = i.id_insumo AND st.id_sucursal = s.id_sucursal
  );

-- ---------- LOTES / VENCIMIENTO ----------
CREATE TABLE IF NOT EXISTS `insumo_lote` (
  `id_lote` int NOT NULL AUTO_INCREMENT,
  `id_insumo` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `codigo_lote` varchar(40) NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad_actual` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_lote`),
  KEY `idx_lote_insumo_suc` (`id_insumo`, `id_sucursal`),
  KEY `idx_lote_vto` (`fecha_vencimiento`),
  CONSTRAINT `fk_lote_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lote_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lote_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lote_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Lotes y caducidad. Cantidad restante por lote.';

-- ---------- KARDEX ----------
CREATE TABLE IF NOT EXISTS `kardex` (
  `id_kardex` int NOT NULL AUTO_INCREMENT,
  `id_insumo` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `id_lote` int DEFAULT NULL,
  `tipo` ENUM('INGRESO','SALIDA','MERMA','AJUSTE') NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `costo_unitario` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `costo_total` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `stock_anterior` decimal(12,4) NOT NULL,
  `stock_posterior` decimal(12,4) NOT NULL,
  `motivo` varchar(80) DEFAULT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `fecha_movimiento` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_kardex`),
  KEY `idx_kardex_insumo_suc` (`id_insumo`, `id_sucursal`, `fecha_movimiento`),
  KEY `idx_kardex_tipo` (`tipo`),
  CONSTRAINT `fk_kardex_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_kardex_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_kardex_lote` FOREIGN KEY (`id_lote`) REFERENCES `insumo_lote` (`id_lote`) ON DELETE RESTRICT,
  CONSTRAINT `fk_kardex_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Kardex de insumos por sucursal. Cantidad siempre positiva; el sentido lo da tipo.';

-- ---------- MERMA ----------
CREATE TABLE IF NOT EXISTS `merma` (
  `id_merma` int NOT NULL AUTO_INCREMENT,
  `id_kardex` int NOT NULL,
  `id_insumo` int NOT NULL,
  `id_sucursal` int NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `motivo` ENUM('CARNE_QUEMADA','INSUMO_VENCIDO','DESPERDICIO_CORTE','ERROR_COMANDA','OTRO') NOT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `costo_total` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  PRIMARY KEY (`id_merma`),
  KEY `idx_merma_sucursal` (`id_sucursal`),
  KEY `idx_merma_motivo` (`motivo`),
  CONSTRAINT `fk_merma_kardex` FOREIGN KEY (`id_kardex`) REFERENCES `kardex` (`id_kardex`) ON DELETE RESTRICT,
  CONSTRAINT `fk_merma_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_merma_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_merma_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Registro de merma con motivo y costo financiero.';

-- ---------- SEED: ingreso inicial PRINCIPAL + una merma de carne ----------
-- Stock objetivo (tras merma de 200 g de carne):
-- PAN 50, CARNE 4800 g, QUESO 40, CEBOLLA 2000 g, PAPA 10000 g, GASEOSA 24

UPDATE `insumo_stock` st
INNER JOIN `insumo` i ON i.id_insumo = st.id_insumo
INNER JOIN `sucursal` s ON s.id_sucursal = st.id_sucursal AND s.codigo = 'PRINCIPAL'
INNER JOIN (
  SELECT 'PAN HAMBURGUESA' AS nombre, 50.0000 AS stock, 10.0000 AS minimo UNION ALL
  SELECT 'CARNE RES', 4800.0000, 1500.0000 UNION ALL
  SELECT 'QUESO AMERICANO', 40.0000, 10.0000 UNION ALL
  SELECT 'CEBOLLA', 2000.0000, 500.0000 UNION ALL
  SELECT 'PAPA', 10000.0000, 2000.0000 UNION ALL
  SELECT 'GASEOSA LATA', 24.0000, 6.0000
) v ON v.nombre = i.nombre
SET st.stock_actual = v.stock, st.stock_minimo = v.minimo, st.costo_promedio = i.costo_unitario
WHERE st.estado_registro = 'ACTIVO' AND st.stock_actual = 0;

INSERT INTO `kardex` (`id_insumo`, `id_sucursal`, `tipo`, `cantidad`, `costo_unitario`, `costo_total`, `stock_anterior`, `stock_posterior`, `motivo`, `detalle`, `id_usuario_crea`)
SELECT i.id_insumo, s.id_sucursal, 'INGRESO', v.cantidad, i.costo_unitario, ROUND(v.cantidad * i.costo_unitario, 4),
       0, v.cantidad, 'INGRESO_INICIAL', 'Carga inicial Fase 3', 1
FROM (
  SELECT 'PAN HAMBURGUESA' AS nombre, 50.0000 AS cantidad UNION ALL
  SELECT 'CARNE RES', 5000.0000 UNION ALL
  SELECT 'QUESO AMERICANO', 40.0000 UNION ALL
  SELECT 'CEBOLLA', 2000.0000 UNION ALL
  SELECT 'PAPA', 10000.0000 UNION ALL
  SELECT 'GASEOSA LATA', 24.0000
) v
INNER JOIN `insumo` i ON i.nombre = v.nombre AND i.estado_registro = 'ACTIVO'
INNER JOIN `sucursal` s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (
  SELECT 1 FROM `kardex` k
  WHERE k.id_insumo = i.id_insumo AND k.id_sucursal = s.id_sucursal AND k.motivo = 'INGRESO_INICIAL'
);

INSERT INTO `insumo_lote` (`id_insumo`, `id_sucursal`, `codigo_lote`, `fecha_vencimiento`, `cantidad_actual`, `id_usuario_crea`)
SELECT i.id_insumo, s.id_sucursal, 'LOTE-INI-CARNE', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 4800.0000, 1
FROM `insumo` i
INNER JOIN `sucursal` s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
WHERE i.nombre = 'CARNE RES'
  AND NOT EXISTS (SELECT 1 FROM `insumo_lote` l WHERE l.codigo_lote = 'LOTE-INI-CARNE');

INSERT INTO `kardex` (`id_insumo`, `id_sucursal`, `tipo`, `cantidad`, `costo_unitario`, `costo_total`, `stock_anterior`, `stock_posterior`, `motivo`, `detalle`, `id_usuario_crea`)
SELECT i.id_insumo, s.id_sucursal, 'MERMA', 200.0000, i.costo_unitario, ROUND(200.0000 * i.costo_unitario, 4),
       5000.0000, 4800.0000, 'CARNE_QUEMADA', 'Merma de ejemplo Fase 3', 1
FROM `insumo` i
INNER JOIN `sucursal` s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
WHERE i.nombre = 'CARNE RES'
  AND NOT EXISTS (
    SELECT 1 FROM `kardex` k
    WHERE k.id_insumo = i.id_insumo AND k.id_sucursal = s.id_sucursal AND k.tipo = 'MERMA' AND k.detalle = 'Merma de ejemplo Fase 3'
  );

INSERT INTO `merma` (`id_kardex`, `id_insumo`, `id_sucursal`, `cantidad`, `motivo`, `detalle`, `costo_total`, `id_usuario_crea`)
SELECT k.id_kardex, k.id_insumo, k.id_sucursal, k.cantidad, 'CARNE_QUEMADA', k.detalle, k.costo_total, 1
FROM `kardex` k
INNER JOIN `insumo` i ON i.id_insumo = k.id_insumo AND i.nombre = 'CARNE RES'
WHERE k.tipo = 'MERMA' AND k.detalle = 'Merma de ejemplo Fase 3'
  AND NOT EXISTS (SELECT 1 FROM `merma` m WHERE m.id_kardex = k.id_kardex);

-- ---------- PERMISOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`)
SELECT 'INVENTARIO', 'Inventario' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `sis_modulo` WHERE `nombre` = 'INVENTARIO');

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_inventario' AS codigo, 'Ver stock por sucursal' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'crear_movimiento', 'Registrar ingreso o salida', 'CREATE' UNION ALL
  SELECT 'ajustar_inventario', 'Ajustar stock y minimo', 'UPDATE' UNION ALL
  SELECT 'ver_kardex', 'Ver kardex / movimientos', 'READ' UNION ALL
  SELECT 'ver_merma', 'Ver mermas y costo por motivo', 'READ' UNION ALL
  SELECT 'crear_merma', 'Registrar merma', 'CREATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'INVENTARIO'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'INVENTARIO'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion
  );

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN (
  'ver_inventario', 'crear_movimiento', 'ajustar_inventario', 'ver_kardex', 'ver_merma', 'crear_merma'
)
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (
    SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion
  );

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
