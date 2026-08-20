-- ==============================================================================
-- CARBON GRILL — CORE sis_*
-- ==============================================================================
-- Base reutilizable: modulos, roles, usuarios, acciones, permisos y auditoria.
-- Contrasena inicial del superadmin: 123456  (cambiar al primer ingreso)
-- ==============================================================================

DROP DATABASE IF EXISTS app_carbon_grill;
CREATE DATABASE IF NOT EXISTS app_carbon_grill;
USE app_carbon_grill;

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ==============================================================================
-- CORE DEL SISTEMA (SEGURIDAD Y AUDITORÃA) - INTOCABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `sis_modulo` (
  `id_modulo` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria del mÃ³dulo',
  `nombre` varchar(50) NOT NULL COMMENT 'Nombre interno del mÃ³dulo usado por @RequirePermissions (ej: USUARIOS)',
  `etiqueta` varchar(100) NOT NULL COMMENT 'Nombre legible que se mostrarÃ¡ en el menÃº (ej: Usuarios)',
  `estado_registro` ENUM('ACTIVO', 'ELIMINADO') NOT NULL DEFAULT 'ACTIVO' COMMENT 'Soft delete del mÃ³dulo',
  PRIMARY KEY (`id_modulo`),
  UNIQUE KEY `uk_nombre_modulo` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: Seguridad. CatÃ¡logo de mÃ³dulos principales del sistema.';

CREATE TABLE IF NOT EXISTS `sis_rol` (
  `id_rol` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria del rol',
  `nombre` varchar(50) NOT NULL COMMENT 'Nombre interno del rol (Ej: SUPERADMIN, CONTADOR)',
  `descripcion` text COMMENT 'Detalle de las responsabilidades de este rol',
  `estado_registro` ENUM('ACTIVO', 'ELIMINADO') NOT NULL DEFAULT 'ACTIVO' COMMENT 'Soft delete',
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `uk_nombre_rol` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: Seguridad. Roles de acceso para los usuarios.';

CREATE TABLE IF NOT EXISTS `sis_usuario` (
  `id_usuario` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria del usuario',
  `id_rol` int NOT NULL COMMENT 'Rol asignado al usuario',
  `nombres` varchar(100) NOT NULL COMMENT 'Nombres del usuario',
  `apellidos` varchar(100) NOT NULL COMMENT 'Apellidos del usuario',
  `correo` varchar(150) NOT NULL UNIQUE COMMENT 'Correo usado para el login',
  `password` varchar(255) NOT NULL COMMENT 'ContraseÃ±a encriptada (Hash)',
  `estado_registro` ENUM('ACTIVO', 'ELIMINADO', 'BLOQUEADO') NOT NULL DEFAULT 'ACTIVO' COMMENT 'Estado de acceso al sistema',
  `fecha_registro` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT 'CuÃ¡ndo se creÃ³ el usuario',
  PRIMARY KEY (`id_usuario`),
  CONSTRAINT `fk_sis_usuario_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: Seguridad. Usuarios con acceso al sistema web.';

CREATE TABLE IF NOT EXISTS `sis_accion` (
  `id_accion` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria de la acciÃ³n',
  `id_modulo` int NOT NULL COMMENT 'MÃ³dulo al que pertenece la acciÃ³n',
  `codigo_accion` varchar(50) NOT NULL COMMENT 'CÃ³digo para los guards del backend (ej: crear_usuario)',
  `descripcion` varchar(200) NOT NULL COMMENT 'ExplicaciÃ³n humana de quÃ© hace el micropoder',
  `tipo_operacion` ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'SPECIAL') NOT NULL DEFAULT 'READ' COMMENT 'Naturaleza del micropoder',
  `estado_registro` ENUM('ACTIVO', 'ELIMINADO') NOT NULL DEFAULT 'ACTIVO' COMMENT 'Soft delete',
  PRIMARY KEY (`id_accion`),
  UNIQUE KEY `uk_accion_modulo` (`id_modulo`, `codigo_accion`),
  CONSTRAINT `fk_sis_accion_modulo` FOREIGN KEY (`id_modulo`) REFERENCES `sis_modulo` (`id_modulo`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: Seguridad. Acciones o micropoderes especÃ­ficos por mÃ³dulo.';

CREATE TABLE IF NOT EXISTS `sis_permiso` (
  `id_permiso` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria del permiso',
  `id_rol` int NOT NULL COMMENT 'Rol al que se le da el permiso',
  `id_accion` int NOT NULL COMMENT 'AcciÃ³n que el rol puede ejecutar',
  `estado_registro` ENUM('ACTIVO', 'ELIMINADO') NOT NULL DEFAULT 'ACTIVO' COMMENT 'Soft delete',
  PRIMARY KEY (`id_permiso`),
  UNIQUE KEY `uk_rol_accion` (`id_rol`, `id_accion`),
  CONSTRAINT `fk_permiso_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`) ON DELETE CASCADE,
  CONSTRAINT `fk_permiso_accion` FOREIGN KEY (`id_accion`) REFERENCES `sis_accion` (`id_accion`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: Seguridad. Tabla pivote que une Roles con Acciones.';

CREATE TABLE IF NOT EXISTS `sis_auditoria` (
  `id_auditoria` int NOT NULL AUTO_INCREMENT COMMENT 'Llave primaria del registro forense',
  `nombre_tabla` varchar(50) NOT NULL COMMENT 'En quÃ© tabla ocurriÃ³ el cambio',
  `id_registro` int NOT NULL COMMENT 'ID de la fila afectada',
  `accion` ENUM('CREAR','ACTUALIZAR','ELIMINAR','ANULAR') NOT NULL COMMENT 'QuÃ© le hicieron al registro',
  `id_usuario` int NOT NULL COMMENT 'QuiÃ©n ejecutÃ³ la acciÃ³n',
  `valores_antiguos` JSON DEFAULT NULL COMMENT 'JSON con los datos antes del cambio',
  `valores_nuevos` JSON DEFAULT NULL COMMENT 'JSON con los datos despuÃ©s del cambio',
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'Momento exacto del suceso',
  PRIMARY KEY (`id_auditoria`),
  CONSTRAINT `fk_audit_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 COMMENT='MÃ“DULO: AuditorÃ­a. Tracker forense inmutable.';

-- ---------- SEED inicial ----------
-- Usuario: admin  |  Password: 123456  (bcrypt 10 rounds)

INSERT INTO `sis_rol` (`id_rol`, `nombre`, `descripcion`) VALUES
(1, 'SUPERADMIN', 'Rol con todos los permisos del sistema');

INSERT INTO `sis_usuario` (`id_usuario`, `id_rol`, `nombres`, `apellidos`, `correo`, `password`) VALUES
(1, 1, 'Super', 'Admin', 'admin', '$2b$10$BGlHSQGgS8b5iPw9zEh3SOP81mnYKQZ6zCHpWQUctlhDkuFTSBDYK');

INSERT INTO `sis_modulo` (`id_modulo`, `nombre`, `etiqueta`) VALUES
(1, 'USUARIOS', 'Usuarios'),
(2, 'SEGURIDAD', 'Seguridad'),
(3, 'DASHBOARD', 'Dashboard');

INSERT INTO `sis_accion` (`id_accion`, `id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`) VALUES
(1, 1, 'ver_usuario', 'Ver listado de usuarios', 'READ'),
(2, 1, 'crear_usuario', 'Crear usuario', 'CREATE'),
(3, 1, 'actualizar_usuario', 'Actualizar usuario', 'UPDATE'),
(4, 1, 'eliminar_usuario', 'Eliminar usuario', 'DELETE'),
(5, 2, 'ver_seguridad', 'Ver la matriz de roles y permisos', 'READ'),
(6, 3, 'ver_dashboard', 'Ver el dashboard con resumen de datos', 'READ'),
(7, 2, 'crear_seguridad', 'Crear roles', 'CREATE'),
(8, 2, 'actualizar_seguridad', 'Actualizar roles y permisos', 'UPDATE'),
(9, 2, 'eliminar_seguridad', 'Eliminar roles', 'DELETE');

INSERT INTO `sis_permiso` (`id_rol`, `id_accion`)
SELECT 1, id_accion FROM `sis_accion`;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

-- ==============================================================================
-- PROCEDIMIENTOS ALMACENADOS (CORE) â€” usados por NestJS vÃ­a CALL
-- ==============================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sis_usuario_crear//
CREATE PROCEDURE sis_usuario_crear(
    IN p_id_rol INT, IN p_id_cliente INT, IN p_nombres VARCHAR(100),
    IN p_apellidos VARCHAR(100), IN p_correo VARCHAR(150), IN p_password VARCHAR(255)
)
BEGIN
    INSERT INTO sis_usuario (id_rol, nombres, apellidos, correo, password)
    VALUES (p_id_rol, p_nombres, p_apellidos, p_correo, p_password);
    SELECT LAST_INSERT_ID() AS id_insertado;
END//

DROP PROCEDURE IF EXISTS sis_usuario_actualizar//
CREATE PROCEDURE sis_usuario_actualizar(
    IN p_id INT, IN p_id_rol INT, IN p_nombres VARCHAR(100),
    IN p_apellidos VARCHAR(100), IN p_correo VARCHAR(150)
)
BEGIN
    UPDATE sis_usuario SET id_rol = p_id_rol, nombres = p_nombres, apellidos = p_apellidos, correo = p_correo
    WHERE id_usuario = p_id;
END//

DROP PROCEDURE IF EXISTS sis_usuario_eliminar//
CREATE PROCEDURE sis_usuario_eliminar(IN p_id INT)
BEGIN
    UPDATE sis_usuario SET estado_registro = 'ELIMINADO' WHERE id_usuario = p_id;
END//

DROP PROCEDURE IF EXISTS sis_usuario_listar//
CREATE PROCEDURE sis_usuario_listar(IN p_id_rol INT, IN p_estado VARCHAR(20))
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE (p_id_rol IS NULL OR u.id_rol = p_id_rol)
      AND (p_estado IS NULL OR u.estado_registro = p_estado)
    ORDER BY u.apellidos ASC;
END//

DROP PROCEDURE IF EXISTS sis_usuario_obtener//
CREATE PROCEDURE sis_usuario_obtener(IN p_id INT)
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.id_rol, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE u.id_usuario = p_id AND u.estado_registro != 'ELIMINADO';
END//

DROP PROCEDURE IF EXISTS sis_usuario_obtener_por_correo//
CREATE PROCEDURE sis_usuario_obtener_por_correo(IN p_credencial VARCHAR(150))
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.password,
           u.id_rol, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE u.correo = p_credencial AND u.estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_auditoria_registrar//
CREATE PROCEDURE sis_auditoria_registrar(
    IN p_tabla VARCHAR(100), IN p_id_registro INT, IN p_accion VARCHAR(20),
    IN p_id_usuario INT, IN p_valores_antiguos JSON, IN p_valores_nuevos JSON
)
BEGIN
    INSERT INTO sis_auditoria (nombre_tabla, id_registro, accion, id_usuario, valores_antiguos, valores_nuevos)
    VALUES (p_tabla, p_id_registro, p_accion, p_id_usuario, p_valores_antiguos, p_valores_nuevos);
END//

DROP PROCEDURE IF EXISTS sis_rol_listar//
CREATE PROCEDURE sis_rol_listar()
BEGIN
    SELECT id_rol, nombre, descripcion FROM sis_rol WHERE estado_registro = 'ACTIVO' ORDER BY id_rol ASC;
END//

DROP PROCEDURE IF EXISTS sis_rol_crear//
CREATE PROCEDURE sis_rol_crear(IN p_nombre VARCHAR(50), IN p_descripcion TEXT)
BEGIN
    INSERT INTO sis_rol (nombre, descripcion, estado_registro) VALUES (p_nombre, p_descripcion, 'ACTIVO');
    SELECT LAST_INSERT_ID() AS id_insertado;
END//

DROP PROCEDURE IF EXISTS sis_rol_actualizar//
CREATE PROCEDURE sis_rol_actualizar(IN p_id INT, IN p_nombre VARCHAR(50), IN p_descripcion TEXT)
BEGIN
    UPDATE sis_rol SET nombre = p_nombre, descripcion = p_descripcion WHERE id_rol = p_id;
END//

DROP PROCEDURE IF EXISTS sis_rol_eliminar//
CREATE PROCEDURE sis_rol_eliminar(IN p_id INT)
BEGIN
    DECLARE v_total INT;
    SELECT COUNT(*) INTO v_total FROM sis_usuario WHERE id_rol = p_id AND estado_registro = 'ACTIVO';
    IF v_total > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede eliminar el rol porque tiene usuarios activos asignados.';
    END IF;
    UPDATE sis_rol SET estado_registro = 'ELIMINADO' WHERE id_rol = p_id;
END//

DROP PROCEDURE IF EXISTS sis_matriz_modulos_listar//
CREATE PROCEDURE sis_matriz_modulos_listar()
BEGIN
    SELECT m.id_modulo, m.nombre AS etiqueta, a.id_accion, a.codigo_accion AS codigo, a.descripcion
    FROM sis_modulo m LEFT JOIN sis_accion a ON m.id_modulo = a.id_modulo
    WHERE m.estado_registro = 'ACTIVO' ORDER BY m.id_modulo ASC, a.id_accion ASC;
END//

DROP PROCEDURE IF EXISTS sis_permiso_obtener_por_rol//
CREATE PROCEDURE sis_permiso_obtener_por_rol(IN p_id_rol INT)
BEGIN
    SELECT a.codigo_accion AS codigo FROM sis_permiso p INNER JOIN sis_accion a ON p.id_accion = a.id_accion
    WHERE p.id_rol = p_id_rol AND p.estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_permiso_ids_por_rol//
CREATE PROCEDURE sis_permiso_ids_por_rol(IN p_id_rol INT)
BEGIN
    SELECT id_accion FROM sis_permiso WHERE id_rol = p_id_rol AND estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_permiso_limpiar_rol//
CREATE PROCEDURE sis_permiso_limpiar_rol(IN p_id_rol INT)
BEGIN
    DELETE FROM sis_permiso WHERE id_rol = p_id_rol;
END//

DROP PROCEDURE IF EXISTS sis_permiso_asignar//
CREATE PROCEDURE sis_permiso_asignar(IN p_id_rol INT, IN p_id_accion INT)
BEGIN
    INSERT IGNORE INTO sis_permiso (id_rol, id_accion) VALUES (p_id_rol, p_id_accion);
END//

DELIMITER ;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

