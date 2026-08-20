import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize, forkJoin } from 'rxjs';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { InventarioService } from '../inventario/inventario.service';
import { TrasladosHttpService } from './traslados.service';

type TabTraslado = 'lista' | 'nuevo';

@Component({
  selector: 'app-traslados',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    NgbModalModule,
    NgSelectModule,
    TableProComponent,
    FormErrorComponent,
    ErpTabsComponent,
  ],
  templateUrl: './traslados.component.html',
  styleUrls: ['./traslados.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrasladosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(TrasladosHttpService);
  private inventario = inject(InventarioService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  public perms = inject(PermissionsService);

  tab = signal<TabTraslado>('lista');
  loading = signal(false);
  guardando = signal(false);

  almacenes = signal<any[]>([]);
  locales = signal<any[]>([]);
  insumos = signal<any[]>([]);
  tipos = signal<any[]>([]);
  estados = signal<string[]>([]);

  lista = signal<any[]>([]);
  meta = signal({ total: 0, page: 1, limit: 10 });
  detalle = signal<any | null>(null);
  recepcionItems = signal<any[]>([]);
  ingresoRapidoItems = signal<any[]>([]);
  ingresoRapidoSucursal = signal<number | null>(null);
  ingresoRapidoMotivo = 'COMPRA';
  guardandoIngreso = signal(false);

  tabs: ErpTab[] = [
    { id: 'lista', label: 'Documentos', icon: 'bi-list-ul' },
    { id: 'nuevo', label: 'Nueva solicitud', icon: 'bi-plus-circle' },
  ];

  filtros = this.fb.group({
    estado: [null as string | null],
    tipo: [null as string | null],
  });

  form = this.fb.group({
    tipo: ['DISTRIBUCION' as 'DISTRIBUCION' | 'TRANSFERENCIA', Validators.required],
    id_origen: [null as number | null, Validators.required],
    id_destino: [null as number | null, Validators.required],
    motivo: [''],
    items: this.fb.array([] as FormGroup[]),
  });

  ngOnInit() {
    this.cargarCatalogos();
    this.cargarLista();
    if (this.perms.hasPermission('solicitar_traslado')) {
      this.agregarItem();
    }
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  onTab(id: string) {
    this.tab.set(id as TabTraslado);
    if (id === 'lista') this.cargarLista();
  }

  cargarCatalogos() {
    this.service.catalogos().subscribe({
      next: (res) => {
        const data = this.unwrap(res);
        this.almacenes.set(data.almacenes || []);
        this.locales.set(data.locales || []);
        this.insumos.set(data.insumos || []);
        this.tipos.set(data.tipos || []);
        this.estados.set(data.estados || []);
      },
      error: () => this.alert.error('No se pudieron cargar catálogos de traslados.'),
    });
  }

  cargarLista(page = this.meta().page) {
    this.loading.set(true);
    this.service
      .lista(page, this.meta().limit, this.filtros.getRawValue())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          const payload = this.unwrapPaginado(res);
          this.lista.set(payload.data);
          this.meta.set(payload.meta);
        },
        error: () => this.alert.error('No se pudo cargar la lista de traslados.'),
      });
  }

  cambiarPagina(page: number) {
    this.meta.update((m) => ({ ...m, page }));
    this.cargarLista(page);
  }

  filtrar() {
    this.meta.update((m) => ({ ...m, page: 1 }));
    this.cargarLista(1);
  }

  onTipoChange() {
    this.form.patchValue({ id_origen: null, id_destino: null });
    this.refrescarStockItems();
  }

  onOrigenChange() {
    this.refrescarStockItems();
  }

  refrescarStockItems() {
    const idOrigen = this.form.get('id_origen')?.value;
    if (!idOrigen) {
      this.itemsArray.controls.forEach((grp) => grp.patchValue({ stock_origen: null }));
      return;
    }
    this.itemsArray.controls.forEach((grp, i) => {
      const idInsumo = grp.get('id_insumo')?.value;
      if (idInsumo) this.onInsumoOrigenChange(i);
      else grp.patchValue({ stock_origen: null });
    });
  }

  itemSinStock(i: number): boolean {
    const grp = this.itemsArray.at(i);
    const stock = grp.get('stock_origen')?.value;
    const cant = Number(grp.get('cantidad_enviada')?.value || 0);
    return stock != null && cant > Number(stock);
  }

  formularioSinStock(): boolean {
    return this.itemsArray.controls.some((_, i) => this.itemSinStock(i));
  }

  stockInsuficienteDetalle(): boolean {
    const d = this.detalle();
    return d?.stock_resumen?.ok === false;
  }

  faltantesDetalle(): any[] {
    return this.detalle()?.stock_resumen?.faltantes || [];
  }

  puedeAprobarODespachar(): boolean {
    const estado = this.detalle()?.estado;
    if (!['SOLICITADO', 'APROBADO'].includes(estado || '')) return true;
    return !this.stockInsuficienteDetalle();
  }

  agregarItem() {
    this.itemsArray.push(
      this.fb.group({
        id_insumo: [null as number | null, Validators.required],
        cantidad_enviada: [1, [Validators.required, Validators.min(0.0001)]],
        id_lote_origen: [null as number | null],
        stock_origen: [null as number | null],
      }),
    );
  }

  quitarItem(i: number) {
    if (this.itemsArray.length <= 1) return;
    this.itemsArray.removeAt(i);
  }

  onInsumoOrigenChange(i: number) {
    const grp = this.itemsArray.at(i);
    const idInsumo = grp.get('id_insumo')?.value;
    const idOrigen = this.form.get('id_origen')?.value;
    grp.patchValue({ id_lote_origen: null, stock_origen: null });
    if (!idInsumo || !idOrigen) return;
    forkJoin({
      stock: this.service.stockOrigen(idInsumo, idOrigen),
      lotes: this.inventario.lotes(idInsumo, idOrigen),
    }).subscribe({
      next: (res) => {
        const stock = this.unwrap(res.stock);
        grp.patchValue({ stock_origen: Number(stock?.stock_actual || 0) });
      },
    });
  }

  enviarSolicitud() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.id_origen === raw.id_destino) {
      this.alert.error('Origen y destino deben ser distintos.');
      return;
    }
    if (this.formularioSinStock()) {
      this.alert.error('Hay ítems con cantidad mayor al stock disponible en origen. Revise las cantidades o registre ingreso en el almacén.');
      return;
    }
    const payload = {
      tipo: raw.tipo,
      id_origen: raw.id_origen,
      id_destino: raw.id_destino,
      motivo: raw.motivo?.trim() || undefined,
      items: raw.items.map((it: any) => ({
        id_insumo: it.id_insumo,
        cantidad_enviada: it.cantidad_enviada,
        id_lote_origen: it.id_lote_origen || undefined,
      })),
    };

    this.guardando.set(true);
    this.service
      .crear(payload)
      .pipe(finalize(() => this.guardando.set(false)))
      .subscribe({
        next: () => {
          this.alert.success('Solicitud de traslado registrada.');
          this.form.reset({ tipo: 'DISTRIBUCION', motivo: '' });
          this.itemsArray.clear();
          this.agregarItem();
          this.tab.set('lista');
          this.cargarLista(1);
        },
        error: (e) => this.alert.error(e.error?.message || e.error?.mensaje || 'No se pudo crear la solicitud.'),
      });
  }

  abrirDetalle(modal: TemplateRef<any>, row: any) {
    this.service.detalle(row.id_traslado).subscribe({
      next: (res) => {
        const d = this.unwrap(res);
        this.detalle.set(d);
        if (d.estado === 'EN_TRANSITO') {
          this.recepcionItems.set(
            (d.items || []).map((it: any) => ({
              id_traslado_item: it.id_traslado_item,
              insumo: it.insumo,
              unidad_codigo: it.unidad_codigo,
              cantidad_enviada: Number(it.cantidad_enviada),
              cantidad_recibida: Number(it.cantidad_enviada),
              motivo_diferencia: 'MERMA_TRANSPORTE',
              detalle_diferencia: '',
            })),
          );
        }
        this.modal.open(modal, { size: 'lg', scrollable: true, backdrop: 'static' });
      },
      error: () => this.alert.error('No se pudo cargar el detalle.'),
    });
  }

  abrirIngresoRapido(modal: TemplateRef<any>, origen: 'detalle' | 'nuevo') {
    if (!this.perms.hasPermission('crear_movimiento')) {
      this.alert.error('No tiene permiso para registrar ingresos de inventario.');
      return;
    }

    let idSucursal: number | null = null;
    const items: any[] = [];

    if (origen === 'detalle') {
      const d = this.detalle();
      if (!d) return;
      idSucursal = Number(d.id_origen);
      for (const f of this.faltantesDetalle()) {
        const ins = this.insumos().find((x) => Number(x.id_insumo) === Number(f.id_insumo));
        items.push({
          id_insumo: f.id_insumo,
          insumo: f.insumo,
          unidad_codigo: f.unidad_codigo,
          cantidad: f.faltante,
          costo_unitario: Number(ins?.costo_unitario || 0),
        });
      }
    } else {
      idSucursal = Number(this.form.get('id_origen')?.value || 0) || null;
      this.itemsArray.controls.forEach((grp) => {
        const idInsumo = grp.get('id_insumo')?.value;
        const cant = Number(grp.get('cantidad_enviada')?.value || 0);
        const stock = Number(grp.get('stock_origen')?.value ?? 0);
        if (!idInsumo || cant <= stock) return;
        const ins = this.insumos().find((x) => Number(x.id_insumo) === Number(idInsumo));
        items.push({
          id_insumo: idInsumo,
          insumo: ins?.nombre || ins?.etiqueta || 'Insumo',
          unidad_codigo: ins?.unidad_codigo || '',
          cantidad: Math.max(0.0001, cant - stock),
          costo_unitario: Number(ins?.costo_unitario || 0),
        });
      });
    }

    if (!idSucursal || !items.length) {
      this.alert.warning('No hay ítems pendientes de stock en origen para ingresar.');
      return;
    }

    this.ingresoRapidoSucursal.set(idSucursal);
    this.ingresoRapidoMotivo = 'COMPRA';
    this.ingresoRapidoItems.set(items);
    this.modal.open(modal, { size: 'lg', scrollable: true, backdrop: 'static' });
  }

  guardarIngresoRapido(modal: any) {
    const items = this.ingresoRapidoItems();
    const idSucursal = this.ingresoRapidoSucursal();
    if (!idSucursal || !items.length) return;

    for (const it of items) {
      if (!(Number(it.cantidad) > 0)) {
        this.alert.error(`Cantidad inválida para ${it.insumo}`);
        return;
      }
    }

    this.guardandoIngreso.set(true);
    this.inventario
      .ingresoLote({
        id_sucursal: idSucursal,
        motivo: this.ingresoRapidoMotivo || 'COMPRA',
        detalle: 'Ingreso rápido desde traslados',
        items: items.map((it) => ({
          id_insumo: it.id_insumo,
          cantidad: Number(it.cantidad),
          costo_unitario: Number(it.costo_unitario),
        })),
      })
      .pipe(finalize(() => this.guardandoIngreso.set(false)))
      .subscribe({
        next: (res) => {
          const n = res?.registrados ?? res?.data?.registrados ?? items.length;
          this.alert.success(`Ingreso registrado: ${n} ítem(s) en origen.`);
          modal.close();
          const idTraslado = this.detalle()?.id_traslado;
          if (idTraslado) {
            this.service.detalle(idTraslado).subscribe({
              next: (r) => this.detalle.set(this.unwrap(r)),
            });
          } else {
            this.refrescarStockItems();
          }
        },
        error: (e: any) => {
          this.alert.error(e.error?.message || e.error?.mensaje || 'No se pudo registrar el ingreso.');
        },
      });
  }

  nombreSucursalIngreso(): string {
    const id = this.ingresoRapidoSucursal();
    const s = [...this.almacenes(), ...this.locales()].find((x) => Number(x.id_sucursal) === Number(id));
    return s?.nombre || 'Origen';
  }

  accion(id: number, tipo: 'aprobar' | 'rechazar' | 'despachar' | 'cancelar', modal?: any) {
    if ((tipo === 'aprobar' || tipo === 'despachar') && this.stockInsuficienteDetalle()) {
      this.alert.error(this.mensajeFaltantes());
      return;
    }
    const map: Record<string, { msg: string; fn: () => any }> = {
      aprobar: { msg: '¿Aprobar este traslado?', fn: () => this.service.aprobar(id) },
      rechazar: { msg: '¿Rechazar este traslado?', fn: () => this.service.rechazar(id) },
      despachar: { msg: '¿Despachar? Se descontará stock del origen.', fn: () => this.service.despachar(id) },
      cancelar: { msg: '¿Cancelar este traslado?', fn: () => this.service.cancelar(id) },
    };
    const cfg = map[tipo];
    this.alert.confirmAction('Confirmar', cfg.msg, 'Sí, continuar').then((ok) => {
      if (!ok) return;
      this.alert.showLoading('Procesando...');
      cfg.fn().subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          this.alert.success('Operación realizada.');
          modal?.close();
          this.detalle.set(this.unwrap(res));
          this.cargarLista();
        },
        error: (e: any) => {
          this.alert.closeLoading();
          const msg = e.error?.message || e.error?.mensaje;
          const faltantes = e.error?.faltantes;
          if (Array.isArray(faltantes) && faltantes.length) {
            this.alert.error(msg || this.formatFaltantes(faltantes));
          } else {
            this.alert.error(msg || 'No se pudo completar la operación.');
          }
        },
      });
    });
  }

  confirmarRecepcion(modal: any) {
    const items = this.recepcionItems();
    for (const it of items) {
      if (it.cantidad_recibida > it.cantidad_enviada) {
        this.alert.error(`Cantidad recibida inválida para ${it.insumo}`);
        return;
      }
      if (it.cantidad_recibida < it.cantidad_enviada && !it.motivo_diferencia) {
        this.alert.error(`Indique motivo de diferencia para ${it.insumo}`);
        return;
      }
    }
    this.alert.showLoading('Registrando recepción...');
    this.service
      .recibir(this.detalle()!.id_traslado, items.map((it) => ({
        id_traslado_item: it.id_traslado_item,
        cantidad_recibida: it.cantidad_recibida,
        motivo_diferencia: it.cantidad_recibida < it.cantidad_enviada ? it.motivo_diferencia : undefined,
        detalle_diferencia: it.detalle_diferencia || undefined,
      })))
      .subscribe({
        next: () => {
          this.alert.closeLoading();
          this.alert.success('Recepción confirmada.');
          modal.close();
          this.cargarLista();
        },
        error: (e) => {
          this.alert.closeLoading();
          this.alert.error(e.error?.message || e.error?.mensaje || 'No se pudo confirmar la recepción.');
        },
      });
  }

  etiquetaEstado(estado: string) {
    const map: Record<string, string> = {
      SOLICITADO: 'Solicitado',
      APROBADO: 'Aprobado',
      EN_TRANSITO: 'En tránsito',
      RECIBIDO: 'Recibido',
      RECHAZADO: 'Rechazado',
      CANCELADO: 'Cancelado',
    };
    return map[estado] || estado;
  }

  claseEstado(estado: string) {
    if (estado === 'RECIBIDO') return 'badge-success';
    if (estado === 'EN_TRANSITO') return 'badge-warning';
    if (estado === 'RECHAZADO' || estado === 'CANCELADO') return 'badge-danger';
    if (estado === 'APROBADO') return 'badge-primary';
    return 'badge-secondary';
  }

  etiquetaTipo(tipo: string) {
    return tipo === 'DISTRIBUCION' ? 'Distribución' : 'Transferencia';
  }

  motivosDiferencia = [
    { codigo: 'MERMA_TRANSPORTE', etiqueta: 'Merma en transporte' },
    { codigo: 'PRODUCTO_DANADO', etiqueta: 'Producto dañado' },
    { codigo: 'ERROR_CONTEO', etiqueta: 'Error de conteo' },
    { codigo: 'OTRO', etiqueta: 'Otro' },
  ];

  mensajeFaltantes(): string {
    return this.formatFaltantes(this.faltantesDetalle()) || 'Stock insuficiente en origen.';
  }

  formatFaltantes(faltantes: any[]): string {
    if (!faltantes?.length) return '';
    return faltantes
      .map((f) => `${f.insumo}: hay ${f.stock_origen}, se pide ${f.cantidad_enviada}`)
      .join(' · ');
  }

  private unwrap(res: any) {
    return res?.data ?? res ?? {};
  }

  private unwrapPaginado(res: any) {
    const data = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];
    const meta = res?.meta || res?.data?.meta || { total: data.length, page: 1, limit: 10 };
    return {
      data,
      meta: {
        total: Number(meta.total || 0),
        page: Number(meta.page || 1),
        limit: Number(meta.limit || 10),
      },
    };
  }
}
