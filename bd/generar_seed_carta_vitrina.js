const fs = require('fs');
const path = require('path');

const categories = [
  { id: 'hamburguesas', name: 'Hamburguesas (Las Más Pedidas)', icon: '🍔', orden: 10 },
  { id: 'especiales', name: 'Especiales Carbón', icon: '🔥', orden: 20 },
  { id: 'alitas_boneless', name: 'Alitas & Boneless', icon: '🍗', orden: 30 },
  { id: 'arma_tu_burger', name: 'Arma tu Hamburguesa', icon: '🥩', orden: 40 },
  { id: 'agregados', name: 'Agregados & Extras', icon: '🥓', orden: 50 },
  { id: 'parrilla_simple', name: 'Parrilla Simple', icon: '🥩', orden: 60 },
  { id: 'parrilla_promo', name: 'Parrilla Promo', icon: '🏷️', orden: 70 },
  { id: 'parrilla_especial', name: 'Parrilla Especial', icon: '⭐', orden: 80 },
  { id: 'parrillas_compartir', name: 'Parrillas para Compartir', icon: '👨‍👩‍👧‍👦', orden: 90 },
  { id: 'agregados_parrilla', name: 'Agregados de Parrilla', icon: '🍢', orden: 100 },
  { id: 'tragos_alcohol', name: 'Cocteles y Tragos con Alcohol', icon: '🍹', orden: 110 },
  { id: 'vinos_cervezas', name: 'Vinos, Cervezas & Sangría', icon: '🍷', orden: 120 },
  { id: 'bebidas_sin_alcohol', name: 'Limonadas & Bebidas Sin Alcohol', icon: '🍋', orden: 130 },
  { id: 'mocteles', name: 'Mocteles (Sin Alcohol)', icon: '🍹', orden: 140 },
  { id: 'bebidas_clasicas', name: 'Bebidas Básicas & Chicha', icon: '🥤', orden: 150 },
];

