import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

import { LayoutService } from '../../services/layout.service';
import { PermissionsService } from '../../services/seguridad/permissions.service';
import { AuthService } from '../../services/auth.service';
import { SessionContextService } from '../../services/session-context.service';
import { AlertService } from '../../services/ui/alert.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
  host: {
    '[class.closed]': '!isSidebarOpen()'
  }
})
export class Sidebar implements OnInit {
  layoutService = inject(LayoutService);
  perms = inject(PermissionsService);
  private authService = inject(AuthService);
  private sessionCtx = inject(SessionContextService);
  private alert = inject(AlertService);
  private router = inject(Router);

  searchControl = new FormControl('');
  searchTerm = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  isSidebarOpen = this.layoutService.sidebarOpen;
  private routeTick = signal(0);

  usuarioActual: any = null;
  logoError = signal(false);
  readonly ctx = this.sessionCtx;

  private rawMenu: any[] = [
    {
      label: 'Dashboard', icon: 'bi-speedometer2',
      route: '/dashboard', type: 'link', permiso: 'ver_dashboard'
    },

    {
      label: 'ADMINISTRACIÓN',
      type: 'dropdown',
      icon: 'bi-shield-lock',
      children: [
        {
          label: 'Usuarios', icon: 'bi-people-fill',
          route: '/admin/usuarios', type: 'link', permiso: 'ver_usuario'
        },
        {
          label: 'Roles y permisos', icon: 'bi-shield-lock-fill',
          route: '/admin/seguridad/permisos', type: 'link', permiso: 'ver_seguridad'
        },
        {
          label: 'Sucursales', icon: 'bi-buildings-fill',
          route: '/admin/sucursales', type: 'link', permiso: 'ver_sucursal'
        },
        {
          label: 'Personal', icon: 'bi-person-badge-fill',
          route: '/admin/personal', type: 'link', permiso: 'ver_personal'
        },
      ],
    },

    {
      label: 'CATÁLOGO',
      type: 'dropdown',
      icon: 'bi-journal-richtext',
      children: [
        {
          label: 'Maestros', icon: 'bi-sliders',
          route: '/catalogo/maestros', type: 'link', permiso: 'ver_producto'
        },
        {
          label: 'Insumos', icon: 'bi-basket-fill',
          route: '/catalogo/insumos', type: 'link', permiso: 'ver_insumo'
        },
        {
          label: 'Productos y recetas', icon: 'bi-egg-fried',
          route: '/catalogo/productos', type: 'link', permiso: 'ver_producto'
        },
        {
          label: 'Carta visual', icon: 'bi-journal-richtext',
          route: '/catalogo/carta-visual', type: 'link', permiso: 'ver_carta_visual'
        },
      ],
    },

    {
      label: 'INVENTARIO',
      type: 'dropdown',
      icon: 'bi-boxes',
      children: [
        {
          label: 'Stock', icon: 'bi-boxes',
          route: '/inventario/stock', type: 'link', permiso: 'ver_inventario'
        },
        {
          label: 'Movimientos', icon: 'bi-arrow-left-right',
          route: '/inventario/movimientos', type: 'link', permiso: 'ver_inventario'
        },
        {
          label: 'Kardex', icon: 'bi-journal-text',
          route: '/inventario/kardex', type: 'link', permiso: 'ver_kardex'
        },
        {
          label: 'Mermas', icon: 'bi-exclamation-triangle',
          route: '/inventario/mermas', type: 'link', permiso: 'ver_merma'
        },
        {
          label: 'Traslados', icon: 'bi-truck',
          route: '/inventario/traslados', type: 'link', permiso: 'ver_traslado'
        },
      ],
    },

    {
      label: 'SALÓN',
      type: 'dropdown',
      icon: 'bi-grid-3x3-gap',
      children: [
        {
          label: 'Mapa de mesas', icon: 'bi-diagram-3-fill',
          route: '/salon', type: 'link', permiso: 'ver_mesa'
        },
        {
          label: 'Comandero', icon: 'bi-journal-check',
          route: '/comandero', type: 'link', permiso: 'ver_pedido'
        },
        {
          label: 'KDS cocina/bar', icon: 'bi-fire',
          route: '/kds', type: 'link', permiso: 'ver_cocina'
        },
        {
          label: 'Venta mostrador', icon: 'bi-bag-check',
          route: '/pos', type: 'link', permiso: 'ver_pos'
        },
        {
          label: 'Clientes', icon: 'bi-person-vcard',
          route: '/ventas/clientes', type: 'link', permiso: 'ver_cliente'
        },
        {
          label: 'Caja y cobro', icon: 'bi-cash-stack',
          route: '/caja', type: 'link', permiso: 'ver_caja'
        },
        {
          label: 'Comprobantes SUNAT', icon: 'bi-receipt',
          route: '/comprobantes', type: 'link', permiso: 'ver_comprobante'
        },
        {
          label: 'Reportes y consolidado', icon: 'bi-bar-chart-line',
          route: '/reportes', type: 'link', permiso: 'ver_reporte'
        },
      ],
    },
  ];

