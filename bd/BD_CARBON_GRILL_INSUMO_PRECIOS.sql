-- Precio de venta referencial en catálogo de insumos (precio costo = costo_unitario existente)
-- Ejecutar una sola vez. Si la columna ya existe, ignorar el error o usar IF NOT EXISTS (MariaDB 10.0.2+).
ALTER TABLE `insumo`
  ADD COLUMN IF NOT EXISTS `precio_venta` decimal(12,2) NOT NULL DEFAULT 0.00
  COMMENT 'Precio venta referencial (S/)'
  AFTER `costo_unitario`;
