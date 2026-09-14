import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize, forkJoin } from 'rxjs';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { NumberFieldComponent } from 'src/app/shared/components/number-field/number-field.component';
import { InventarioService } from './inventario.service';

type SeccionInventario = 'stock' | 'movimientos' | 'kardex' | 'mermas';
type MovimientoTipo = 'ingreso' | 'salida' | 'ajuste';
type IngresoModo = 'uno' | 'lote';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    NgbModalModule,
    NgSelectModule,
    TableProComponent,
    FormErrorComponent,
    NumberFieldComponent,
  ],
  templateUrl: './inventario.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    tr.kardex-grupo-inicio > td {
      border-top: 2px solid var(--erp-border-soft) !important;
      padding-top: 0.85rem;
    }
    tbody tr:first-child.kardex-grupo-inicio > td {
      border-top: none !important;
      padding-top: inherit;
    }

    .stock-total-wrap {
      display: inline-block;
      cursor: help;
      border-bottom: 1px dashed var(--erp-border-soft);
    }

    .stock-tooltip-floating {
      position: fixed;
      z-index: 1080;
      pointer-events: none;
      min-width: 17rem;
      padding: 0.65rem 0.75rem;
      background: var(--erp-inner-panel-bg);
      border: 1px solid var(--erp-border-soft);
      border-radius: var(--rad-md);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      text-align: left;
      font-weight: normal;
      font-size: var(--fs-xs);
      white-space: nowrap;
      transform: translateY(-100%);
    }

    .stock-tooltip-row {
      display: grid;
      grid-template-columns: minmax(8rem, 1fr) auto auto;
      gap: 0.35rem 0.75rem;
      align-items: center;
      line-height: 1.5;
    }

    .stock-tooltip-row + .stock-tooltip-row {
      margin-top: 0.2rem;
    }

    .stock-tooltip-nombre {
      color: var(--erp-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stock-tooltip-codigo {
      font-weight: var(--fw-bold);
      color: var(--erp-primary);
      text-align: center;
      min-width: 1.75rem;
    }

    .stock-tooltip-qty {
      font-weight: var(--fw-bold);
      color: var(--erp-text);
      text-align: right;
      min-width: 2.5rem;
    }
  `],
})
export class InventarioComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(InventarioService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  public perms = inject(PermissionsService);

  tab = signal<SeccionInventario>('stock');
  movimientoTipo = signal<MovimientoTipo>('ingreso');
  ingresoModo = signal<IngresoModo>('uno');
  sucursalBloqueada = signal(false);

  sucursales = signal<any[]>([]);
  insumos = signal<any[]>([]);
  lotes = signal<any[]>([]);
  motivos = signal<any[]>([]);
  resumenMermas = signal<any[]>([]);

  stock = signal<any[]>([]);
  stockMeta = signal({ total: 0, page: 1, limit: 10 });
  stockLoading = signal(false);

  stockTooltipVisible = signal(false);
  stockTooltipX = signal(0);
  stockTooltipY = signal(0);
  stockTooltipDetalle = signal<any[]>([]);

  kardex = signal<any[]>([]);
  kardexMeta = signal({ total: 0, page: 1, limit: 50 });
  kardexLoading = signal(false);

  mermas = signal<any[]>([]);
  mermasMeta = signal({ total: 0, page: 1, limit: 10 });
  mermasLoading = signal(false);

  sentidos = [
    { id: 'INGRESO', etiqueta: 'Aumentar' },
    { id: 'SALIDA', etiqueta: 'Disminuir' },
  ];
  tiposKardex = [
    { id: 'INGRESO', etiqueta: 'Ingreso' },
    { id: 'SALIDA', etiqueta: 'Salida' },
    { id: 'MERMA', etiqueta: 'Merma' },
    { id: 'AJUSTE', etiqueta: 'Ajuste' },
  ];
  filtrosMinimo = [
    { id: '1', etiqueta: 'Solo bajo mínimo' },
  ];

  titulosSeccion: Record<SeccionInventario, { titulo: string; subtitulo: string; icon: string }> = {
    stock: { titulo: 'Stock por sucursal', subtitulo: 'Existencias actuales de insumos.', icon: 'bi-boxes' },
    movimientos: { titulo: 'Movimientos de inventario', subtitulo: 'Ingresos, salidas y ajustes.', icon: 'bi-arrow-left-right' },
    kardex: { titulo: 'Kardex', subtitulo: 'Historial de movimientos por insumo.', icon: 'bi-journal-text' },
    mermas: { titulo: 'Mermas', subtitulo: 'Pérdidas registradas y resumen por motivo.', icon: 'bi-exclamation-triangle' },
  };

  stockFiltros: FormGroup = this.fb.group({
    id_sucursal: [null],
    id_insumo: [null],
    bajo_minimo: [null],
    agrupado: ['0'],
  });

  readonly vistasStock = [
    { id: '0', etiqueta: 'Por sucursal' },
    { id: '1', etiqueta: 'Agrupado (todas)' },
  ];

  movimientoForm: FormGroup = this.fb.group({
    id_insumo: [null, Validators.required],
    id_sucursal: [null, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    precio_costo: [0, [Validators.required, Validators.min(0)]],
    precio_venta: [0, [Validators.min(0)]],
    sentido: ['INGRESO'],
    motivo: [''],
    detalle: [''],
    lote: [''],
    fecha_vencimiento: [''],
  });

  ingresoLoteForm: FormGroup = this.fb.group({
    id_sucursal: [null, Validators.required],
    motivo: ['COMPRA'],
    detalle: [''],
    items: this.fb.array([] as FormGroup[]),
  });

  kardexFiltros: FormGroup = this.fb.group({
    id_sucursal: [null],
    id_insumo: [null],
    tipo: [null],
    fecha_desde: [InventarioComponent.fechaLocalHoy()],
    fecha_hasta: [InventarioComponent.fechaLocalHoy()],
  });

  mermaFiltros: FormGroup = this.fb.group({
    id_sucursal: [null],
    id_insumo: [null],
    motivo: [null],
    fecha_desde: [''],
    fecha_hasta: [''],
  });

  mermaForm: FormGroup = this.fb.group({
    id_insumo: [null, Validators.required],
    id_sucursal: [null, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    motivo: [null, Validators.required],
    id_lote: [null],
    detalle: [''],
  });

  minimoForm: FormGroup = this.fb.group({
    id_insumo: [null],
    id_sucursal: [null],
    stock_minimo: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const seccion = (data['seccion'] as SeccionInventario) || 'stock';
      this.tab.set(seccion);
      if (seccion === 'stock') this.cargarStock();
      if (seccion === 'kardex') this.cargarKardex();
      if (seccion === 'mermas') {
        this.cargarMermas();
        this.cargarResumenMermas();
      }
    });

    this.cargarListas();
    this.agregarItemIngresoLote();

    this.movimientoForm.get('id_insumo')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        const insumo = this.insumos().find((x) => Number(x.id_insumo) === Number(id));
        if (insumo && this.movimientoTipo() === 'ingreso') {
          this.movimientoForm.patchValue({
            precio_costo: Number(insumo.costo_unitario || 0),
            precio_venta: Number(insumo.precio_venta || 0),
          }, { emitEvent: false });
        }
      });

    this.mermaForm.get('id_insumo')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarLotes());
    this.mermaForm.get('id_sucursal')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarLotes());
  }

  onTab(id: string) {
    // Navegación por menú lateral; se mantiene por compatibilidad.
    const tab = id as SeccionInventario;
    this.tab.set(tab);
    if (tab === 'stock') this.cargarStock();
    if (tab === 'kardex') this.cargarKardex();
    if (tab === 'mermas') {
      this.cargarMermas();
      this.cargarResumenMermas();
    }
  }

  seccionTitulo() {
    return this.titulosSeccion[this.tab()] || this.titulosSeccion.stock;
  }

  setMovimientoTipo(tipo: MovimientoTipo) {
    this.movimientoTipo.set(tipo);
    if (tipo !== 'ingreso') this.ingresoModo.set('uno');
    const costoCtrl = this.movimientoForm.get('precio_costo');
    if (tipo === 'ingreso') {
      costoCtrl?.setValidators([Validators.required, Validators.min(0)]);
    } else if (tipo === 'ajuste') {
      costoCtrl?.setValidators([Validators.min(0)]);
    } else {
      costoCtrl?.clearValidators();
    }
    costoCtrl?.updateValueAndValidity();
    if (tipo !== 'ajuste') this.movimientoForm.patchValue({ sentido: 'INGRESO' });
  }

  filtrarStock() {
    this.stockMeta.update((m) => ({ ...m, page: 1 }));
    this.cargarStock();
  }

  esStockAgrupado(): boolean {
    return String(this.stockFiltros.get('agrupado')?.value) === '1';
  }

  onVistaStockChange() {
    if (this.esStockAgrupado()) {
      this.stockFiltros.patchValue({ id_sucursal: null });
      this.stockFiltros.get('id_sucursal')?.disable({ emitEvent: false });
    } else if (!this.sucursalBloqueada()) {
      this.stockFiltros.get('id_sucursal')?.enable({ emitEvent: false });
    }
    this.filtrarStock();
  }

  abrevSucursal(item: { nombre?: string; codigo?: string }): string {
    const stop = new Set(['DE', 'DEL', 'LA', 'EL', 'Y', 'LOS', 'LAS']);
    const words = String(item.nombre || '')
      .toUpperCase()
      .split(/\s+/)
      .filter((w) => w && !stop.has(w));
    if (words.length) return words.map((w) => w[0]).join('').slice(0, 4);
    const codigo = String(item.codigo || '').replace(/[^A-Za-z0-9]/g, '');
    return codigo.slice(0, 4).toUpperCase() || '—';
  }

  activarStockTooltip(event: MouseEvent, item: any) {
    this.stockTooltipDetalle.set(item.detalle_sucursales || []);
    this.stockTooltipVisible.set(true);
    this.moverStockTooltip(event);
  }

  moverStockTooltip(event: MouseEvent) {
    this.stockTooltipX.set(event.clientX + 12);
    this.stockTooltipY.set(event.clientY - 8);
  }

  ocultarStockTooltip() {
    this.stockTooltipVisible.set(false);
    this.stockTooltipDetalle.set([]);
  }

  filtrarKardex() {
    this.kardexMeta.update((m) => ({ ...m, page: 1 }));
    this.cargarKardex();
  }

  filtrarKardexHoy() {
    const hoy = InventarioComponent.fechaLocalHoy();
    this.kardexFiltros.patchValue({ fecha_desde: hoy, fecha_hasta: hoy });
    this.filtrarKardex();
  }

  esInicioGrupoKardex(index: number): boolean {
    if (index <= 0) return false;
    const rows = this.kardex();
    return this.claveMomentoKardex(rows[index]) !== this.claveMomentoKardex(rows[index - 1]);
  }

  private claveMomentoKardex(row: any): string {
    const d = new Date(row?.fecha_movimiento);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  claseTipoKardex(tipo: string): string {
    const map: Record<string, string> = {
      INGRESO: 'badge-success-erp',
      SALIDA: 'badge-danger-erp',
      MERMA: 'badge-warning-erp',
      AJUSTE: 'badge-primary-erp',
    };
    return map[String(tipo || '').toUpperCase()] || 'badge-neutral-erp';
  }

  etiquetaTipoKardex(tipo: string): string {
    const found = this.tiposKardex.find((t) => t.id === String(tipo || '').toUpperCase());
    return found?.etiqueta || tipo || '—';
  }

  private static fechaLocalHoy(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  filtrarMermas() {
    this.mermasMeta.update((m) => ({ ...m, page: 1 }));
    this.cargarMermas();
    this.cargarResumenMermas();
  }

  cambiarPaginaStock(page: number) {
    this.stockMeta.update((m) => ({ ...m, page }));
    this.cargarStock();
  }

  cambiarPaginaKardex(page: number) {
    this.kardexMeta.update((m) => ({ ...m, page }));
    this.cargarKardex();
  }

  cambiarPaginaMermas(page: number) {
    this.mermasMeta.update((m) => ({ ...m, page }));
    this.cargarMermas();
  }

  setIngresoModo(modo: IngresoModo) {
    this.ingresoModo.set(modo);
    if (modo === 'lote') {
      const idSuc = this.movimientoForm.getRawValue().id_sucursal ?? this.ingresoLoteForm.getRawValue().id_sucursal;
      if (idSuc) {
        this.ingresoLoteForm.patchValue({ id_sucursal: idSuc }, { emitEvent: false });
      }
    }
  }

  get ingresoLoteItems(): FormArray {
    return this.ingresoLoteForm.get('items') as FormArray;
  }

  agregarItemIngresoLote() {
    this.ingresoLoteItems.push(
      this.fb.group({
        id_insumo: [null, Validators.required],
        cantidad: [1, [Validators.required, Validators.min(1)]],
        precio_costo: [0, [Validators.required, Validators.min(0)]],
        precio_venta: [0, [Validators.min(0)]],
      }),
    );
  }

  quitarItemIngresoLote(i: number) {
    if (this.ingresoLoteItems.length <= 1) return;
    this.ingresoLoteItems.removeAt(i);
  }

  onInsumoLoteChange(i: number) {
    const grp = this.ingresoLoteItems.at(i);
    const id = grp.get('id_insumo')?.value;
    const insumo = this.insumos().find((x) => Number(x.id_insumo) === Number(id));
    if (insumo) {
      grp.patchValue({
        precio_costo: Number(insumo.costo_unitario || 0),
        precio_venta: Number(insumo.precio_venta || 0),
      });
    }
  }

  registrarIngresoLote() {
    if (this.ingresoLoteForm.invalid) {
      this.ingresoLoteForm.markAllAsTouched();
      this.alert.error('Complete sucursal, insumos, cantidades y costos antes de registrar.');
      return;
    }
    const raw = this.ingresoLoteForm.getRawValue();
    const idSucursal = Number(raw.id_sucursal);
    if (!idSucursal) {
      this.alert.error('Seleccione la sucursal del ingreso.');
      return;
    }
    const items = (raw.items || []).map((it: any) => ({
      id_insumo: Number(it.id_insumo),
      cantidad: Number(it.cantidad),
      costo_unitario: Number(it.precio_costo ?? 0),
      precio_venta: it.precio_venta != null && it.precio_venta !== '' ? Number(it.precio_venta) : undefined,
    }));
    if (!items.length || items.some((it: any) => !it.id_insumo || !(it.cantidad > 0))) {
      this.alert.error('Cada fila debe tener insumo y cantidad mayor a cero.');
      return;
    }
    const payload = {
      id_sucursal: idSucursal,
      motivo: raw.motivo?.trim() || 'COMPRA',
      detalle: raw.detalle?.trim() || undefined,
      items,
    };
    this.alert.showLoading('Registrando ingreso múltiple...');
    this.service.ingresoLote(payload).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const n = res?.registrados ?? res?.data?.registrados ?? payload.items.length;
        this.alert.success(`Ingreso registrado: ${n} ítem(s).`);
        this.ingresoLoteForm.patchValue({ motivo: 'COMPRA', detalle: '' });
        this.ingresoLoteItems.clear();
        this.agregarItemIngresoLote();
        this.cargarStock();
        this.cargarKardex();
      },
      error: (e: any) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo registrar el ingreso múltiple.'));
      },
    });
  }

  registrarMovimiento() {
    if (this.movimientoForm.invalid) {
      this.movimientoForm.markAllAsTouched();
      return;
    }
    const tipo = this.movimientoTipo();
    const raw = this.movimientoForm.getRawValue();
    const payload: any = {
      id_insumo: Number(raw.id_insumo),
      id_sucursal: Number(raw.id_sucursal),
      cantidad: Number(raw.cantidad),
      motivo: raw.motivo || null,
      detalle: raw.detalle || null,
    };
    if (tipo === 'ingreso') {
      payload.costo_unitario = Number(raw.precio_costo);
      payload.precio_venta = raw.precio_venta != null && raw.precio_venta !== '' ? Number(raw.precio_venta) : undefined;
      payload.lote = raw.lote || null;
      payload.fecha_vencimiento = raw.fecha_vencimiento || null;
    }
    if (tipo === 'ajuste') {
      payload.sentido = raw.sentido;
      if (raw.precio_costo != null && raw.precio_costo !== '') payload.costo_unitario = Number(raw.precio_costo);
    }

    this.alert.showLoading('Registrando movimiento...');
    this.service.registrarMovimiento(tipo, payload).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Movimiento registrado.');
        this.movimientoForm.patchValue({ cantidad: 1, motivo: '', detalle: '', lote: '', fecha_vencimiento: '' });
        this.cargarStock();
        this.cargarKardex();
      },
      error: (e: any) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo registrar el movimiento.'));
      },
    });
  }

  registrarMerma() {
    if (this.mermaForm.invalid) {
      this.mermaForm.markAllAsTouched();
      return;
    }
    const raw = this.mermaForm.getRawValue();
    this.alert.showLoading('Registrando merma...');
    this.service.crearMerma({
      id_insumo: Number(raw.id_insumo),
      id_sucursal: Number(raw.id_sucursal),
      cantidad: Number(raw.cantidad),
      motivo: raw.motivo,
      id_lote: raw.id_lote || null,
      detalle: raw.detalle || null,
    }).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Merma registrada.');
        this.mermaForm.patchValue({ cantidad: 1, motivo: null, id_lote: null, detalle: '' });
        this.cargarStock();
        this.cargarMermas();
        this.cargarResumenMermas();
        this.cargarKardex();
      },
      error: (e: any) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo registrar la merma.'));
      },
    });
  }

  abrirMinimo(modal: TemplateRef<any>, item: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.minimoForm.reset({
      id_insumo: item.id_insumo,
      id_sucursal: item.id_sucursal,
      stock_minimo: Number(item.stock_minimo || 0),
    });
    this.modal.open(modal, { centered: true, backdrop: 'static' });
  }

  guardarMinimo(modalRef: any) {
    if (this.minimoForm.invalid) {
      this.minimoForm.markAllAsTouched();
      return;
    }
    const raw = this.minimoForm.getRawValue();
    this.alert.showLoading('Actualizando mínimo...');
    this.service.actualizarMinimo({
      id_insumo: Number(raw.id_insumo),
      id_sucursal: Number(raw.id_sucursal),
      stock_minimo: Number(raw.stock_minimo),
    }).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Stock mínimo actualizado.');
        modalRef.close();
        this.cargarStock();
      },
      error: (e: any) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo actualizar el mínimo.'));
      },
    });
  }

  etiquetaMotivo(codigo: string) {
    return this.motivos().find((m) => m.codigo === codigo)?.etiqueta || codigo;
  }

  private cargarListas() {
    forkJoin({
      sucursales: this.service.sucursales(),
      insumos: this.service.insumos(),
      motivos: this.service.motivosMerma(),
    }).subscribe({
      next: (res) => {
        const sucursales = this.unwrapArray(res.sucursales);
        this.sucursales.set(sucursales);
        this.insumos.set(this.unwrapArray(res.insumos));
        this.motivos.set(this.unwrapArray(res.motivos));
        if (sucursales.length === 1) {
          this.sucursalBloqueada.set(true);
          const id = sucursales[0].id_sucursal;
          this.stockFiltros.patchValue({ id_sucursal: id });
          this.movimientoForm.patchValue({ id_sucursal: id });
          this.ingresoLoteForm.patchValue({ id_sucursal: id });
          this.kardexFiltros.patchValue({ id_sucursal: id });
          this.mermaFiltros.patchValue({ id_sucursal: id });
          this.mermaForm.patchValue({ id_sucursal: id });
          this.stockFiltros.get('id_sucursal')?.disable({ emitEvent: false });
          this.movimientoForm.get('id_sucursal')?.disable({ emitEvent: false });
          this.ingresoLoteForm.get('id_sucursal')?.disable({ emitEvent: false });
          this.kardexFiltros.get('id_sucursal')?.disable({ emitEvent: false });
          this.mermaFiltros.get('id_sucursal')?.disable({ emitEvent: false });
          this.mermaForm.get('id_sucursal')?.disable({ emitEvent: false });
        }
      },
      error: () => this.alert.error('No se pudieron cargar sucursales o insumos.'),
    });
  }

  private cargarStock() {
    this.stockLoading.set(true);
    const { page, limit } = this.stockMeta();
    this.service.stock(page, limit, this.stockFiltros.getRawValue())
      .pipe(finalize(() => this.stockLoading.set(false)))
      .subscribe({
        next: (res: any) => {
          const payload = this.unwrapPayload(res, this.stockMeta());
          this.stock.set(payload.data);
          this.stockMeta.set(payload.meta);
        },
        error: (e: any) => this.alert.error(this.msgError(e, 'No se pudo cargar el stock.')),
      });
  }

  private cargarKardex() {
    this.kardexLoading.set(true);
    const { page, limit } = this.kardexMeta();
    this.service.kardex(page, limit, this.kardexFiltros.getRawValue())
      .pipe(finalize(() => this.kardexLoading.set(false)))
      .subscribe({
        next: (res: any) => {
          const payload = this.unwrapPayload(res, this.kardexMeta());
          this.kardex.set(payload.data);
          this.kardexMeta.set(payload.meta);
        },
        error: (e: any) => this.alert.error(this.msgError(e, 'No se pudo cargar el kardex.')),
      });
  }

  private cargarMermas() {
    this.mermasLoading.set(true);
    const { page, limit } = this.mermasMeta();
    this.service.mermas(page, limit, this.mermaFiltros.getRawValue())
      .pipe(finalize(() => this.mermasLoading.set(false)))
      .subscribe({
        next: (res: any) => {
          const payload = this.unwrapPayload(res, this.mermasMeta());
          this.mermas.set(payload.data);
          this.mermasMeta.set(payload.meta);
        },
        error: (e: any) => this.alert.error(this.msgError(e, 'No se pudieron cargar las mermas.')),
      });
  }

  private cargarResumenMermas() {
    this.service.mermasResumen(this.mermaFiltros.getRawValue()).subscribe({
      next: (res: any) => this.resumenMermas.set(this.unwrapArray(res)),
    });
  }

  private cargarLotes() {
    const idInsumo = Number(this.mermaForm.get('id_insumo')?.value);
    const idSucursal = Number(this.mermaForm.get('id_sucursal')?.value);
    if (!idInsumo || !idSucursal) {
      this.lotes.set([]);
      return;
    }
    this.service.lotes(idInsumo, idSucursal).subscribe({
      next: (res: any) => this.lotes.set(this.unwrapArray(res)),
      error: () => this.lotes.set([]),
    });
  }

  private unwrapPayload(res: any, currentMeta: any) {
    const data = this.unwrapArray(res);
    const meta = res?.data?.meta || res?.meta || { total: data.length, page: currentMeta.page, limit: currentMeta.limit };
    return {
      data,
      meta: {
        total: Number(meta.total || data.length || 0),
        page: Number(meta.page || currentMeta.page),
        limit: Number(meta.limit || currentMeta.limit),
      },
    };
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private msgError(e: any, fallback: string) {
    return e?.error?.mensaje || e?.error?.message || fallback;
  }
}
