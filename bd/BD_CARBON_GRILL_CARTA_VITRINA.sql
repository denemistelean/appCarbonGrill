-- ==============================================================================
-- CARBON GRILL — CARTA VISUAL PÚBLICA (vitrina)
-- Ejecutar UNA vez sobre app_carbon_grill.
-- Distinta de /m/:token (carta QR de mesa). Esta es /carta para el público.
-- No altera sis_* ni el CORE.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_categoria' AND COLUMN_NAME = 'codigo'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `producto_categoria` ADD COLUMN `codigo` varchar(40) DEFAULT NULL AFTER `nombre`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_categoria' AND INDEX_NAME = 'uk_categoria_codigo'
);
SET @sql2 := IF(
  @idx = 0,
  'ALTER TABLE `producto_categoria` ADD UNIQUE KEY `uk_categoria_codigo` (`codigo`)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @coli := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_categoria' AND COLUMN_NAME = 'icono'
);
SET @sql3 := IF(
  @coli = 0,
  'ALTER TABLE `producto_categoria` ADD COLUMN `icono` varchar(16) DEFAULT NULL AFTER `codigo`',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @img := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'imagen'
);
SET @sql4 := IF(
  @img = 0,
  'ALTER TABLE `producto` ADD COLUMN `imagen` varchar(255) DEFAULT NULL AFTER `descripcion`',
  'SELECT 1'
);
PREPARE stmt4 FROM @sql4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

SET @vis := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'visible_carta'
);
SET @sql5 := IF(
  @vis = 0,
  'ALTER TABLE `producto` ADD COLUMN `visible_carta` tinyint(1) NOT NULL DEFAULT 0 AFTER `imagen`',
  'SELECT 1'
);
PREPARE stmt5 FROM @sql5;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;

SET @ord := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'orden_carta'
);
SET @sql6 := IF(
  @ord = 0,
  'ALTER TABLE `producto` ADD COLUMN `orden_carta` int NOT NULL DEFAULT 0 AFTER `visible_carta`',
  'SELECT 1'
);
PREPARE stmt6 FROM @sql6;
EXECUTE stmt6;
DEALLOCATE PREPARE stmt6;

SET @desc := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'descripcion'
);
SET @sql7 := IF(
  @desc IS NOT NULL AND @desc < 500,
  'ALTER TABLE `producto` MODIFY COLUMN `descripcion` varchar(500) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt7 FROM @sql7;
EXECUTE stmt7;
DEALLOCATE PREPARE stmt7;

CREATE TABLE IF NOT EXISTS `carta_vitrina` (
  `id_carta_vitrina` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) NOT NULL,
  `tagline` varchar(200) DEFAULT NULL,
  `promo` varchar(255) DEFAULT NULL,
  `moneda` varchar(8) NOT NULL DEFAULT 'S/',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_carta_vitrina`),
  CONSTRAINT `fk_cv_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cv_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Configuración de la carta visual pública /carta';

INSERT INTO `carta_vitrina` (`nombre`, `tagline`, `promo`, `moneda`, `id_usuario_crea`)
SELECT 'Carbón Grill & Burgers', 'Hamburguesas • Alitas • Parrillas • Tragos',
       '¡Añade tu Papa Nativa por tan solo S/ 2.00!', 'S/', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `carta_vitrina` WHERE `estado_registro` = 'ACTIVO');

