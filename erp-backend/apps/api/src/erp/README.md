# Módulos de negocio (`erp/`)

Aquí viven las features comerciales del POS/ERP (productos, ventas, inventario, caja, sucursales, etc.).

## Reglas

- Estructura plana por feature: `.dto.ts` · `.service.ts` · `.controller.ts` · `.module.ts`
- Registrar cada módulo nuevo en `apps/api/src/api.module.ts`
- Auth/permisos: usar guards existentes + `@RequirePermissions` — no reinventar
- Convenciones: `erp-backend/docs/CONVENCIONES-POS.md` + `CLAUDE.md`

## Actual

| Carpeta | Estado |
|---------|--------|
| `dashboard/` | Activo (resumen) |
| `organizacion/sucursales/` | Fase 1 |
| `organizacion/asignaciones/` | Fase 1 (personal ↔ sucursal) |
| `catalogo/maestros/` | Fase 2 (unidades, categorías) |
| `catalogo/insumos/` | Fase 2 |
| `catalogo/productos/` | Fase 2 (recetas, combos, precio sucursal) |
| `inventario/` | Fase 3 (stock por sucursal, kardex, lotes, mermas) |
| `mesas/` | Fase 4 (mapa de salón, estados, unir/separar) |
| `pedidos/` | Fase 5 (comandero, snapshot precio/costo) + Fase 6 (KDS WS, descuento BOM al PREPARAR) |
| `caja/` | Fase 7 (turno, pre-cuenta, cobro mixto, split ítems/partes) |
| `comprobantes/` | Fase 8 (boleta/factura/NC, series, OSE Nubefact o MOCK) |
| `carta/` | Fase 9 (QR de mesa, pre-pedido, llamar mozo; API pública sin JWT) |
| `reportes/` | Fase 10 (ventas, platos, rentabilidad, mermas, ocupación, cola ESC/POS) |
| `carta-vitrina/` | Carta visual pública `/carta` (distinta del QR `/m/:token`) |

JWT al reasignar personal: no se invalidan tokens existentes (el núcleo de login no se toca). Tras cambiar rol hay que volver a iniciar sesión.
