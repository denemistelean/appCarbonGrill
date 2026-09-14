-- ==============================================================================
-- DON PAPAS — Carta visual (tema + categorías + productos + sabores)
-- Ejecutar sobre app_carbon_grill
-- Usa la sucursal LOCAL ya existente (LOC-1RO / DONOBAS / nombre DON PAPAS)
-- Logo: ERP → Sucursales → subir logo
--   Disco: erp-backend/uploads/sucursales/{id_sucursal}/logo.{jpg|png|webp}
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

-- Tema visual de la carta (carbon_grill | don_papas)
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_vitrina' AND COLUMN_NAME = 'tema');
SET @sql := IF(@c = 0,
  'ALTER TABLE `carta_vitrina` ADD COLUMN `tema` varchar(40) NOT NULL DEFAULT ''carbon_grill'' COMMENT ''Tema UI pública'' AFTER `moneda`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Precio junior (opcional)
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'precio_junior');
SET @sql := IF(@c = 0,
  'ALTER TABLE `producto` ADD COLUMN `precio_junior` decimal(12,2) DEFAULT NULL AFTER `precio`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Local Don Papas existente
SET @id_dp := (
  SELECT id_sucursal FROM sucursal
  WHERE estado_registro = 'ACTIVO' AND tipo = 'LOCAL'
    AND (
      codigo IN ('DONOBAS', 'LOC-1RO')
      OR UPPER(COALESCE(nombre_comercial, '')) LIKE '%DON PAPAS%'
      OR UPPER(COALESCE(nombre, '')) LIKE '%DON PAPAS%'
    )
  ORDER BY CASE
    WHEN codigo = 'LOC-1RO' THEN 0
    WHEN codigo = 'DONOBAS' THEN 1
    ELSE 2
  END
  LIMIT 1
);

UPDATE sucursal
SET nombre_comercial = COALESCE(NULLIF(nombre_comercial, ''), 'DON PAPAS')
WHERE id_sucursal = @id_dp AND estado_registro = 'ACTIVO';

-- Carta config
INSERT INTO `carta_vitrina` (`id_sucursal`, `nombre`, `tagline`, `promo`, `moneda`, `tema`, `id_usuario_crea`)
SELECT @id_dp, 'DON PAPAS', 'SALCHIPAPERÍA • SALCHIPAPAS • ALITAS • BONELESS',
       'Para llevar: S/ 1.00 por taper', 'S/', 'don_papas', 1
FROM DUAL
WHERE @id_dp IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM carta_vitrina cv
    WHERE cv.id_sucursal = @id_dp AND cv.estado_registro = 'ACTIVO'
  );

UPDATE carta_vitrina
SET nombre = 'DON PAPAS',
    tagline = 'SALCHIPAPERÍA • SALCHIPAPAS • ALITAS • BONELESS',
    promo = 'Para llevar: S/ 1.00 por taper',
    moneda = 'S/',
    tema = 'don_papas'
WHERE id_sucursal = @id_dp AND estado_registro = 'ACTIVO';

-- Categorías (nombres únicos por uk_categoria_nombre)
INSERT INTO `producto_categoria` (`nombre`, `codigo`, `icono`, `orden`, `id_usuario_crea`)
SELECT v.nombre, v.codigo, v.icono, v.orden, 1
FROM (
  SELECT 'dp_salchipapas' AS codigo, 'Salchipapas' AS nombre, '🍟' AS icono, 210 AS orden UNION ALL
  SELECT 'dp_especiales', 'Especiales Don Papas', '⭐', 220 UNION ALL
  SELECT 'dp_agregados', 'Agregados Don Papas', '➕', 230 UNION ALL
  SELECT 'dp_alitas', 'Alitas Don Papas', '🍗', 240 UNION ALL
  SELECT 'dp_boneless', 'Boneless Don Papas', '🍗', 250 UNION ALL
  SELECT 'dp_bebidas', 'Bebidas Don Papas', '🥤', 260
) v
WHERE NOT EXISTS (
  SELECT 1 FROM producto_categoria c WHERE c.codigo = v.codigo OR c.nombre = v.nombre
);