CREATE TABLE IF NOT EXISTS `carta_vitrina_tag` (
  `id_tag` int NOT NULL AUTO_INCREMENT,
  `tipo` ENUM('SABOR','CHORIZO') NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `orden` int NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_tag`),
  KEY `idx_cvtag_tipo` (`tipo`, `orden`),
  CONSTRAINT `fk_cvtag_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cvtag_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Sabores de alitas y chorizos a elección para la vitrina';

INSERT INTO `carta_vitrina_tag` (`tipo`, `nombre`, `orden`, `id_usuario_crea`)
SELECT v.tipo, v.nombre, v.orden, 1
FROM (
  SELECT 'SABOR' AS tipo, 'Acevichadas' AS nombre, 1 AS orden UNION ALL
  SELECT 'SABOR', 'BBQ Picante', 2 UNION ALL
  SELECT 'SABOR', 'Búfalo', 3 UNION ALL
  SELECT 'SABOR', 'Chimichurri', 4 UNION ALL
  SELECT 'SABOR', 'Maracumango', 5 UNION ALL
  SELECT 'SABOR', 'BBQ al Ajo', 6 UNION ALL
  SELECT 'SABOR', 'Picantes', 7 UNION ALL
  SELECT 'SABOR', 'Maracuyá', 8 UNION ALL
  SELECT 'CHORIZO', 'Chorizo Finas Hierbas', 1 UNION ALL
  SELECT 'CHORIZO', 'Chorizo Parrillero', 2 UNION ALL
  SELECT 'CHORIZO', 'Chorizo Choribrasa', 3
) v
WHERE NOT EXISTS (
  SELECT 1 FROM `carta_vitrina_tag` t
  WHERE t.tipo = v.tipo AND t.nombre = v.nombre AND t.estado_registro = 'ACTIVO'
);

INSERT INTO `producto_categoria` (`nombre`, `codigo`, `icono`, `orden`, `id_usuario_crea`)
SELECT v.nombre, v.codigo, v.icono, v.orden, 1
FROM (
  SELECT 'hamburguesas' AS codigo, 'Hamburguesas (Las Más Pedidas)' AS nombre, '🍔' AS icono, 10 AS orden UNION ALL
  SELECT 'especiales' AS codigo, 'Especiales Carbón' AS nombre, '🔥' AS icono, 20 AS orden UNION ALL
  SELECT 'alitas_boneless' AS codigo, 'Alitas & Boneless' AS nombre, '🍗' AS icono, 30 AS orden UNION ALL
  SELECT 'arma_tu_burger' AS codigo, 'Arma tu Hamburguesa' AS nombre, '🥩' AS icono, 40 AS orden UNION ALL
  SELECT 'agregados' AS codigo, 'Agregados & Extras' AS nombre, '🥓' AS icono, 50 AS orden UNION ALL
  SELECT 'parrilla_simple' AS codigo, 'Parrilla Simple' AS nombre, '🥩' AS icono, 60 AS orden UNION ALL
  SELECT 'parrilla_promo' AS codigo, 'Parrilla Promo' AS nombre, '🏷️' AS icono, 70 AS orden UNION ALL
  SELECT 'parrilla_especial' AS codigo, 'Parrilla Especial' AS nombre, '⭐' AS icono, 80 AS orden UNION ALL
  SELECT 'parrillas_compartir' AS codigo, 'Parrillas para Compartir' AS nombre, '👨‍👩‍👧‍👦' AS icono, 90 AS orden UNION ALL
  SELECT 'agregados_parrilla' AS codigo, 'Agregados de Parrilla' AS nombre, '🍢' AS icono, 100 AS orden UNION ALL
  SELECT 'tragos_alcohol' AS codigo, 'Cocteles y Tragos con Alcohol' AS nombre, '🍹' AS icono, 110 AS orden UNION ALL
  SELECT 'vinos_cervezas' AS codigo, 'Vinos, Cervezas & Sangría' AS nombre, '🍷' AS icono, 120 AS orden UNION ALL
  SELECT 'bebidas_sin_alcohol' AS codigo, 'Limonadas & Bebidas Sin Alcohol' AS nombre, '🍋' AS icono, 130 AS orden UNION ALL
  SELECT 'mocteles' AS codigo, 'Mocteles (Sin Alcohol)' AS nombre, '🍹' AS icono, 140 AS orden UNION ALL
  SELECT 'bebidas_clasicas' AS codigo, 'Bebidas Básicas & Chicha' AS nombre, '🥤' AS icono, 150 AS orden
) v
WHERE NOT EXISTS (
  SELECT 1 FROM `producto_categoria` c WHERE c.codigo = v.codigo OR c.nombre = v.nombre
);

INSERT INTO `producto` (`codigo`, `nombre`, `id_categoria`, `precio`, `es_combo`, `estacion`, `descripcion`, `visible_carta`, `orden_carta`, `id_usuario_crea`)
SELECT v.codigo, v.nombre, c.id_categoria, v.precio, 0, v.estacion, v.descripcion, 1, v.orden_carta, 1
FROM (
  SELECT 'CARTA-001' AS codigo, 'Carbón Burguer' AS nombre, 'hamburguesas' AS cat, 10.00 AS precio, 'PARRILLA' AS estacion, 'Carne artesanal a la parrilla con lechuga y tomate frescos.' AS descripcion, 1 AS orden_carta UNION ALL
  SELECT 'CARTA-002' AS codigo, 'Chorizo Parrillero' AS nombre, 'hamburguesas' AS cat, 10.00 AS precio, 'PARRILLA' AS estacion, 'Chorizo artesanal asado a las brasas de carbón.' AS descripcion, 2 AS orden_carta UNION ALL
  SELECT 'CARTA-003' AS codigo, 'Royal Burguer' AS nombre, 'hamburguesas' AS cat, 11.50 AS precio, 'PARRILLA' AS estacion, 'Carne a la parrilla + Huevo frito montado.' AS descripcion, 3 AS orden_carta UNION ALL
  SELECT 'CARTA-004' AS codigo, 'Matahambre' AS nombre, 'hamburguesas' AS cat, 11.50 AS precio, 'PARRILLA' AS estacion, 'Tortilla de embutidos seleccionados de la casa.' AS descripcion, 4 AS orden_carta UNION ALL
  SELECT 'CARTA-005' AS codigo, 'Terminator' AS nombre, 'hamburguesas' AS cat, 18.00 AS precio, 'PARRILLA' AS estacion, 'Carne + Chorizo + Matahambre (Tortilla de embutidos).' AS descripcion, 5 AS orden_carta UNION ALL
  SELECT 'CARTA-006' AS codigo, 'A lo Pobre' AS nombre, 'hamburguesas' AS cat, 15.00 AS precio, 'PARRILLA' AS estacion, 'Carne + Huevo + Plátano frito + Jamón + Queso fundido.' AS descripcion, 6 AS orden_carta UNION ALL
  SELECT 'CARTA-007' AS codigo, 'Pollo a la Rusa' AS nombre, 'hamburguesas' AS cat, 11.50 AS precio, 'PARRILLA' AS estacion, 'Pollo tierno desmenuzado con ensalada rusa casera.' AS descripcion, 7 AS orden_carta UNION ALL
  SELECT 'CARTA-008' AS codigo, 'Filete Hawaiana' AS nombre, 'hamburguesas' AS cat, 12.50 AS precio, 'PARRILLA' AS estacion, 'Filete de pechuga a la plancha con piña grillada.' AS descripcion, 8 AS orden_carta UNION ALL
  SELECT 'CARTA-009' AS codigo, 'Filete Hawaiana + Queso' AS nombre, 'hamburguesas' AS cat, 13.50 AS precio, 'PARRILLA' AS estacion, 'Filete de pollo + Piña grillada + Queso derretido.' AS descripcion, 9 AS orden_carta UNION ALL
  SELECT 'CARTA-010' AS codigo, 'Filete + Champiñón + Queso' AS nombre, 'hamburguesas' AS cat, 14.00 AS precio, 'PARRILLA' AS estacion, 'Filete de pollo grillado + Champiñones salteados + Queso.' AS descripcion, 10 AS orden_carta UNION ALL
  SELECT 'CARTA-011' AS codigo, 'Carne + Champiñón + Queso' AS nombre, 'hamburguesas' AS cat, 13.50 AS precio, 'PARRILLA' AS estacion, 'Hamburguesa de res + Champiñones frescos + Queso.' AS descripcion, 11 AS orden_carta UNION ALL
  SELECT 'CARTA-012' AS codigo, 'Carne + Chorizo + Huevo' AS nombre, 'hamburguesas' AS cat, 15.00 AS precio, 'PARRILLA' AS estacion, 'Carne + Chorizo parrillero + Huevo frito.' AS descripcion, 12 AS orden_carta UNION ALL
  SELECT 'CARTA-013' AS codigo, 'Carne + Chorizo + Queso' AS nombre, 'hamburguesas' AS cat, 15.00 AS precio, 'PARRILLA' AS estacion, 'Carne + Chorizo parrillero + Queso derretido.' AS descripcion, 13 AS orden_carta UNION ALL
  SELECT 'CARTA-014' AS codigo, 'Matahambre + Desmenuzado + Queso' AS nombre, 'hamburguesas' AS cat, 16.00 AS precio, 'PARRILLA' AS estacion, 'Tortilla de embutidos + Pollo desmenuzado + Queso.' AS descripcion, 14 AS orden_carta UNION ALL
  SELECT 'CARTA-015' AS codigo, 'Matahambre + Filete + Queso' AS nombre, 'hamburguesas' AS cat, 16.00 AS precio, 'PARRILLA' AS estacion, 'Tortilla de embutidos + Filete de pollo + Queso.' AS descripcion, 15 AS orden_carta UNION ALL
  SELECT 'CARTA-016' AS codigo, 'H. Vegetariana' AS nombre, 'hamburguesas' AS cat, 9.50 AS precio, 'PARRILLA' AS estacion, 'Opción 100% vegetariana con vegetales seleccionados.' AS descripcion, 16 AS orden_carta UNION ALL
  SELECT 'CARTA-017' AS codigo, 'Super Carbón Cheese' AS nombre, 'especiales' AS cat, 15.50 AS precio, 'PARRILLA' AS estacion, 'Doble Carne a la brasa + Doble Queso derretido.' AS descripcion, 17 AS orden_carta UNION ALL
  SELECT 'CARTA-018' AS codigo, 'Carbón Crispi Chicken' AS nombre, 'especiales' AS cat, 13.00 AS precio, 'PARRILLA' AS estacion, 'Pechuga de pollo extra crujiente con salsas artesanales.' AS descripcion, 18 AS orden_carta UNION ALL
  SELECT 'CARTA-019' AS codigo, 'Carbón Filete Grill' AS nombre, 'especiales' AS cat, 12.00 AS precio, 'PARRILLA' AS estacion, 'Filete de pollo a la parrilla + Ensalada especial.' AS descripcion, 19 AS orden_carta UNION ALL
  SELECT 'CARTA-020' AS codigo, 'Alitas (10 unidades)' AS nombre, 'alitas_boneless' AS cat, 28.00 AS precio, 'PARRILLA' AS estacion, '10 piezas crujientes bañadas en tu salsa favorita.' AS descripcion, 20 AS orden_carta UNION ALL
  SELECT 'CARTA-021' AS codigo, 'Alitas (5 unidades)' AS nombre, 'alitas_boneless' AS cat, 15.00 AS precio, 'PARRILLA' AS estacion, '5 piezas crujientes bañadas en tu salsa favorita.' AS descripcion, 21 AS orden_carta UNION ALL
  SELECT 'CARTA-022' AS codigo, 'Boneless (8 unidades)' AS nombre, 'alitas_boneless' AS cat, 21.00 AS precio, 'PARRILLA' AS estacion, '8 bocados de pechuga crocante bañados en tu salsa favorita.' AS descripcion, 22 AS orden_carta UNION ALL
  SELECT 'CARTA-023' AS codigo, 'Filete de Pollo' AS nombre, 'arma_tu_burger' AS cat, 11.00 AS precio, 'PARRILLA' AS estacion, 'Base de pechuga sellada a la plancha.' AS descripcion, 23 AS orden_carta UNION ALL
  SELECT 'CARTA-024' AS codigo, 'Pollo Desmenuzado' AS nombre, 'arma_tu_burger' AS cat, 10.00 AS precio, 'PARRILLA' AS estacion, 'Base de pollo tierno y jugoso.' AS descripcion, 24 AS orden_carta UNION ALL
  SELECT 'CARTA-025' AS codigo, 'Chorizo Parrillero' AS nombre, 'arma_tu_burger' AS cat, 10.00 AS precio, 'PARRILLA' AS estacion, 'Base de chorizo parrillero a las brasas.' AS descripcion, 25 AS orden_carta UNION ALL
  SELECT 'CARTA-026' AS codigo, 'Queso' AS nombre, 'agregados' AS cat, 1.50 AS precio, 'COCINA' AS estacion, 'Porción de queso derretido.' AS descripcion, 26 AS orden_carta UNION ALL
  SELECT 'CARTA-027' AS codigo, 'Jamón' AS nombre, 'agregados' AS cat, 1.00 AS precio, 'COCINA' AS estacion, 'Lámina de jamón inglés.' AS descripcion, 27 AS orden_carta UNION ALL
  SELECT 'CARTA-028' AS codigo, 'Huevo' AS nombre, 'agregados' AS cat, 1.50 AS precio, 'COCINA' AS estacion, 'Huevo frito montado.' AS descripcion, 28 AS orden_carta UNION ALL
  SELECT 'CARTA-029' AS codigo, 'Hot Dog Frankfuter' AS nombre, 'agregados' AS cat, 1.00 AS precio, 'COCINA' AS estacion, 'Salchicha frankfurter sellada.' AS descripcion, 29 AS orden_carta UNION ALL
  SELECT 'CARTA-030' AS codigo, 'Plátano' AS nombre, 'agregados' AS cat, 1.00 AS precio, 'COCINA' AS estacion, 'Plátano frito dulce.' AS descripcion, 30 AS orden_carta UNION ALL
  SELECT 'CARTA-031' AS codigo, 'Champiñón' AS nombre, 'agregados' AS cat, 2.00 AS precio, 'COCINA' AS estacion, 'Champiñones frescos salteados.' AS descripcion, 31 AS orden_carta UNION ALL
  SELECT 'CARTA-032' AS codigo, 'Piña' AS nombre, 'agregados' AS cat, 1.50 AS precio, 'COCINA' AS estacion, 'Rodaja de piña al grill.' AS descripcion, 32 AS orden_carta UNION ALL
  SELECT 'CARTA-033' AS codigo, 'Tocino' AS nombre, 'agregados' AS cat, 2.00 AS precio, 'COCINA' AS estacion, 'Tiras de tocino crujiente.' AS descripcion, 33 AS orden_carta UNION ALL
  SELECT 'CARTA-034' AS codigo, 'Extra Chorizo' AS nombre, 'agregados' AS cat, 5.00 AS precio, 'COCINA' AS estacion, 'Porción extra de chorizo parrillero.' AS descripcion, 34 AS orden_carta UNION ALL
  SELECT 'CARTA-035' AS codigo, 'Extra Carne de Hamburguesa' AS nombre, 'agregados' AS cat, 5.00 AS precio, 'COCINA' AS estacion, 'Porción extra de carne artesanal.' AS descripcion, 35 AS orden_carta UNION ALL
  SELECT 'CARTA-036' AS codigo, 'Extra Filete de Pollo' AS nombre, 'agregados' AS cat, 5.00 AS precio, 'COCINA' AS estacion, 'Porción extra de pechuga a la plancha.' AS descripcion, 36 AS orden_carta UNION ALL
  SELECT 'CARTA-037' AS codigo, 'Extra Desmenuzado' AS nombre, 'agregados' AS cat, 5.00 AS precio, 'COCINA' AS estacion, 'Porción extra de pollo desmenuzado.' AS descripcion, 37 AS orden_carta UNION ALL
  SELECT 'CARTA-038' AS codigo, 'Pollo Parte Pierna (1/4)' AS nombre, 'parrilla_simple' AS cat, 24.00 AS precio, 'PARRILLA' AS estacion, 'Pierna a la brasa con papas fritas y ensalada.' AS descripcion, 38 AS orden_carta UNION ALL
  SELECT 'CARTA-039' AS codigo, 'Pollo Pecho (1/4)' AS nombre, 'parrilla_simple' AS cat, 27.00 AS precio, 'PARRILLA' AS estacion, 'Pecho a la brasa con papas fritas y ensalada.' AS descripcion, 39 AS orden_carta UNION ALL
  SELECT 'CARTA-040' AS codigo, 'Chuleta (300gr)' AS nombre, 'parrilla_simple' AS cat, 28.00 AS precio, 'PARRILLA' AS estacion, 'Chuleta de cerdo marinada a la leña con papas y ensalada.' AS descripcion, 40 AS orden_carta UNION ALL
  SELECT 'CARTA-041' AS codigo, 'Churrasco (300gr)' AS nombre, 'parrilla_simple' AS cat, 29.50 AS precio, 'PARRILLA' AS estacion, 'Corte de res a la parrilla con papas y ensalada.' AS descripcion, 41 AS orden_carta UNION ALL
  SELECT 'CARTA-042' AS codigo, 'Tira de Cerdo (350gr)' AS nombre, 'parrilla_simple' AS cat, 33.00 AS precio, 'PARRILLA' AS estacion, 'Costillar / tira de cerdo a la parrilla con papas y ensalada.' AS descripcion, 42 AS orden_carta UNION ALL
  SELECT 'CARTA-043' AS codigo, 'Pierna Grill (1/4)' AS nombre, 'parrilla_promo' AS cat, 21.50 AS precio, 'PARRILLA' AS estacion, 'Pierna con papas fritas y ensalada fresca.' AS descripcion, 43 AS orden_carta UNION ALL
  SELECT 'CARTA-044' AS codigo, 'Chuleta Power' AS nombre, 'parrilla_promo' AS cat, 25.00 AS precio, 'PARRILLA' AS estacion, 'Chuleta a la parrilla servida con papas y ensalada.' AS descripcion, 44 AS orden_carta UNION ALL
  SELECT 'CARTA-045' AS codigo, 'Churrasco Power' AS nombre, 'parrilla_promo' AS cat, 26.00 AS precio, 'PARRILLA' AS estacion, 'Corte churrasco a la parrilla con papas y ensalada.' AS descripcion, 45 AS orden_carta UNION ALL
  SELECT 'CARTA-046' AS codigo, 'Porción de Anticucho' AS nombre, 'agregados_parrilla' AS cat, 14.50 AS precio, 'COCINA' AS estacion, '2 palitos de anticucho tradicional + papas fritas.' AS descripcion, 46 AS orden_carta UNION ALL
  SELECT 'CARTA-047' AS codigo, 'Porción de Chorizo' AS nombre, 'agregados_parrilla' AS cat, 16.50 AS precio, 'COCINA' AS estacion, '2 unidades de chorizo parrillero + papas fritas.' AS descripcion, 47 AS orden_carta UNION ALL
  SELECT 'CARTA-048' AS codigo, 'Porción de Papas Fritas' AS nombre, 'agregados_parrilla' AS cat, 9.00 AS precio, 'COCINA' AS estacion, 'Papas fritas crujientes doradas.' AS descripcion, 48 AS orden_carta UNION ALL
  SELECT 'CARTA-049' AS codigo, 'Porción de Ensalada' AS nombre, 'agregados_parrilla' AS cat, 8.00 AS precio, 'COCINA' AS estacion, 'Ensalada fresca de estación con vinagreta de la casa.' AS descripcion, 49 AS orden_carta UNION ALL
  SELECT 'CARTA-050' AS codigo, 'Agregado de Chorizo Parrillero' AS nombre, 'agregados_parrilla' AS cat, 5.00 AS precio, 'COCINA' AS estacion, '1 unidad de chorizo parrillero a las brasas.' AS descripcion, 50 AS orden_carta UNION ALL
  SELECT 'CARTA-051' AS codigo, 'Pollo Pierna (1/4) Especial' AS nombre, 'parrilla_especial' AS cat, 29.50 AS precio, 'PARRILLA' AS estacion, 'Con chorizo o anticucho a tu elección + papas y ensalada.' AS descripcion, 51 AS orden_carta UNION ALL
  SELECT 'CARTA-052' AS codigo, 'Pollo Pecho (1/4) Especial' AS nombre, 'parrilla_especial' AS cat, 31.50 AS precio, 'PARRILLA' AS estacion, 'Con chorizo o anticucho a tu elección + papas y ensalada.' AS descripcion, 52 AS orden_carta UNION ALL
  SELECT 'CARTA-053' AS codigo, 'Chuleta (300gr) Especial' AS nombre, 'parrilla_especial' AS cat, 32.50 AS precio, 'PARRILLA' AS estacion, 'Con chorizo o anticucho a tu elección + papas y ensalada.' AS descripcion, 53 AS orden_carta UNION ALL
  SELECT 'CARTA-054' AS codigo, 'Churrasco (300gr) Especial' AS nombre, 'parrilla_especial' AS cat, 34.00 AS precio, 'PARRILLA' AS estacion, 'Con chorizo o anticucho a tu elección + papas y ensalada.' AS descripcion, 54 AS orden_carta UNION ALL
  SELECT 'CARTA-055' AS codigo, 'Tira de Cerdo (350gr) Especial' AS nombre, 'parrilla_especial' AS cat, 36.50 AS precio, 'PARRILLA' AS estacion, 'Con chorizo o anticucho a tu elección + papas y ensalada.' AS descripcion, 55 AS orden_carta UNION ALL
  SELECT 'CARTA-056' AS codigo, 'Bife (300gr)' AS nombre, 'parrilla_especial' AS cat, 35.00 AS precio, 'PARRILLA' AS estacion, 'Corte fino bife ancho/angosto con papas y ensalada.' AS descripcion, 56 AS orden_carta UNION ALL
  SELECT 'CARTA-057' AS codigo, 'Asado de Tira de Res (450gr)' AS nombre, 'parrilla_especial' AS cat, 40.00 AS precio, 'PARRILLA' AS estacion, 'Generoso corte de asado de tira con papas y ensalada.' AS descripcion, 57 AS orden_carta UNION ALL
  SELECT 'CARTA-058' AS codigo, 'Picaña (300gr)' AS nombre, 'parrilla_especial' AS cat, 40.00 AS precio, 'PARRILLA' AS estacion, 'Exquisita picaña jugosa a la parrilla con papas y ensalada.' AS descripcion, 58 AS orden_carta UNION ALL
  SELECT 'CARTA-059' AS codigo, 'Combo Carbón Grill Trío' AS nombre, 'parrillas_compartir' AS cat, 80.00 AS precio, 'NINGUNA' AS estacion, '1 Pierna de Pollo + 1 Chuleta + 1 Churrasco + 1 Chorizo + 2 Palitos de Anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)' AS descripcion, 59 AS orden_carta UNION ALL
  SELECT 'CARTA-060' AS codigo, 'Combo Carbón Grill Familiar' AS nombre, 'parrillas_compartir' AS cat, 110.00 AS precio, 'NINGUNA' AS estacion, '1 Pierna de pollo + 1 Chuleta + 1 Churrasco + 1/2 Tira de cerdo + 2 Chorizos + 2 Palitos de anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)' AS descripcion, 60 AS orden_carta UNION ALL
  SELECT 'CARTA-061' AS codigo, 'Combo Carbón Grill Mega Familiar' AS nombre, 'parrillas_compartir' AS cat, 175.00 AS precio, 'NINGUNA' AS estacion, '2 Piernas de pollo + 2 Chuletas + 2 Churrascos + 1 Tira de cerdo + 3 Chorizos + 3 Palitos de anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)' AS descripcion, 61 AS orden_carta UNION ALL
  SELECT 'CARTA-062' AS codigo, 'Chilcano Clásico' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco, ginger ale, gotas de amargo de angostura y limón.' AS descripcion, 62 AS orden_carta UNION ALL
  SELECT 'CARTA-063' AS codigo, 'Mojito' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Ron blanco, hierbabuena fresca, limón y soda.' AS descripcion, 63 AS orden_carta UNION ALL
  SELECT 'CARTA-064' AS codigo, 'Pisco Sour' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco peruano, zumo de limón, jarabe de goma y clara batida.' AS descripcion, 64 AS orden_carta UNION ALL
  SELECT 'CARTA-065' AS codigo, 'Cuba Libre' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Ron oscuro, coca cola y zumo de limón.' AS descripcion, 65 AS orden_carta UNION ALL
  SELECT 'CARTA-066' AS codigo, 'Tinto de Verano' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Vino tinto refrescante con gaseosa de limón y rodajas de cítricos.' AS descripcion, 66 AS orden_carta UNION ALL
  SELECT 'CARTA-067' AS codigo, 'Chilcano de Maracuyá' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco, concentrado de maracuyá fresco y ginger ale.' AS descripcion, 67 AS orden_carta UNION ALL
  SELECT 'CARTA-068' AS codigo, 'Machu Picchu' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Coctel tricolor con pisco, menta, jugo de naranja y granadina.' AS descripcion, 68 AS orden_carta UNION ALL
  SELECT 'CARTA-069' AS codigo, 'Piña Colada' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Ron, crema de coco y jugo de piña batido.' AS descripcion, 69 AS orden_carta UNION ALL
  SELECT 'CARTA-070' AS codigo, 'Daiquiri de Durazno' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Ron, pulpa de durazno frappeada y toque cítrico.' AS descripcion, 70 AS orden_carta UNION ALL
  SELECT 'CARTA-071' AS codigo, 'Perú Libre' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco peruano con gaseosa oscura y limón.' AS descripcion, 71 AS orden_carta UNION ALL
  SELECT 'CARTA-072' AS codigo, 'Pisco Inca' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco con toque dulce tradicional de la casa.' AS descripcion, 72 AS orden_carta UNION ALL
  SELECT 'CARTA-073' AS codigo, 'Laguna Azul' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Vodka, blue curaçao y gaseosa de limón.' AS descripcion, 73 AS orden_carta UNION ALL
  SELECT 'CARTA-074' AS codigo, 'Pisco Sunrise / Tequila Sunrise' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Pisco o Tequila con jugo de naranja y granadina.' AS descripcion, 74 AS orden_carta UNION ALL
  SELECT 'CARTA-075' AS codigo, 'Shirley Temple' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Refrescante preparación de ginger ale con granadina y cereza.' AS descripcion, 75 AS orden_carta UNION ALL
  SELECT 'CARTA-076' AS codigo, 'Incapari' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Combinación aperitiva especial.' AS descripcion, 76 AS orden_carta UNION ALL
  SELECT 'CARTA-077' AS codigo, 'Ron Punch' AS nombre, 'tragos_alcohol' AS cat, 15.00 AS precio, 'BAR' AS estacion, 'Ponche frutal tropical a base de ron.' AS descripcion, 77 AS orden_carta UNION ALL
  SELECT 'CARTA-078' AS codigo, 'Sangría (1 Litro)' AS nombre, 'vinos_cervezas' AS cat, 40.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L con vino tinto macerado en frutas frescas.' AS descripcion, 78 AS orden_carta UNION ALL
  SELECT 'CARTA-079' AS codigo, 'Sangría (1/2 Litro)' AS nombre, 'vinos_cervezas' AS cat, 20.00 AS precio, 'BAR' AS estacion, 'Media jarra de sangría frutal.' AS descripcion, 79 AS orden_carta UNION ALL
  SELECT 'CARTA-080' AS codigo, 'Cerveza Corona' AS nombre, 'vinos_cervezas' AS cat, 10.00 AS precio, 'BAR' AS estacion, 'Botella personal bien helada.' AS descripcion, 80 AS orden_carta UNION ALL
  SELECT 'CARTA-081' AS codigo, 'Vino S. Queirolo' AS nombre, 'vinos_cervezas' AS cat, 33.00 AS precio, 'BAR' AS estacion, 'Botella de vino Santiago Queirolo (Magdalena / Borgoña).' AS descripcion, 81 AS orden_carta UNION ALL
  SELECT 'CARTA-082' AS codigo, 'Vino Tabernero' AS nombre, 'vinos_cervezas' AS cat, 35.00 AS precio, 'BAR' AS estacion, 'Botella de vino Tabernero clásico.' AS descripcion, 82 AS orden_carta UNION ALL
  SELECT 'CARTA-083' AS codigo, 'Limonada Clásica (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 17.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L de limonada natural recién exprimida.' AS descripcion, 83 AS orden_carta UNION ALL
  SELECT 'CARTA-084' AS codigo, 'Limonada Frozen (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 19.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L frappeada al punto de nieve.' AS descripcion, 84 AS orden_carta UNION ALL
  SELECT 'CARTA-085' AS codigo, 'Limonada Eléctrica (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 19.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L con toque azul cítrico refrescante.' AS descripcion, 85 AS orden_carta UNION ALL
  SELECT 'CARTA-086' AS codigo, 'Limonada Eléctrica Frozen (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 21.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L eléctrica estilo frozen.' AS descripcion, 86 AS orden_carta UNION ALL
  SELECT 'CARTA-087' AS codigo, 'Maracuyá Clásica (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 19.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L de jugo de pura fruta de maracuyá.' AS descripcion, 87 AS orden_carta UNION ALL
  SELECT 'CARTA-088' AS codigo, 'Maracuyá Frozen (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 21.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L de maracuyá frappeada.' AS descripcion, 88 AS orden_carta UNION ALL
  SELECT 'CARTA-089' AS codigo, 'Limonada de Menta (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 19.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L con infusión refrescante de menta.' AS descripcion, 89 AS orden_carta UNION ALL
  SELECT 'CARTA-090' AS codigo, 'Limonada Menta Frozen (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 21.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L frappeada con hojas de menta fresca.' AS descripcion, 90 AS orden_carta UNION ALL
  SELECT 'CARTA-091' AS codigo, 'Limonada Cherry (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 19.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L de limonada infusionada con cereza.' AS descripcion, 91 AS orden_carta UNION ALL
  SELECT 'CARTA-092' AS codigo, 'Limonada Cherry Frozen (1 Litro)' AS nombre, 'bebidas_sin_alcohol' AS cat, 21.00 AS precio, 'BAR' AS estacion, 'Jarra de 1L limonada cherry frappeada.' AS descripcion, 92 AS orden_carta UNION ALL
  SELECT 'CARTA-093' AS codigo, 'Gaseosa Familiar 2.25 L' AS nombre, 'bebidas_sin_alcohol' AS cat, 16.00 AS precio, 'BAR' AS estacion, 'Botella grande descartable de 2.25 Litros.' AS descripcion, 93 AS orden_carta UNION ALL
  SELECT 'CARTA-094' AS codigo, 'Fresca Grill' AS nombre, 'mocteles' AS cat, 10.00 AS precio, 'BAR' AS estacion, 'Moctel sin alcohol a base de hierbabuena, cítricos y soda.' AS descripcion, 94 AS orden_carta UNION ALL
  SELECT 'CARTA-095' AS codigo, 'Golden Carbón' AS nombre, 'mocteles' AS cat, 10.00 AS precio, 'BAR' AS estacion, 'Moctel cítrico dorado con notas de naranja, mango y hielo.' AS descripcion, 95 AS orden_carta UNION ALL
  SELECT 'CARTA-096' AS codigo, 'Volcán Grill' AS nombre, 'mocteles' AS cat, 10.00 AS precio, 'BAR' AS estacion, 'Moctel rojo con frutos del bosque, fresa y burbujas.' AS descripcion, 96 AS orden_carta UNION ALL
  SELECT 'CARTA-097' AS codigo, 'Agua Mineral' AS nombre, 'bebidas_clasicas' AS cat, 3.50 AS precio, 'BAR' AS estacion, 'Botella personal con o sin gas.' AS descripcion, 97 AS orden_carta UNION ALL
  SELECT 'CARTA-098' AS codigo, 'Gaseosa 500ml (1/2 lt)' AS nombre, 'bebidas_clasicas' AS cat, 4.50 AS precio, 'BAR' AS estacion, 'Inca Kola, Coca Cola u otra opción personal.' AS descripcion, 98 AS orden_carta UNION ALL
  SELECT 'CARTA-099' AS codigo, '1 Lt de Chicha Morada' AS nombre, 'bebidas_clasicas' AS cat, 16.00 AS precio, 'BAR' AS estacion, 'Jarra de 1 Litro de maíz morado tradicional con manzana y canela.' AS descripcion, 99 AS orden_carta UNION ALL
  SELECT 'CARTA-100' AS codigo, '1/2 Lt de Chicha Morada' AS nombre, 'bebidas_clasicas' AS cat, 9.00 AS precio, 'BAR' AS estacion, 'Media jarra de chicha morada natural casera.' AS descripcion, 100 AS orden_carta
) v
INNER JOIN `producto_categoria` c ON c.codigo = v.cat AND c.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM `producto` p WHERE p.codigo = v.codigo);

