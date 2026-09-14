-- ==============================================================================
-- CARBON GRILL — Plano personalizable del salón (por sucursal)
-- Formas: RECT, L, CIRCLE, CUSTOM + landmarks (TV, baño, escalera...)
-- Ejecutar UNA vez sobre app_carbon_grill
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `salon_mapa` (
  `id_salon_mapa` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `tipo_forma` ENUM('RECT','L','CIRCLE','CUSTOM') NOT NULL DEFAULT 'RECT'
    COMMENT 'Plantilla del contorno del local',
  `puntos` json DEFAULT NULL
    COMMENT 'Vértices normalizados 0-100. CIRCLE: [[cx,cy],[rx,ry]]',
  `landmarks` json DEFAULT NULL
    COMMENT 'Referencias: [{tipo,x,y,etiqueta}]',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` int NOT NULL,
  `id_usuario_mod` int DEFAULT NULL,
  PRIMARY KEY (`id_salon_mapa`),
  UNIQUE KEY `uk_salon_mapa_suc` (`id_sucursal`),
  CONSTRAINT `fk_salon_mapa_suc` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursal` (`id_sucursal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_salon_mapa_crea` FOREIGN KEY (`id_usuario_crea`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_salon_mapa_mod` FOREIGN KEY (`id_usuario_mod`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Contorno y referencias visuales del mapa de mesas por local';

-- Seed rectangular por cada LOCAL activo sin plano
INSERT INTO `salon_mapa` (`id_sucursal`, `tipo_forma`, `puntos`, `landmarks`, `id_usuario_crea`)
SELECT s.id_sucursal, 'RECT',
       JSON_ARRAY(
         JSON_ARRAY(2, 2), JSON_ARRAY(98, 2),
         JSON_ARRAY(98, 98), JSON_ARRAY(2, 98)
       ),
       JSON_ARRAY(),
       1
FROM `sucursal` s
WHERE s.estado_registro = 'ACTIVO' AND s.tipo = 'LOCAL'
  AND NOT EXISTS (
    SELECT 1 FROM `salon_mapa` m
    WHERE m.id_sucursal = s.id_sucursal AND m.estado_registro = 'ACTIVO'
  );

COMMIT;
