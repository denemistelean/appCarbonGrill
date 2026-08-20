import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { permissionGuard } from './core/guards/permission.guard';
import { AdminLayout } from './core/layouts/admin-layout/admin-layout';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'm/:token',
    loadComponent: () => import('./features/carta-publica/carta-publica.component').then(m => m.CartaPublicaComponent),
  },
  {
    path: 'carta',
    loadComponent: () => import('./features/carta-vitrina/carta-vitrina-publica.component').then(m => m.CartaVitrinaPublicaComponent),
  },

  {
    path: '',
    component: AdminLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_dashboard' },
      },
      {
        path: 'admin/seguridad/permisos',
        loadComponent: () => import('./features/permisos/permisos.component').then(m => m.PermisosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_seguridad' },
      },
      {
        path: 'admin/usuarios',
        loadComponent: () => import('./features/usuarios/usuarios.component').then(m => m.UsuariosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_usuario' },
      },
      {
        path: 'admin/sucursales',
        loadComponent: () => import('./features/sucursales/sucursales.component').then(m => m.SucursalesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_sucursal' },
      },
      {
        path: 'admin/personal',
        loadComponent: () => import('./features/personal/personal.component').then(m => m.PersonalComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_personal' },
      },
      {
        path: 'catalogo/maestros',
        loadComponent: () => import('./features/maestros/maestros.component').then(m => m.MaestrosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_producto' },
      },
      {
        path: 'catalogo/insumos',
        loadComponent: () => import('./features/insumos/insumos.component').then(m => m.InsumosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_insumo' },
      },
      {
        path: 'catalogo/productos',
        loadComponent: () => import('./features/productos/productos.component').then(m => m.ProductosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_producto' },
      },
      {
        path: 'catalogo/carta-visual',
        loadComponent: () => import('./features/carta-vitrina/carta-vitrina-admin.component').then(m => m.CartaVitrinaAdminComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_carta_visual' },
      },
      {
        path: 'inventario',
        redirectTo: 'inventario/stock',
        pathMatch: 'full',
      },
      {
        path: 'inventario/stock',
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_inventario', seccion: 'stock' },
      },
      {
        path: 'inventario/movimientos',
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_inventario', seccion: 'movimientos' },
      },
      {
        path: 'inventario/kardex',
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_kardex', seccion: 'kardex' },
      },
      {
        path: 'inventario/mermas',
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_merma', seccion: 'mermas' },
      },
      {
        path: 'inventario/traslados',
        loadComponent: () => import('./features/traslados/traslados.component').then(m => m.TrasladosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_traslado' },
      },
      {
        path: 'salon',
        loadComponent: () => import('./features/salon/salon.component').then(m => m.SalonComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_mesa' },
      },
      {
        path: 'comandero',
        loadComponent: () => import('./features/comandero/comandero.component').then(m => m.ComanderoComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_pedido' },
      },
      {
        path: 'kds',
        loadComponent: () => import('./features/kds/kds.component').then(m => m.KdsComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_cocina' },
      },
      { path: 'cocina', redirectTo: 'kds', pathMatch: 'full' },
      {
        path: 'pos',
        loadComponent: () => import('./features/pos/pos.component').then(m => m.PosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_pos' },
      },
      {
        path: 'ventas/clientes',
        loadComponent: () => import('./features/clientes/clientes.component').then(m => m.ClientesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_cliente' },
      },
      {
        path: 'caja',
        loadComponent: () => import('./features/caja/caja.component').then(m => m.CajaComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_caja' },
      },
      {
        path: 'comprobantes',
        loadComponent: () => import('./features/comprobantes/comprobantes.component').then(m => m.ComprobantesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_comprobante' },
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reportes/reportes.component').then(m => m.ReportesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_reporte' },
      },
    ]
  },

  { path: '**', redirectTo: '' }
];
