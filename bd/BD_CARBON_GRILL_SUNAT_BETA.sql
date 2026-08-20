-- ==============================================================================
-- CARBON GRILL — Emisor de PRUEBAS SUNAT beta (mismas credenciales que Repuestos AT)
-- Ejecutar mientras OSE_MODO=BETA. En producción se cambiará al RUC real + Nubefact.
-- No altera sis_*.
-- ==============================================================================

USE app_carbon_grill;
START TRANSACTION;

UPDATE `sucursal`
SET
  ruc = '20481099936',
  razon_social = COALESCE(NULLIF(razon_social, ''), 'CARBON GRILL SAC'),
  nombre_comercial = COALESCE(NULLIF(nombre_comercial, ''), 'CARBON GRILL')
WHERE tipo = 'LOCAL' AND estado_registro = 'ACTIVO';

COMMIT;