  ngOnInit() {
    const userStr = localStorage.getItem('usuario');
    if (userStr) {
      try {
        this.usuarioActual = JSON.parse(userStr);
      } catch {
        // silencioso
      }
    }

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.routeTick.update((n) => n + 1);
      this.expandActiveGroups();
    });
    this.expandActiveGroups();
    if (!this.sessionCtx.loaded()) {
      this.sessionCtx.load();
    }
  }

  filteredMenu = computed(() => {
    this.routeTick();
    const text = (this.searchTerm() || '').toLowerCase();
    const isSearching = text.length > 0;
    const permsLoaded = this.perms.permissionsSignal().length > 0;

    const result = this.rawMenu.map((item) => {
      if (item.type === 'link') {
        if (permsLoaded && item.permiso && !this.perms.hasPermission(item.permiso)) return null;
        if (isSearching && !item.label.toLowerCase().includes(text)) return null;
        return { ...item };
      }

      if (item.type === 'dropdown') {
        let children = (item.children || []).filter((sub: any) => {
          if (permsLoaded && sub.permiso && !this.perms.hasPermission(sub.permiso)) return false;
          return true;
        });

        if (isSearching) {
          children = children.filter((sub: any) =>
            sub.label.toLowerCase().includes(text) || item.label.toLowerCase().includes(text)
          );
        }

        if (!children.length) return null;

        const active = isSearching || this.hasActiveChild({ ...item, children });
        return {
          ...item,
          children,
          active: item.active === true || active,
        };
      }

      return null;
    }).filter((x) => x !== null);

    return result;
  });

  toggleSubmenu(item: any) {
    item.active = !item.active;
    // Persiste el estado en rawMenu para no perder al recomputar
    const raw = this.rawMenu.find((m) => m.label === item.label && m.type === 'dropdown');
    if (raw) raw.active = item.active;
  }

  isChildActive(item: any): boolean {
    return this.hasActiveChild(item);
  }

  isExactActive(route: string): boolean {
    this.routeTick();
    const url = this.router.url.split('?')[0];
    return url === route || url === `${route}/`;
  }

  checkMobileClose() {
    if (window.innerWidth < 992) {
      this.layoutService.sidebarOpen.set(false);
    }
  }

  private expandActiveGroups() {
    for (const item of this.rawMenu) {
      if (item.type === 'dropdown' && this.hasActiveChild(item)) {
        item.active = true;
      }
    }
  }

  private hasActiveChild(item: any): boolean {
    if (!item.children) return false;
    const url = this.router.url.split('?')[0];
    return item.children.some((sub: any) => {
      if (!sub.route) return false;
      // exact match para no resaltar Inventario cuando estás en Transferencias
      return url === sub.route || url === `${sub.route}/`;
    });
  }

  logout() {
    this.alert.confirmAction('¿Cerrar Sesión?', 'Saldrás del sistema.', 'Sí, salir')
      .then((ok) => { if (ok) this.authService.logout(); });
  }
}