const items = [
  [1, 'hamburguesas', 'Carbón Burguer', 10.0, 'Carne artesanal a la parrilla con lechuga y tomate frescos.'],
  [2, 'hamburguesas', 'Chorizo Parrillero', 10.0, 'Chorizo artesanal asado a las brasas de carbón.'],
  [3, 'hamburguesas', 'Royal Burguer', 11.5, 'Carne a la parrilla + Huevo frito montado.'],
  [4, 'hamburguesas', 'Matahambre', 11.5, 'Tortilla de embutidos seleccionados de la casa.'],
  [5, 'hamburguesas', 'Terminator', 18.0, 'Carne + Chorizo + Matahambre (Tortilla de embutidos).'],
  [6, 'hamburguesas', 'A lo Pobre', 15.0, 'Carne + Huevo + Plátano frito + Jamón + Queso fundido.'],
  [7, 'hamburguesas', 'Pollo a la Rusa', 11.5, 'Pollo tierno desmenuzado con ensalada rusa casera.'],
  [8, 'hamburguesas', 'Filete Hawaiana', 12.5, 'Filete de pechuga a la plancha con piña grillada.'],
  [9, 'hamburguesas', 'Filete Hawaiana + Queso', 13.5, 'Filete de pollo + Piña grillada + Queso derretido.'],
  [10, 'hamburguesas', 'Filete + Champiñón + Queso', 14.0, 'Filete de pollo grillado + Champiñones salteados + Queso.'],
  [11, 'hamburguesas', 'Carne + Champiñón + Queso', 13.5, 'Hamburguesa de res + Champiñones frescos + Queso.'],
  [12, 'hamburguesas', 'Carne + Chorizo + Huevo', 15.0, 'Carne + Chorizo parrillero + Huevo frito.'],
  [13, 'hamburguesas', 'Carne + Chorizo + Queso', 15.0, 'Carne + Chorizo parrillero + Queso derretido.'],
  [14, 'hamburguesas', 'Matahambre + Desmenuzado + Queso', 16.0, 'Tortilla de embutidos + Pollo desmenuzado + Queso.'],
  [15, 'hamburguesas', 'Matahambre + Filete + Queso', 16.0, 'Tortilla de embutidos + Filete de pollo + Queso.'],
  [16, 'hamburguesas', 'H. Vegetariana', 9.5, 'Opción 100% vegetariana con vegetales seleccionados.'],
  [17, 'especiales', 'Super Carbón Cheese', 15.5, 'Doble Carne a la brasa + Doble Queso derretido.'],
  [18, 'especiales', 'Carbón Crispi Chicken', 13.0, 'Pechuga de pollo extra crujiente con salsas artesanales.'],
  [19, 'especiales', 'Carbón Filete Grill', 12.0, 'Filete de pollo a la parrilla + Ensalada especial.'],
  [20, 'alitas_boneless', 'Alitas (10 unidades)', 28.0, '10 piezas crujientes bañadas en tu salsa favorita.'],
  [21, 'alitas_boneless', 'Alitas (5 unidades)', 15.0, '5 piezas crujientes bañadas en tu salsa favorita.'],
  [22, 'alitas_boneless', 'Boneless (8 unidades)', 21.0, '8 bocados de pechuga crocante bañados en tu salsa favorita.'],
  [23, 'arma_tu_burger', 'Filete de Pollo', 11.0, 'Base de pechuga sellada a la plancha.'],
  [24, 'arma_tu_burger', 'Pollo Desmenuzado', 10.0, 'Base de pollo tierno y jugoso.'],
  [25, 'arma_tu_burger', 'Chorizo Parrillero', 10.0, 'Base de chorizo parrillero a las brasas.'],
  [26, 'agregados', 'Queso', 1.5, 'Porción de queso derretido.'],
  [27, 'agregados', 'Jamón', 1.0, 'Lámina de jamón inglés.'],
  [28, 'agregados', 'Huevo', 1.5, 'Huevo frito montado.'],
  [29, 'agregados', 'Hot Dog Frankfuter', 1.0, 'Salchicha frankfurter sellada.'],
  [30, 'agregados', 'Plátano', 1.0, 'Plátano frito dulce.'],
  [31, 'agregados', 'Champiñón', 2.0, 'Champiñones frescos salteados.'],
  [32, 'agregados', 'Piña', 1.5, 'Rodaja de piña al grill.'],
  [33, 'agregados', 'Tocino', 2.0, 'Tiras de tocino crujiente.'],
  [34, 'agregados', 'Extra Chorizo', 5.0, 'Porción extra de chorizo parrillero.'],
  [35, 'agregados', 'Extra Carne de Hamburguesa', 5.0, 'Porción extra de carne artesanal.'],
  [36, 'agregados', 'Extra Filete de Pollo', 5.0, 'Porción extra de pechuga a la plancha.'],
  [37, 'agregados', 'Extra Desmenuzado', 5.0, 'Porción extra de pollo desmenuzado.'],
  [38, 'parrilla_simple', 'Pollo Parte Pierna (1/4)', 24.0, 'Pierna a la brasa con papas fritas y ensalada.'],
  [39, 'parrilla_simple', 'Pollo Pecho (1/4)', 27.0, 'Pecho a la brasa con papas fritas y ensalada.'],
  [40, 'parrilla_simple', 'Chuleta (300gr)', 28.0, 'Chuleta de cerdo marinada a la leña con papas y ensalada.'],
  [41, 'parrilla_simple', 'Churrasco (300gr)', 29.5, 'Corte de res a la parrilla con papas y ensalada.'],
  [42, 'parrilla_simple', 'Tira de Cerdo (350gr)', 33.0, 'Costillar / tira de cerdo a la parrilla con papas y ensalada.'],
  [43, 'parrilla_promo', 'Pierna Grill (1/4)', 21.5, 'Pierna con papas fritas y ensalada fresca.'],
  [44, 'parrilla_promo', 'Chuleta Power', 25.0, 'Chuleta a la parrilla servida con papas y ensalada.'],
  [45, 'parrilla_promo', 'Churrasco Power', 26.0, 'Corte churrasco a la parrilla con papas y ensalada.'],
  [46, 'agregados_parrilla', 'Porción de Anticucho', 14.5, '2 palitos de anticucho tradicional + papas fritas.'],
  [47, 'agregados_parrilla', 'Porción de Chorizo', 16.5, '2 unidades de chorizo parrillero + papas fritas.'],
  [48, 'agregados_parrilla', 'Porción de Papas Fritas', 9.0, 'Papas fritas crujientes doradas.'],
  [49, 'agregados_parrilla', 'Porción de Ensalada', 8.0, 'Ensalada fresca de estación con vinagreta de la casa.'],
  [50, 'agregados_parrilla', 'Agregado de Chorizo Parrillero', 5.0, '1 unidad de chorizo parrillero a las brasas.'],
  [51, 'parrilla_especial', 'Pollo Pierna (1/4) Especial', 29.5, 'Con chorizo o anticucho a tu elección + papas y ensalada.'],
  [52, 'parrilla_especial', 'Pollo Pecho (1/4) Especial', 31.5, 'Con chorizo o anticucho a tu elección + papas y ensalada.'],
  [53, 'parrilla_especial', 'Chuleta (300gr) Especial', 32.5, 'Con chorizo o anticucho a tu elección + papas y ensalada.'],
  [54, 'parrilla_especial', 'Churrasco (300gr) Especial', 34.0, 'Con chorizo o anticucho a tu elección + papas y ensalada.'],
  [55, 'parrilla_especial', 'Tira de Cerdo (350gr) Especial', 36.5, 'Con chorizo o anticucho a tu elección + papas y ensalada.'],
  [56, 'parrilla_especial', 'Bife (300gr)', 35.0, 'Corte fino bife ancho/angosto con papas y ensalada.'],
  [57, 'parrilla_especial', 'Asado de Tira de Res (450gr)', 40.0, 'Generoso corte de asado de tira con papas y ensalada.'],
  [58, 'parrilla_especial', 'Picaña (300gr)', 40.0, 'Exquisita picaña jugosa a la parrilla con papas y ensalada.'],
  [59, 'parrillas_compartir', 'Combo Carbón Grill Trío', 80.0, '1 Pierna de Pollo + 1 Chuleta + 1 Churrasco + 1 Chorizo + 2 Palitos de Anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)'],
  [60, 'parrillas_compartir', 'Combo Carbón Grill Familiar', 110.0, '1 Pierna de pollo + 1 Chuleta + 1 Churrasco + 1/2 Tira de cerdo + 2 Chorizos + 2 Palitos de anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)'],
  [61, 'parrillas_compartir', 'Combo Carbón Grill Mega Familiar', 175.0, '2 Piernas de pollo + 2 Chuletas + 2 Churrascos + 1 Tira de cerdo + 3 Chorizos + 3 Palitos de anticucho + Papas fritas y ensalada. (Cambio a Pecho +S/5.00)'],
  [62, 'tragos_alcohol', 'Chilcano Clásico', 15.0, 'Pisco, ginger ale, gotas de amargo de angostura y limón.'],
  [63, 'tragos_alcohol', 'Mojito', 15.0, 'Ron blanco, hierbabuena fresca, limón y soda.'],
  [64, 'tragos_alcohol', 'Pisco Sour', 15.0, 'Pisco peruano, zumo de limón, jarabe de goma y clara batida.'],
  [65, 'tragos_alcohol', 'Cuba Libre', 15.0, 'Ron oscuro, coca cola y zumo de limón.'],
  [66, 'tragos_alcohol', 'Tinto de Verano', 15.0, 'Vino tinto refrescante con gaseosa de limón y rodajas de cítricos.'],
  [67, 'tragos_alcohol', 'Chilcano de Maracuyá', 15.0, 'Pisco, concentrado de maracuyá fresco y ginger ale.'],
  [68, 'tragos_alcohol', 'Machu Picchu', 15.0, 'Coctel tricolor con pisco, menta, jugo de naranja y granadina.'],
  [69, 'tragos_alcohol', 'Piña Colada', 15.0, 'Ron, crema de coco y jugo de piña batido.'],
  [70, 'tragos_alcohol', 'Daiquiri de Durazno', 15.0, 'Ron, pulpa de durazno frappeada y toque cítrico.'],
  [71, 'tragos_alcohol', 'Perú Libre', 15.0, 'Pisco peruano con gaseosa oscura y limón.'],
  [72, 'tragos_alcohol', 'Pisco Inca', 15.0, 'Pisco con toque dulce tradicional de la casa.'],
  [73, 'tragos_alcohol', 'Laguna Azul', 15.0, 'Vodka, blue curaçao y gaseosa de limón.'],
  [74, 'tragos_alcohol', 'Pisco Sunrise / Tequila Sunrise', 15.0, 'Pisco o Tequila con jugo de naranja y granadina.'],
  [75, 'tragos_alcohol', 'Shirley Temple', 15.0, 'Refrescante preparación de ginger ale con granadina y cereza.'],
  [76, 'tragos_alcohol', 'Incapari', 15.0, 'Combinación aperitiva especial.'],
  [77, 'tragos_alcohol', 'Ron Punch', 15.0, 'Ponche frutal tropical a base de ron.'],
  [78, 'vinos_cervezas', 'Sangría (1 Litro)', 40.0, 'Jarra de 1L con vino tinto macerado en frutas frescas.'],
  [79, 'vinos_cervezas', 'Sangría (1/2 Litro)', 20.0, 'Media jarra de sangría frutal.'],
  [80, 'vinos_cervezas', 'Cerveza Corona', 10.0, 'Botella personal bien helada.'],
  [81, 'vinos_cervezas', 'Vino S. Queirolo', 33.0, 'Botella de vino Santiago Queirolo (Magdalena / Borgoña).'],
  [82, 'vinos_cervezas', 'Vino Tabernero', 35.0, 'Botella de vino Tabernero clásico.'],
  [83, 'bebidas_sin_alcohol', 'Limonada Clásica (1 Litro)', 17.0, 'Jarra de 1L de limonada natural recién exprimida.'],
  [84, 'bebidas_sin_alcohol', 'Limonada Frozen (1 Litro)', 19.0, 'Jarra de 1L frappeada al punto de nieve.'],
  [85, 'bebidas_sin_alcohol', 'Limonada Eléctrica (1 Litro)', 19.0, 'Jarra de 1L con toque azul cítrico refrescante.'],
  [86, 'bebidas_sin_alcohol', 'Limonada Eléctrica Frozen (1 Litro)', 21.0, 'Jarra de 1L eléctrica estilo frozen.'],
  [87, 'bebidas_sin_alcohol', 'Maracuyá Clásica (1 Litro)', 19.0, 'Jarra de 1L de jugo de pura fruta de maracuyá.'],
  [88, 'bebidas_sin_alcohol', 'Maracuyá Frozen (1 Litro)', 21.0, 'Jarra de 1L de maracuyá frappeada.'],
  [89, 'bebidas_sin_alcohol', 'Limonada de Menta (1 Litro)', 19.0, 'Jarra de 1L con infusión refrescante de menta.'],
  [90, 'bebidas_sin_alcohol', 'Limonada Menta Frozen (1 Litro)', 21.0, 'Jarra de 1L frappeada con hojas de menta fresca.'],
  [91, 'bebidas_sin_alcohol', 'Limonada Cherry (1 Litro)', 19.0, 'Jarra de 1L de limonada infusionada con cereza.'],
  [92, 'bebidas_sin_alcohol', 'Limonada Cherry Frozen (1 Litro)', 21.0, 'Jarra de 1L limonada cherry frappeada.'],
  [93, 'bebidas_sin_alcohol', 'Gaseosa Familiar 2.25 L', 16.0, 'Botella grande descartable de 2.25 Litros.'],
  [94, 'mocteles', 'Fresca Grill', 10.0, 'Moctel sin alcohol a base de hierbabuena, cítricos y soda.'],
  [95, 'mocteles', 'Golden Carbón', 10.0, 'Moctel cítrico dorado con notas de naranja, mango y hielo.'],
  [96, 'mocteles', 'Volcán Grill', 10.0, 'Moctel rojo con frutos del bosque, fresa y burbujas.'],
  [97, 'bebidas_clasicas', 'Agua Mineral', 3.5, 'Botella personal con o sin gas.'],
  [98, 'bebidas_clasicas', 'Gaseosa 500ml (1/2 lt)', 4.5, 'Inca Kola, Coca Cola u otra opción personal.'],
  [99, 'bebidas_clasicas', '1 Lt de Chicha Morada', 16.0, 'Jarra de 1 Litro de maíz morado tradicional con manzana y canela.'],
  [100, 'bebidas_clasicas', '1/2 Lt de Chicha Morada', 9.0, 'Media jarra de chicha morada natural casera.'],
];