-- Sabores
INSERT INTO `carta_vitrina_tag` (`id_sucursal`, `tipo`, `nombre`, `orden`, `id_usuario_crea`)
SELECT @id_dp, 'SABOR', v.nombre, v.orden, 1
FROM (
  SELECT 'BBQ' AS nombre, 1 AS orden UNION ALL
  SELECT 'Al ajo', 2 UNION ALL
  SELECT 'Picantes', 3 UNION ALL
  SELECT 'Maracumango', 4 UNION ALL
  SELECT 'BBQ Picante', 5 UNION ALL
  SELECT 'Búfalo', 6 UNION ALL
  SELECT 'Chimichurri', 7 UNION ALL
  SELECT 'Maracuyá', 8 UNION ALL
  SELECT 'Acevichadas', 9
) v
WHERE @id_dp IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM carta_vitrina_tag t
    WHERE t.id_sucursal = @id_dp AND t.tipo = 'SABOR' AND t.nombre = v.nombre AND t.estado_registro = 'ACTIVO'
  );

-- Productos DP-xxx
INSERT INTO `producto` (`codigo`, `nombre`, `id_categoria`, `precio`, `precio_junior`, `es_combo`, `estacion`, `descripcion`, `visible_carta`, `orden_carta`, `id_usuario_crea`)
SELECT v.codigo, v.nombre, c.id_categoria, v.precio, v.precio_junior, 0, v.estacion, v.descripcion, 0, v.orden_carta, 1
FROM (
  SELECT 'DP-001' AS codigo, 'Salchi Hot Dog Clásico' AS nombre, 'dp_salchipapas' AS cat, 15.00 AS precio, 12.00 AS precio_junior, 'COCINA' AS estacion, 'Salchipapa con hot dog clásico.' AS descripcion, 1 AS orden_carta UNION ALL
  SELECT 'DP-002', 'Salchi Hot Dog de Pollo', 'dp_salchipapas', 15.00, 12.00, 'COCINA', 'Salchipapa con hot dog de pollo.', 2 UNION ALL
  SELECT 'DP-003', 'Salchi Chorizo Parrillero', 'dp_salchipapas', 16.00, 12.50, 'COCINA', 'Salchipapa con chorizo parrillero.', 3 UNION ALL
  SELECT 'DP-004', 'Salchi Frankfurter', 'dp_salchipapas', 17.00, 13.00, 'COCINA', 'Salchipapa con salchicha frankfurter.', 4 UNION ALL
  SELECT 'DP-005', 'Salchi Chorizo Finas Hierbas', 'dp_salchipapas', 16.00, NULL, 'COCINA', 'Salchipapa con chorizo finas hierbas.', 5 UNION ALL
  SELECT 'DP-006', 'Salchi Blanca', 'dp_salchipapas', 16.00, NULL, 'COCINA', 'Salchipapa con salchicha blanca.', 6 UNION ALL
  SELECT 'DP-007', 'Salchi Bolipollo', 'dp_salchipapas', 19.00, NULL, 'COCINA', 'Salchipapa con bolipollo.', 7 UNION ALL
  SELECT 'DP-008', 'Salchi Don Papas', 'dp_especiales', 27.00, NULL, 'COCINA', 'Bolipollo, chorizo parrillero, hot dog clásico y hot dog de pollo.', 8 UNION ALL
  SELECT 'DP-009', 'Salchi Lomo Saltado', 'dp_especiales', 24.50, NULL, 'COCINA', 'Chorizo parrillero, trocitos de pollo, hot dog de pollo y plátano frito.', 9 UNION ALL
  SELECT 'DP-010', 'Salchi Peruanita', 'dp_especiales', 25.50, NULL, 'COCINA', 'Chorizo parrillero, salchicha blanca y chorizo picante.', 10 UNION ALL
  SELECT 'DP-011', 'Salchi A Lo Pobre', 'dp_especiales', 25.00, NULL, 'COCINA', 'Chorizo parrillero, hot dog de pollo, plátano, huevo frito, queso y jamón.', 11 UNION ALL
  SELECT 'DP-012', 'Salchi Boliembutidos', 'dp_especiales', 22.50, NULL, 'COCINA', 'Bolipollo, queso, tocino y jamón.', 12 UNION ALL
  SELECT 'DP-013', 'Salchi Huachana', 'dp_especiales', 18.00, NULL, 'COCINA', 'Salchicha huachana y huevo.', 13 UNION ALL
  SELECT 'DP-014', 'Salchi Revuelta', 'dp_especiales', 18.00, NULL, 'COCINA', 'Hot dog frankfurter y huevo revuelto.', 14 UNION ALL
  SELECT 'DP-015', 'Hot Dog', 'dp_agregados', 3.00, NULL, 'COCINA', 'Agregado.', 15 UNION ALL
  SELECT 'DP-016', 'Chorizo', 'dp_agregados', 4.00, NULL, 'COCINA', 'Agregado.', 16 UNION ALL
  SELECT 'DP-017', 'Salchicha Blanca', 'dp_agregados', 4.00, NULL, 'COCINA', 'Agregado.', 17 UNION ALL
  SELECT 'DP-018', 'Frankfurter', 'dp_agregados', 4.00, NULL, 'COCINA', 'Agregado.', 18 UNION ALL
  SELECT 'DP-019', 'Finas Hierbas', 'dp_agregados', 4.00, NULL, 'COCINA', 'Agregado.', 19 UNION ALL
  SELECT 'DP-020', 'Tocino', 'dp_agregados', 2.50, NULL, 'COCINA', 'Agregado.', 20 UNION ALL
  SELECT 'DP-021', 'Huevo', 'dp_agregados', 2.50, NULL, 'COCINA', 'Agregado.', 21 UNION ALL
  SELECT 'DP-022', 'Queso', 'dp_agregados', 3.00, NULL, 'COCINA', 'Agregado.', 22 UNION ALL
  SELECT 'DP-023', 'Jamón', 'dp_agregados', 2.00, NULL, 'COCINA', 'Agregado.', 23 UNION ALL
  SELECT 'DP-024', 'Plátano', 'dp_agregados', 2.00, NULL, 'COCINA', 'Agregado.', 24 UNION ALL
  SELECT 'DP-025', 'Porción de Papa', 'dp_agregados', 9.00, NULL, 'COCINA', 'Porción de papas fritas.', 25 UNION ALL
  SELECT 'DP-026', 'Alitas - 10 unidades', 'dp_alitas', 28.00, NULL, 'COCINA', '10 unidades. Elige entre los sabores disponibles.', 26 UNION ALL
  SELECT 'DP-027', 'Alitas - 5 unidades', 'dp_alitas', 15.00, NULL, 'COCINA', '5 unidades. Elige entre los sabores disponibles.', 27 UNION ALL
  SELECT 'DP-028', 'Boneless', 'dp_boneless', 21.00, NULL, 'COCINA', 'Con papas fritas. Elige entre los sabores disponibles.', 28 UNION ALL
  SELECT 'DP-029', 'Chicha Morada 1 Lt', 'dp_bebidas', 16.00, NULL, 'BAR', 'Chicha morada de 1 litro.', 29 UNION ALL
  SELECT 'DP-030', 'Chicha Morada 1/2 Lt', 'dp_bebidas', 9.00, NULL, 'BAR', 'Chicha morada de medio litro.', 30 UNION ALL
  SELECT 'DP-031', 'Agua', 'dp_bebidas', 3.50, NULL, 'BAR', 'Agua embotellada.', 31 UNION ALL
  SELECT 'DP-032', 'Gaseosa 1/2 Lt', 'dp_bebidas', 4.50, NULL, 'BAR', 'Gaseosa de 1/2 litro.', 32
) v
INNER JOIN producto_categoria c ON c.codigo = v.cat AND c.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM producto p WHERE p.codigo = v.codigo);

-- producto_sucursal en todos los locales; visible solo en Don Papas
INSERT INTO `producto_sucursal` (`id_producto`, `id_sucursal`, `disponible`, `precio_override`, `visible_carta`, `orden_carta`, `id_usuario_crea`)
SELECT p.id_producto, s.id_sucursal,
       IF(s.id_sucursal = @id_dp, 1, 0),
       NULL,
       IF(s.id_sucursal = @id_dp, 1, 0),
       p.orden_carta,
       1
FROM producto p
INNER JOIN sucursal s ON s.estado_registro = 'ACTIVO'
WHERE p.codigo LIKE 'DP-%' AND p.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM producto_sucursal ps
    WHERE ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal
  );

UPDATE producto_sucursal ps
INNER JOIN producto p ON p.id_producto = ps.id_producto AND p.codigo LIKE 'DP-%'
SET ps.visible_carta = 1, ps.disponible = 1, ps.orden_carta = COALESCE(NULLIF(ps.orden_carta, 0), p.orden_carta)
WHERE ps.id_sucursal = @id_dp AND ps.estado_registro = 'ACTIVO';

COMMIT;