INSERT INTO `producto_sucursal` (`id_producto`, `id_sucursal`, `disponible`, `precio_override`, `id_usuario_crea`)
SELECT p.id_producto, s.id_sucursal, 1, NULL, 1
FROM `producto` p
INNER JOIN `sucursal` s ON s.estado_registro = 'ACTIVO'
WHERE p.estado_registro = 'ACTIVO' AND p.visible_carta = 1
  AND NOT EXISTS (
    SELECT 1 FROM `producto_sucursal` ps
    WHERE ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal
  );

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_carta_visual' AS codigo, 'Ver administración de la carta visual pública' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'gestionar_carta_visual', 'Editar carta visual, fotos y promoción', 'UPDATE'
) v
INNER JOIN `sis_modulo` m ON m.nombre = 'CARTA'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_accion` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, a.id_accion
FROM `sis_accion` a
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'CARTA' AND a.codigo_accion IN ('ver_carta_visual', 'gestionar_carta_visual')
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT r.id_rol, a.id_accion
FROM `sis_rol` r
INNER JOIN `sis_accion` a ON a.codigo_accion IN ('ver_carta_visual', 'gestionar_carta_visual')
INNER JOIN `sis_modulo` m ON m.id_modulo = a.id_modulo AND m.nombre = 'CARTA'
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM `sis_permiso` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