const bar = new Set(['tragos_alcohol', 'vinos_cervezas', 'bebidas_sin_alcohol', 'mocteles', 'bebidas_clasicas']);
const cocina = new Set(['agregados', 'agregados_parrilla']);
function estacion(cat) {
  if (bar.has(cat)) return 'BAR';
  if (cocina.has(cat)) return 'COCINA';
  if (cat === 'parrillas_compartir') return 'NINGUNA';
  return 'PARRILLA';
}
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

const catSelects = categories
  .map(
    (c) =>
      `  SELECT '${esc(c.id)}' AS codigo, '${esc(c.name)}' AS nombre, '${esc(c.icon)}' AS icono, ${c.orden} AS orden`,
  )
  .join(' UNION ALL\n');

const itemSelects = items
  .map(([id, cat, name, price, desc]) => {
    const codigo = `CARTA-${String(id).padStart(3, '0')}`;
    return `  SELECT '${codigo}' AS codigo, '${esc(name)}' AS nombre, '${esc(cat)}' AS cat, ${Number(price).toFixed(2)} AS precio, '${estacion(cat)}' AS estacion, '${esc(desc)}' AS descripcion, ${id} AS orden_carta`;
  })
  .join(' UNION ALL\n');

const sql = `-- ==============================================================================
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
  'ALTER TABLE \`producto_categoria\` ADD COLUMN \`codigo\` varchar(40) DEFAULT NULL AFTER \`nombre\`',
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
  'ALTER TABLE \`producto_categoria\` ADD UNIQUE KEY \`uk_categoria_codigo\` (\`codigo\`)',
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
  'ALTER TABLE \`producto_categoria\` ADD COLUMN \`icono\` varchar(16) DEFAULT NULL AFTER \`codigo\`',
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
  'ALTER TABLE \`producto\` ADD COLUMN \`imagen\` varchar(255) DEFAULT NULL AFTER \`descripcion\`',
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
  'ALTER TABLE \`producto\` ADD COLUMN \`visible_carta\` tinyint(1) NOT NULL DEFAULT 0 AFTER \`imagen\`',
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
  'ALTER TABLE \`producto\` ADD COLUMN \`orden_carta\` int NOT NULL DEFAULT 0 AFTER \`visible_carta\`',
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
  'ALTER TABLE \`producto\` MODIFY COLUMN \`descripcion\` varchar(500) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt7 FROM @sql7;
EXECUTE stmt7;
DEALLOCATE PREPARE stmt7;

CREATE TABLE IF NOT EXISTS \`carta_vitrina\` (
  \`id_carta_vitrina\` int NOT NULL AUTO_INCREMENT,
  \`nombre\` varchar(120) NOT NULL,
  \`tagline\` varchar(200) DEFAULT NULL,
  \`promo\` varchar(255) DEFAULT NULL,
  \`moneda\` varchar(8) NOT NULL DEFAULT 'S/',
  \`estado_registro\` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  \`id_usuario_crea\` int NOT NULL,
  \`id_usuario_mod\` int DEFAULT NULL,
  PRIMARY KEY (\`id_carta_vitrina\`),
  CONSTRAINT \`fk_cv_crea\` FOREIGN KEY (\`id_usuario_crea\`) REFERENCES \`sis_usuario\` (\`id_usuario\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_cv_mod\` FOREIGN KEY (\`id_usuario_mod\`) REFERENCES \`sis_usuario\` (\`id_usuario\`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Configuración de la carta visual pública /carta';

INSERT INTO \`carta_vitrina\` (\`nombre\`, \`tagline\`, \`promo\`, \`moneda\`, \`id_usuario_crea\`)
SELECT 'Carbón Grill & Burgers', 'Hamburguesas • Alitas • Parrillas • Tragos',
       '¡Añade tu Papa Nativa por tan solo S/ 2.00!', 'S/', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM \`carta_vitrina\` WHERE \`estado_registro\` = 'ACTIVO');

CREATE TABLE IF NOT EXISTS \`carta_vitrina_tag\` (
  \`id_tag\` int NOT NULL AUTO_INCREMENT,
  \`tipo\` ENUM('SABOR','CHORIZO') NOT NULL,
  \`nombre\` varchar(80) NOT NULL,
  \`orden\` int NOT NULL DEFAULT 0,
  \`estado_registro\` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  \`id_usuario_crea\` int NOT NULL,
  \`id_usuario_mod\` int DEFAULT NULL,
  PRIMARY KEY (\`id_tag\`),
  KEY \`idx_cvtag_tipo\` (\`tipo\`, \`orden\`),
  CONSTRAINT \`fk_cvtag_crea\` FOREIGN KEY (\`id_usuario_crea\`) REFERENCES \`sis_usuario\` (\`id_usuario\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_cvtag_mod\` FOREIGN KEY (\`id_usuario_mod\`) REFERENCES \`sis_usuario\` (\`id_usuario\`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Sabores de alitas y chorizos a elección para la vitrina';

INSERT INTO \`carta_vitrina_tag\` (\`tipo\`, \`nombre\`, \`orden\`, \`id_usuario_crea\`)
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
  SELECT 1 FROM \`carta_vitrina_tag\` t
  WHERE t.tipo = v.tipo AND t.nombre = v.nombre AND t.estado_registro = 'ACTIVO'
);

INSERT INTO \`producto_categoria\` (\`nombre\`, \`codigo\`, \`icono\`, \`orden\`, \`id_usuario_crea\`)
SELECT v.nombre, v.codigo, v.icono, v.orden, 1
FROM (
${catSelects}
) v
WHERE NOT EXISTS (
  SELECT 1 FROM \`producto_categoria\` c WHERE c.codigo = v.codigo OR c.nombre = v.nombre
);

INSERT INTO \`producto\` (\`codigo\`, \`nombre\`, \`id_categoria\`, \`precio\`, \`es_combo\`, \`estacion\`, \`descripcion\`, \`visible_carta\`, \`orden_carta\`, \`id_usuario_crea\`)
SELECT v.codigo, v.nombre, c.id_categoria, v.precio, 0, v.estacion, v.descripcion, 1, v.orden_carta, 1
FROM (
${itemSelects}
) v
INNER JOIN \`producto_categoria\` c ON c.codigo = v.cat AND c.estado_registro = 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM \`producto\` p WHERE p.codigo = v.codigo);

INSERT INTO \`producto_sucursal\` (\`id_producto\`, \`id_sucursal\`, \`disponible\`, \`precio_override\`, \`id_usuario_crea\`)
SELECT p.id_producto, s.id_sucursal, 1, NULL, 1
FROM \`producto\` p
INNER JOIN \`sucursal\` s ON s.estado_registro = 'ACTIVO'
WHERE p.estado_registro = 'ACTIVO' AND p.visible_carta = 1
  AND NOT EXISTS (
    SELECT 1 FROM \`producto_sucursal\` ps
    WHERE ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal
  );

INSERT INTO \`sis_accion\` (\`id_modulo\`, \`codigo_accion\`, \`descripcion\`, \`tipo_operacion\`)
SELECT m.id_modulo, v.codigo, v.descripcion, v.tipo
FROM (
  SELECT 'ver_carta_visual' AS codigo, 'Ver administración de la carta visual pública' AS descripcion, 'READ' AS tipo UNION ALL
  SELECT 'gestionar_carta_visual', 'Editar carta visual, fotos y promoción', 'UPDATE'
) v
INNER JOIN \`sis_modulo\` m ON m.nombre = 'CARTA'
WHERE NOT EXISTS (
  SELECT 1 FROM \`sis_accion\` a WHERE a.id_modulo = m.id_modulo AND a.codigo_accion = v.codigo
);

INSERT INTO \`sis_permiso\` (\`id_rol\`, \`id_accion\`)
SELECT 1, a.id_accion
FROM \`sis_accion\` a
INNER JOIN \`sis_modulo\` m ON m.id_modulo = a.id_modulo
WHERE m.nombre = 'CARTA' AND a.codigo_accion IN ('ver_carta_visual', 'gestionar_carta_visual')
  AND NOT EXISTS (SELECT 1 FROM \`sis_permiso\` p WHERE p.id_rol = 1 AND p.id_accion = a.id_accion);

INSERT INTO \`sis_permiso\` (\`id_rol\`, \`id_accion\`)
SELECT r.id_rol, a.id_accion
FROM \`sis_rol\` r
INNER JOIN \`sis_accion\` a ON a.codigo_accion IN ('ver_carta_visual', 'gestionar_carta_visual')
INNER JOIN \`sis_modulo\` m ON m.id_modulo = a.id_modulo AND m.nombre = 'CARTA'
WHERE r.nombre = 'ADMIN_SUCURSAL'
  AND NOT EXISTS (SELECT 1 FROM \`sis_permiso\` p WHERE p.id_rol = r.id_rol AND p.id_accion = a.id_accion);

COMMIT;
`;

const out = path.join(__dirname, 'BD_CARBON_GRILL_CARTA_VITRINA.sql');
fs.writeFileSync(out, sql, 'utf8');
console.log('Escrito', out, 'items', items.length);
