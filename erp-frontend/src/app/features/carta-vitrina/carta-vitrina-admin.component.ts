import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { SessionContextService } from 'src/app/core/services/session-context.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { NumberFieldComponent } from 'src/app/shared/components/number-field/number-field.component';
import { CartaVitrinaHttpService } from './carta-vitrina.service';

type TabAdmin = 'platos' | 'negocio' | 'etiquetas';

@Component({
  selector: 'app-carta-vitrina-admin',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    NgbModalModule,
    NgSelectModule,
    TableProComponent,
    FormErrorComponent,
    ErpTabsComponent,
    NumberFieldComponent,
  ],
  templateUrl: './carta-vitrina-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartaVitrinaAdminComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(CartaVitrinaHttpService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private sessionContext = inject(SessionContextService);
  public perms = inject(PermissionsService);

  tab = signal<TabAdmin>('platos');
  loading = signal(false);
  sucursales = signal<any[]>([]);
  idSucursal = signal<number | null>(null);
  sucursalBloqueada = signal(false);
  productos = signal<any[]>([]);
  categorias = signal<any[]>([]);
  tags = signal<any[]>([]);
  filtro = signal('');
  visibilidad = signal<'todos' | 'visibles' | 'ocultos'>('todos');

  cartaUrl = () => {
    const id = this.idSucursal();
    return id ? `${window.location.origin}/carta?id_sucursal=${id}` : `${window.location.origin}/carta`;
  };

  sucursalLabel = () => {
    const id = this.idSucursal();
    const s = this.sucursales().find((x) => x.id_sucursal === id);
    return s?.nombre_comercial || s?.nombre || 'Local';
  };

  tabs: ErpTab[] = [
    { id: 'platos', label: 'Platos', icon: 'bi-grid' },
    { id: 'negocio', label: 'Negocio', icon: 'bi-shop' },
    { id: 'etiquetas', label: 'Sabores y chorizos', icon: 'bi-tags' },
  ];

  cfgForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    tagline: ['', Validators.maxLength(200)],
    promo: ['', Validators.maxLength(255)],
    moneda: ['S/', [Validators.required, Validators.maxLength(8)]],
    tema: ['carbon_grill' as string, Validators.required],
  });

  temasCarta = [
    { id: 'carbon_grill', nombre: 'Carbón Grill (oscuro)' },
    { id: 'don_papas', nombre: 'Don Papas (crema / burgundy)' },
  ];

  tagForm = this.fb.group({
    tipo: ['SABOR' as string, Validators.required],
    nombre: ['', [Validators.required, Validators.maxLength(80)]],
  });

  tiposTag = [
    { codigo: 'SABOR', etiqueta: 'Sabor alitas' },
    { codigo: 'CHORIZO', etiqueta: 'Chorizo parrilla' },
  ];

  prodForm = this.fb.group({
    id_producto: [null as number | null],
    id_categoria: [null as number | null, Validators.required],
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
    precio: [0, [Validators.required, Validators.min(0)]],
    precio_junior: [null as number | null],
    descripcion: ['', Validators.maxLength(500)],
    imagen_url: [''],
    visible_carta: [1],
    disponible: [1],
    estacion: ['PARRILLA'],
  });

  estaciones = [
    { id: 'PARRILLA', nombre: 'Parrilla' },
    { id: 'COCINA', nombre: 'Cocina' },
    { id: 'BAR', nombre: 'Bar' },
    { id: 'NINGUNA', nombre: 'Ninguna' },
  ];

  ngOnInit() {
    this.cargar();
  }

  onTab(id: string) {
    this.tab.set(id as TabAdmin);
  }

  cargar() {
    this.loading.set(true);
    this.service.admin(this.idSucursal()).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const data = res?.data ?? res ?? {};
        const list = data.sucursales || [];
        this.sucursales.set(list);
        const id = Number(data.id_sucursal || list[0]?.id_sucursal || this.sessionContext.idSucursal() || 0) || null;
        if (id) this.idSucursal.set(id);
        if (list.length === 1) this.sucursalBloqueada.set(true);
        else if (!this.sessionContext.esSuperadmin() && this.sessionContext.idSucursal()) {
          this.sucursalBloqueada.set(true);
        }
        this.productos.set(data.productos || data.items || []);
        this.categorias.set(data.categorias || []);
        this.tags.set(data.tags || []);
        const cfg = data.config || {};
        this.cfgForm.patchValue({
          nombre: cfg.nombre || '',
          tagline: cfg.tagline || '',
          promo: cfg.promo || '',
          moneda: cfg.moneda || 'S/',
          tema: cfg.tema || 'carbon_grill',
        });
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo cargar la carta visual.')),
    });
  }

  filtrados() {
    const q = this.filtro().toLowerCase().trim();
    const vis = this.visibilidad();
    return this.productos().filter((p) => {
      const visible = Number(p.visible_carta) === 1;
      if (vis === 'visibles' && !visible) return false;
      if (vis === 'ocultos' && visible) return false;
      if (!q) return true;
      return String(p.nombre).toLowerCase().includes(q) || String(p.categoria_nombre || '').toLowerCase().includes(q);
    });
  }

  onSucursalChange(id: number | null) {
    this.idSucursal.set(id);
    this.cargar();
  }

  guardarNegocio() {
    if (this.cfgForm.invalid) {
      this.cfgForm.markAllAsTouched();
      return;
    }
    this.service.guardarConfig(this.cfgForm.getRawValue(), this.idSucursal()).subscribe({
      next: () => this.alert.success('Datos del negocio actualizados.'),
      error: (e) => this.alert.error(this.msg(e, 'No se pudo guardar.')),
    });
  }

  crearTag() {
    if (this.tagForm.invalid) {
      this.tagForm.markAllAsTouched();
      return;
    }
    this.service.crearTag(this.tagForm.getRawValue(), this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('Etiqueta agregada.');
        this.tagForm.patchValue({ nombre: '' });
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo crear.')),
    });
  }

  borrarTag(row: any) {
    this.service.eliminarTag(row.id_tag, this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('Etiqueta quitada.');
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo eliminar.')),
    });
  }

  abrirProducto(tpl: TemplateRef<any>, item?: any) {
    this.prodForm.reset({
      id_producto: item?.id_producto || null,
      id_categoria: item?.id_categoria || null,
      nombre: item?.nombre || '',
      precio: item?.precio || 0,
      precio_junior: item?.precio_junior != null ? Number(item.precio_junior) : null,
      descripcion: item?.descripcion || '',
      imagen_url: item?.imagen?.startsWith?.('http') ? item.imagen : '',
      visible_carta: item?.visible_carta != null ? Number(item.visible_carta) : 1,
      disponible: item?.disponible != null ? Number(item.disponible) : 1,
      estacion: item?.estacion || (this.cfgForm.getRawValue().tema === 'don_papas' ? 'COCINA' : 'PARRILLA'),
    });
    this.modal.open(tpl, { centered: true, size: 'md' });
  }

  guardarProducto(modal: any) {
    if (this.prodForm.invalid) {
      this.prodForm.markAllAsTouched();
      return;
    }
    const raw = this.prodForm.getRawValue();
    this.service.guardarProducto(raw, this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('Plato guardado.');
        modal.close();
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo guardar el plato.')),
    });
  }

  toggle(row: any) {
    this.service.toggleDisponible(row.id_producto, this.idSucursal()).subscribe({
      next: () => this.cargar(),
      error: (e) => this.alert.error(this.msg(e, 'No se pudo cambiar la disponibilidad.')),
    });
  }

  quitar(row: any) {
    this.service.quitarProducto(row.id_producto, this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('Ocultado de la carta pública. Puedes volver a mostrarlo desde este listado.');
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo quitar.')),
    });
  }

  restaurar(row: any) {
    this.service.restaurarProducto(row.id_producto, this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('El plato volvió a la carta pública.');
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo mostrar en la carta.')),
    });
  }

  onFile(row: any, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.service.subirImagen(row.id_producto, file, this.idSucursal()).subscribe({
      next: () => {
        this.alert.success('Foto actualizada.');
        this.cargar();
      },
      error: (e) => this.alert.error(this.msg(e, 'No se pudo subir la foto.')),
    });
    input.value = '';
  }

  quitarFoto(row: any) {
    this.service.quitarImagen(row.id_producto, this.idSucursal()).subscribe({
      next: () => this.cargar(),
      error: (e) => this.alert.error(this.msg(e, 'No se pudo quitar la foto.')),
    });
  }

  urlFoto(item: any) {
    const img = String(item?.imagen || '').trim();
    if (!img) return '';
    if (img.startsWith('http') || img.startsWith('data:')) return img;
    return `${environment.uploadsUrl}${img.replace(/^\/+/, '')}`;
  }

  copiarUrl() {
    const url = this.cartaUrl();
    navigator.clipboard.writeText(url).then(
      () => this.alert.success('Enlace de la carta copiado.'),
      () => this.alert.warning(url),
    );
  }

  private msg(e: any, fallback: string) {
    return e?.error?.mensaje || e?.error?.message || fallback;
  }
}
