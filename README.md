# APP Carbon Grill

Base NestJS + Angular + MariaDB (núcleo `sis_*`) para el sistema de **Carbon Grill**.

Clonada desde el stack `erp-nestjs-angular-base` (vía base limpia appCiberCafeZRV), **sin módulos de dominio**.

## Qué incluye

| Capa | Contenido |
|------|-----------|
| **BD** | `sis_modulo`, `sis_rol`, `sis_usuario`, `sis_accion`, `sis_permiso`, `sis_auditoria` + seed SUPERADMIN |
| **Backend** | Auth JWT, usuarios, roles/permisos, mail, dashboard base, libs (`auth`, `common`, `database`, `logger`, `security`) |
| **Frontend** | Login, layout admin, sidebar, usuarios, permisos, dashboard, shared UI (table-pro, ng-select, etc.) |

## Requisitos

- Node.js 20+
- XAMPP / MariaDB
- Angular CLI 21

## 1. Base de datos

```bash
mysql -u root -p < bd/BD_CARBON_GRILL_CORE.sql
```

Usuario inicial:

- Correo / usuario: `admin`
- Password: `123456` *(cambiar al primer ingreso)*

## 2. Backend

```bash
cd erp-backend
copy .env.example .env
# Editar DB_PASSWORD y JWT_SECRET
npm install
npm run start:dev
```

API: `http://localhost:3790/api` (puerto 3790 para no chocar con otros sistemas).

## 3. Frontend

```bash
cd erp-frontend
npm install
npm start
```

Abrir: `http://localhost:4203`

## Multi-local (varias tiendas / RUC)

Migración adicional (logo por sucursal + snapshot emisor en comprobantes):

```bash
mysql -u root -p app_carbon_grill < bd/BD_CARBON_GRILL_SUCURSAL_LOGO_SNAPSHOT.sql
```

Carta visual por local:

```bash
mysql -u root -p app_carbon_grill < bd/BD_CARBON_GRILL_CARTA_VITRINA_SUCURSAL.sql
```

Plano personalizable del salón (formas + referencias):

```bash
mysql -u root -p app_carbon_grill < bd/BD_CARBON_GRILL_SALON_MAPA.sql
```

Flujo operativo:

1. **SUPERADMIN** crea cada LOCAL en `/admin/sucursales` (RUC, Nubefact, logo, nombre comercial).
2. En **Personal** (`/admin/personal`) asigna cada usuario CAJA/MOZO a **un solo local** vigente.
3. Tras el login único, el sidebar y los vouchers muestran la marca del local asignado.
4. Producción SUNAT: `OSE_MODO=NUBEFACT` con URL/token Nubefact **por sucursal**.

## Agregar un módulo de dominio

1. Tabla(s) SQL + `sis_modulo` / `sis_accion` / `sis_permiso`
2. Backend en `erp-backend/apps/api/src/erp/<modulo>/`
3. Frontend en `erp-frontend/src/app/features/<modulo>/`
4. Ruta en `app.routes.ts` + ítem en `sidebar.ts`
5. Seguir `erp-backend/CLAUDE.md` y la skill `erp-nestjs-angular-base`
