import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgbDropdownModule, NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { CajaHttpService } from '../caja/caja.service';
import { ComprobantesHttpService } from './comprobantes.service';
import { ReportesHttpService } from '../reportes/reportes.service';
import { ClientesService } from '../clientes/clientes.service';

type TabComp = 'listado' | 'emitir' | 'series';

@Component({
  selector: 'app-comprobantes',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    NgbModalModule,
    NgbDropdownModule,
    NgSelectModule,
    TableProComponent,
    FormErrorComponent,
    ErpTabsComponent,
  ],
  templateUrl: './comprobantes.component.html',
  styleUrls: ['./comprobantes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComprobantesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ComprobantesHttpService);
  private caja = inject(CajaHttpService);
  private reportes = inject(ReportesHttpService);
  private clientesApi = inject(ClientesService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private route = inject(ActivatedRoute);
  public perms = inject(PermissionsService);

  tab = signal<TabComp>('listado');
  sucursales = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  catalogos = signal<any>({ tipos: [], docs: [], ose_modo: 'MOCK', emisor: null, igv: 18 });
  series = signal<any[]>([]);
  seriesEmitir = signal<any[]>([]);
  seriesNc = signal<any[]>([]);

  rows = signal<any[]>([]);
  meta = signal({ total: 0, page: 1, limit: 10 });
  loading = signal(false);
  search = signal('');

  preview = signal<any | null>(null);
  idsSel = signal<number[]>([]);
  emitiendo = signal(false);
  consultando = signal(false);

  detalle = signal<any | null>(null);
  anularTarget = signal<any | null>(null);

  tiposEmitir = [
    { codigo: '01', etiqueta: 'Factura' },
    { codigo: '03', etiqueta: 'Boleta' },
  ];
  tiposFiltro = [
    { codigo: '01', etiqueta: 'Factura' },
    { codigo: '03', etiqueta: 'Boleta' },
    { codigo: '07', etiqueta: 'Nota de crédito' },
  ];
  estados = [
    { codigo: 'ACEPTADO', etiqueta: 'Aceptado' },
    { codigo: 'RECHAZADO', etiqueta: 'Rechazado' },
    { codigo: 'REGISTRADO', etiqueta: 'Registrado' },
    { codigo: 'ENVIADO', etiqueta: 'Enviado' },
    { codigo: 'ANULADO', etiqueta: 'Anulado' },
  ];

  tabs = computed<ErpTab[]>(() => {
    this.perms.permissionsSignal();
    return [
      { id: 'listado', label: 'Documentos', icon: 'bi-receipt' },
      { id: 'emitir', label: 'Emitir', icon: 'bi-plus-circle', visible: this.perms.hasPermission('emitir_comprobante') },
      { id: 'series', label: 'Series', icon: 'bi-hash', visible: this.perms.hasPermission('gestionar_serie') },
    ];
  });

  filtros = this.fb.group({
    id_sucursal: [null as number | null],
    tipo: [null as string | null],
    estado: [null as string | null],
    id_cuenta: [null as number | null],
  });

  emitirForm = this.fb.group({
    id_cuenta: [null as number | null, Validators.required],
    tipo: ['03' as string, Validators.required],
    id_serie: [null as number | null, Validators.required],
    tipo_doc_cliente: ['0'],
    num_doc_cliente: [''],
    razon_social_cliente: ['CLIENTES VARIOS', Validators.required],
    direccion_cliente: [''],
  });

  serieForm = this.fb.group({
    id_sucursal: [null as number | null, Validators.required],
    tipo: ['03', Validators.required],
    serie: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{4}$/)]],
  });

  ncForm = this.fb.group({
    id_serie: [null as number | null, Validators.required],
    motivo: ['ANULACION', [Validators.required, Validators.maxLength(200)]],
  });

  totalEmitir = computed(() => {
    const items = this.preview()?.items || [];
    const ids = this.idsSel();
    const sel = items.filter((i: any) => ids.includes(Number(i.id_cuenta_item)));
    return this.round2(sel.reduce((s: number, i: any) => s + Number(i.total || 0), 0));
  });

  emisorVisible = computed(() => {
    this.sucursales();
    const id = Number(this.preview()?.cuenta?.id_sucursal || 0);
    const s = this.sucursales().find((x: any) => Number(x.id_sucursal) === id);
    if (s?.ruc) {
      return {
        nombreComercial: s.nombre_comercial || s.nombre,
        ruc: s.ruc,
        razonSocial: s.razon_social || '',
      };
    }
    return this.catalogos().emisor;
  });

  constructor() {
    this.emitirForm.get('tipo')?.valueChanges.pipe(takeUntilDestroyed()).subscribe((tipo) => {
      if (tipo === '01') {
        this.emitirForm.patchValue({
          tipo_doc_cliente: '6',
          razon_social_cliente: this.emitirForm.getRawValue().razon_social_cliente === 'CLIENTES VARIOS'
            ? ''
            : this.emitirForm.getRawValue().razon_social_cliente,
        });
      } else if (tipo === '03' && !this.emitirForm.getRawValue().razon_social_cliente) {
        this.emitirForm.patchValue({ tipo_doc_cliente: '0', razon_social_cliente: 'CLIENTES VARIOS' });
      }
      this.cargarSeriesEmitir();
    });
  }

  ngOnInit() {
    this.service.catalogos().subscribe({
      next: (res) => this.catalogos.set(this.unwrapObject(res) || { tipos: [], docs: [], ose_modo: 'MOCK' }),
      error: () => this.alert.error('No se pudieron cargar catálogos.'),
    });
    this.service.sucursales().subscribe({
      next: (res) => {
        const sucursales = this.unwrapArray(res);
        this.sucursales.set(sucursales);
        if (sucursales.length === 1) {
          this.sucursalBloqueada.set(true);
          this.filtros.patchValue({ id_sucursal: sucursales[0].id_sucursal });
          this.serieForm.patchValue({ id_sucursal: sucursales[0].id_sucursal });
          this.filtros.get('id_sucursal')?.disable({ emitEvent: false });
          this.serieForm.get('id_sucursal')?.disable({ emitEvent: false });
        }
        this.cargarListado(1);
        this.cargarSeries();
        this.leerQuery();
      },
      error: () => this.alert.error('No se pudieron cargar sucursales.'),
    });
  }

  onTab(id: string) {
    this.tab.set(id as TabComp);
    if (id === 'listado') this.cargarListado(this.meta().page);
    if (id === 'series') this.cargarSeries();
  }

  filtrar() {
    this.cargarListado(1);
  }

  onSearch(term: string) {
    this.search.set(term);
    this.cargarListado(1);
  }

  cargarListado(page: number) {
    const raw = this.filtros.getRawValue();
    this.loading.set(true);
    this.service
      .listar(page, 10, {
        id_sucursal: raw.id_sucursal,
        tipo: raw.tipo,
        estado: raw.estado,
        id_cuenta: raw.id_cuenta,
        search: this.search(),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          const block = res?.data?.data ? res.data : res;
          this.rows.set(block?.data || []);
          this.meta.set(block?.meta || { total: 0, page, limit: 10 });
        },
        error: (e) => this.alert.error(this.msgError(e, 'No se pudo listar.')),
      });
  }

  cargarSeries() {
    const id = this.filtros.getRawValue().id_sucursal;
    this.service.series({ id_sucursal: id }).subscribe({
      next: (res) => this.series.set(this.unwrapArray(res)),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudieron cargar series.')),
    });
  }

  cargarSeriesEmitir() {
    const preview = this.preview();
    const tipo = this.emitirForm.getRawValue().tipo;
    if (!preview?.cuenta?.id_sucursal || !tipo) {
      this.seriesEmitir.set([]);
      return;
    }
    this.service.series({ id_sucursal: preview.cuenta.id_sucursal, tipo }).subscribe({
      next: (res) => {
        const list = this.unwrapArray(res);
        this.seriesEmitir.set(list);
        const actual = this.emitirForm.getRawValue().id_serie;
        if (!list.some((s: any) => Number(s.id_serie) === Number(actual))) {
          this.emitirForm.patchValue({ id_serie: list[0]?.id_serie || null });
        }
      },
      error: () => this.seriesEmitir.set([]),
    });
  }

  cargarPreview(idCuenta: number, irAEmitir = true) {
    if (!idCuenta) return;
    this.alert.showLoading('Leyendo cuenta...');
    this.service.previewCuenta(idCuenta).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const prev = this.unwrapObject(res);
        this.preview.set(prev);
        this.idsSel.set((prev?.items || []).map((i: any) => Number(i.id_cuenta_item)));
        this.emitirForm.patchValue({ id_cuenta: Number(prev?.cuenta?.id_cuenta) || idCuenta });
        this.filtros.patchValue({ id_cuenta: Number(prev?.cuenta?.id_cuenta) || idCuenta });
        this.cargarSeriesEmitir();
        if (irAEmitir && this.perms.hasPermission('emitir_comprobante')) this.tab.set('emitir');
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo leer la cuenta.'));
      },
    });
  }

  cargarPorPedido(idPedido: number) {
    this.caja.cuenta(idPedido).subscribe({
      next: (res) => {
        const det = this.unwrapObject(res);
        const idCuenta = Number(det?.cuenta?.id_cuenta);
        if (!idCuenta) {
          this.alert.warning('Ese pedido no tiene cuenta.');
          return;
        }
        this.cargarPreview(idCuenta);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo abrir el pedido.')),
    });
  }

  toggleItem(id: number) {
    this.idsSel.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  consultarSunat() {
    const tipoUi = String(this.emitirForm.getRawValue().tipo_doc_cliente || '');
    const tipo = tipoUi === '6' ? 'RUC' : tipoUi === '1' ? 'DNI' : '';
    const numero = String(this.emitirForm.getRawValue().num_doc_cliente || '').replace(/\D/g, '');
    if (!tipo) {
      this.alert.toast('Elija DNI o RUC para consultar SUNAT.', 'warning');
      return;
    }
    this.consultando.set(true);
    this.clientesApi.identity(tipo, numero).pipe(finalize(() => this.consultando.set(false))).subscribe({
      next: (res) => {
        const data = res?.data || res;
        this.emitirForm.patchValue({
          razon_social_cliente: data.razon_social || data.nombre_comercial || '',
          direccion_cliente: data.direccion || this.emitirForm.getRawValue().direccion_cliente,
        });
        this.alert.success('Datos de SUNAT cargados.');
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo consultar SUNAT.')),
    });
  }

  emitir() {
    if (this.emitirForm.invalid) {
      this.emitirForm.markAllAsTouched();
      return;
    }
    const prev = this.preview();
    if (!prev?.items?.length) {
      this.alert.warning('No hay ítems pendientes de facturar.');
      return;
    }
    const total = this.totalEmitir();
    if (!(total > 0)) {
      this.alert.warning('Seleccione al menos un ítem cobrado.');
      return;
    }
    const raw = this.emitirForm.getRawValue();
    const payload: any = {
      id_cuenta: raw.id_cuenta,
      tipo: raw.tipo,
      id_serie: raw.id_serie,
      tipo_doc_cliente: raw.tipo_doc_cliente,
      num_doc_cliente: raw.num_doc_cliente || undefined,
      razon_social_cliente: raw.razon_social_cliente,
      direccion_cliente: raw.direccion_cliente || undefined,
      total_esperado: total,
    };
    if (this.idsSel().length) payload.ids_cuenta_item = this.idsSel();
    this.emitiendo.set(true);
    this.alert.showLoading('Enviando al OSE...');
    this.service.emitir(payload).pipe(finalize(() => this.emitiendo.set(false))).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const c = this.unwrapObject(res);
        this.alert.success(`${this.etiquetaTipo(c?.tipo)} ${c?.serie}-${String(c?.correlativo).padStart(8, '0')} · ${c?.estado}`);
        if (this.perms.hasPermission('imprimir_ticket') && c?.id_comprobante) {
          this.reportes.encolar({ tipo: 'COMPROBANTE', id_referencia: Number(c.id_comprobante) }).subscribe();
        }
        this.cargarPreview(Number(raw.id_cuenta), false);
        this.cargarListado(1);
        this.tab.set('listado');
        if (c?.id_comprobante) this.abrirPdf(c.id_comprobante);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo emitir.'));
      },
    });
  }

  crearSerie() {
    if (this.serieForm.invalid) {
      this.serieForm.markAllAsTouched();
      return;
    }
    const raw = this.serieForm.getRawValue();
    this.service.crearSerie({
      id_sucursal: raw.id_sucursal,
      tipo: raw.tipo,
      serie: String(raw.serie).toUpperCase(),
    }).subscribe({
      next: () => {
        this.alert.success('Serie creada.');
        this.serieForm.patchValue({ serie: '' });
        this.cargarSeries();
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo crear la serie.')),
    });
  }

  abrirDetalle(row: any, tpl: TemplateRef<any>) {
    this.service.detalle(row.id_comprobante).subscribe({
      next: (res) => {
        this.detalle.set(this.unwrapObject(res));
        this.modal.open(tpl, { size: 'lg', centered: true });
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo abrir el documento.')),
    });
  }

  abrirPdf(id: number, evento?: Event) {
    evento?.preventDefault();
    this.abrirBlob(this.service.pdf(id), 'No se pudo generar el PDF A4.');
  }

  abrirTicket(id: number, evento?: Event) {
    evento?.preventDefault();
    this.abrirBlob(this.service.ticket(id), 'No se pudo generar el ticket.');
  }

  private abrirBlob(obs: ReturnType<ComprobantesHttpService['pdf']>, errorMsg: string) {
    obs.subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.alert.error(errorMsg),
    });
  }

  descargarXml(id: number, tipo: 'xml' | 'cdr') {
    this.service.xml(id, tipo).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprobante-${id}-${tipo}.xml`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.alert.error('XML no disponible.'),
    });
  }

  reenviar(row: any) {
    this.alert.showLoading('Reenviando...');
    this.service.reenviar(row.id_comprobante).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const c = this.unwrapObject(res);
        this.alert.success(`Reenvío: ${c?.estado}`);
        this.cargarListado(this.meta().page);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo reenviar.'));
      },
    });
  }

  reenviarLote() {
    this.alert.showLoading('Reenviando lote OSE...');
    this.service.reenviarLote(this.filtros.getRawValue().id_sucursal).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const pack = this.unwrapObject(res);
        this.alert.success(`Reintento: ${pack?.total || 0} documento(s)`);
        this.cargarListado(1);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo reenviar el lote.'));
      },
    });
  }

  encolarTicket(row: any) {
    this.reportes.encolar({ tipo: 'COMPROBANTE', id_referencia: Number(row.id_comprobante) }).subscribe({
      next: () => this.alert.success('Ticket encolado en Reportes → Cola tickets.'),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo encolar el ticket.')),
    });
  }

  abrirAnular(row: any, tpl: TemplateRef<any>) {
    this.anularTarget.set(row);
    this.ncForm.reset({ id_serie: null, motivo: 'ANULACION' });
    if (row.estado === 'ACEPTADO') {
      this.service.series({ id_sucursal: row.id_sucursal, tipo: '07' }).subscribe({
        next: (res) => {
          const all = this.unwrapArray(res);
          const pref = String(row.tipo) === '01' ? 'F' : 'B';
          this.seriesNc.set(all.filter((s: any) => String(s.serie).toUpperCase().startsWith(pref)));
        },
        error: () => this.seriesNc.set([]),
      });
    } else {
      this.seriesNc.set([]);
    }
    this.modal.open(tpl, { centered: true });
  }

  confirmarAnular() {
    const row = this.anularTarget();
    if (!row) return;
    const raw = this.ncForm.getRawValue();
    if (row.estado === 'ACEPTADO' && this.ncForm.invalid) {
      this.ncForm.markAllAsTouched();
      return;
    }
    const payload: any = { motivo: raw.motivo || 'ANULACION' };
    if (row.estado === 'ACEPTADO') payload.id_serie = raw.id_serie;
    this.alert.showLoading('Anulando...');
    this.service.anular(row.id_comprobante, payload).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        this.modal.dismissAll();
        const c = this.unwrapObject(res);
        this.alert.success(c?.tipo === '07' ? `NC ${c.serie}-${c.correlativo} · ${c.estado}` : 'Anulado.');
        this.cargarListado(this.meta().page);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo anular.'));
      },
    });
  }

  cerrarModal() {
    this.modal.dismissAll();
  }

  etiquetaTipo(codigo: string) {
    return this.tiposFiltro.find((t) => t.codigo === codigo)?.etiqueta || codigo;
  }

  nro(row: any) {
    return `${row.serie}-${String(row.correlativo).padStart(8, '0')}`;
  }

  badgeEstado(estado: string) {
    if (estado === 'ACEPTADO') return 'badge-erp badge-success-erp';
    if (estado === 'RECHAZADO') return 'badge-erp badge-danger-erp';
    if (estado === 'ANULADO') return 'badge-erp badge-secondary-erp';
    return 'badge-erp badge-outline-erp';
  }

  sunatIcon(estado: string): string {
    switch (String(estado || '').toUpperCase()) {
      case 'ACEPTADO':
        return 'bi-check-circle-fill text-success';
      case 'OBSERVADO':
        return 'bi-exclamation-triangle-fill text-warning';
      case 'RECHAZADO':
      case 'ERROR':
      case 'ANULADO':
        return 'bi-x-circle-fill text-danger';
      case 'PENDIENTE':
      case 'ENVIADO':
      case 'REGISTRADO':
        return 'bi-arrow-repeat text-primary';
      default:
        return 'bi-question-circle text-secondary';
    }
  }

  tieneXml(row: any): boolean {
    return Number(row?.tiene_xml) === 1 || row?.tiene_xml === true;
  }

  tieneCdr(row: any): boolean {
    return Number(row?.tiene_cdr) === 1 || row?.tiene_cdr === true;
  }

  puedeReenviar(item: any): boolean {
    const e = String(item?.estado || '').toUpperCase();
    return e === 'RECHAZADO' || e === 'REGISTRADO';
  }

  private leerQuery() {
    const q = this.route.snapshot.queryParamMap;
    const cuenta = Number(q.get('cuenta') || 0);
    const pedido = Number(q.get('pedido') || 0);
    if (cuenta) {
      this.cargarPreview(cuenta);
      return;
    }
    if (pedido) this.cargarPorPedido(pedido);
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private unwrapObject(res: any): any {
    if (!res) return null;
    if (typeof res.success === 'boolean') return res.data ?? null;
    return res;
  }

  private msgError(e: any, fallback: string) {
    const m = e?.error?.mensaje || e?.error?.message;
    return Array.isArray(m) ? m[0] : (m || fallback);
  }

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }
}
