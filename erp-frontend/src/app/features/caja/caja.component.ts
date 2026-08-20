import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { CajaHttpService } from './caja.service';
import { ReportesHttpService } from '../reportes/reportes.service';
import { PosHttpService } from '../pos/pos.service';
import { ComprobantesHttpService } from '../comprobantes/comprobantes.service';

type TabCaja = 'turno' | 'cobrar' | 'historial';

@Component({
  selector: 'app-caja',
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
    ErpTabsComponent,
  ],
  templateUrl: './caja.component.html',
  styleUrls: ['./caja.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(CajaHttpService);
  private reportes = inject(ReportesHttpService);
  private pos = inject(PosHttpService);
  private comps = inject(ComprobantesHttpService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private router = inject(Router);
  public perms = inject(PermissionsService);

  tab = signal<TabCaja>('turno');
  sucursales = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  idSucursal = signal<number | null>(null);
  turno = signal<any | null>(null);
  pendientes = signal<any[]>([]);
  detalle = signal<any | null>(null);
  idsSel = signal<number[]>([]);
  loading = signal(false);

  historial = signal<any[]>([]);
  historialMeta = signal({ total: 0, page: 1, limit: 10 });
  historialLoading = signal(false);

  mediosCat = [
    { codigo: 'EFECTIVO', etiqueta: 'Efectivo' },
    { codigo: 'TARJETA', etiqueta: 'Tarjeta' },
    { codigo: 'YAPE', etiqueta: 'Yape' },
    { codigo: 'PLIN', etiqueta: 'Plin' },
  ];
  modos = [
    { codigo: 'COMPLETA', etiqueta: 'Cuenta completa / saldo' },
    { codigo: 'ITEMS', etiqueta: 'Por ítems' },
    { codigo: 'PARTES', etiqueta: 'Partes iguales' },
  ];
  partesOpts = [2, 3, 4, 5, 6, 8].map((n) => ({ id: n, etiqueta: `${n} partes` }));
  tiposVenta = [
    { id: 'NINGUNO', nombre: 'Solo cobro (emitir después)' },
    { id: 'NOTA_VENTA', nombre: 'Nota de venta' },
    { id: 'BOLETA_SIMPLE', nombre: 'Boleta simple' },
    { id: 'BOLETA', nombre: 'Boleta electrónica' },
    { id: 'FACTURA', nombre: 'Factura electrónica' },
  ];
  tiposDoc = [
    { codigo: '0', etiqueta: 'Sin documento' },
    { codigo: '1', etiqueta: 'DNI' },
    { codigo: '6', etiqueta: 'RUC' },
  ];
  consultando = signal(false);

  tabs: ErpTab[] = [
    { id: 'turno', label: 'Turno', icon: 'bi-clock-history' },
    { id: 'cobrar', label: 'Cobrar', icon: 'bi-cash-stack' },
    { id: 'historial', label: 'Historial', icon: 'bi-journal-text' },
  ];

  sucursalForm = this.fb.group({
    id_sucursal: [null as number | null, Validators.required],
  });
  abrirForm = this.fb.group({
    monto_apertura: [0, [Validators.required, Validators.min(0)]],
    notas: [''],
  });
  cerrarForm = this.fb.group({
    monto_cierre_contado: [0, [Validators.required, Validators.min(0)]],
    notas: [''],
  });
  cobroForm = this.fb.group({
    modo: ['COMPLETA' as string, Validators.required],
    n_partes: [2],
    n_parte: [null as number | null],
  });

  mediosForm = this.fb.group({
    medio: ['EFECTIVO'],
    monto: [0, [Validators.required, Validators.min(0.01)]],
    recibido: [null as number | null],
    referencia: [''],
  });
  docForm = this.fb.group({
    tipo_comprobante: ['NINGUNO'],
    tipo_doc_cliente: ['0'],
    num_doc_cliente: [''],
    razon_social_cliente: ['CLIENTES VARIOS'],
    direccion_cliente: [''],
  });
  mediosDraft = signal<{ medio: string; monto: number; recibido: number | null; referencia: string }[]>([]);

  saldo = computed(() => Number(this.detalle()?.cuenta?.saldo || 0));
  sumaMedios = computed(() => this.round2(this.mediosDraft().reduce((s, m) => s + Number(m.monto), 0)));
  montoACobrar = computed(() => {
    const det = this.detalle();
    if (!det) return 0;
    const modo = this.cobroForm.getRawValue().modo;
    if (modo === 'ITEMS') {
      return this.round2(
        det.items
          .filter((i: any) => this.idsSel().includes(Number(i.id_pedido_item)) && i.estado === 'PENDIENTE')
          .reduce((s: number, i: any) => s + Number(i.monto), 0),
      );
    }
    if (modo === 'PARTES') {
      const nParte = Number(this.cobroForm.getRawValue().n_parte);
      const parte = (det.partes || []).find((p: any) => Number(p.n_parte) === nParte && p.estado === 'PENDIENTE');
      if (parte) return this.round2(Number(parte.monto));
      const n = Number(this.cobroForm.getRawValue().n_partes || 2);
      const saldo = this.saldo();
      const base = this.round2(Math.floor((saldo * 100) / n) / 100);
      return base;
    }
    return this.saldo();
  });

  ngOnInit() {
    this.service.sucursales().subscribe({
      next: (res) => {
        const sucursales = this.unwrapArray(res);
        this.sucursales.set(sucursales);
        if (sucursales.length === 1) {
          this.sucursalBloqueada.set(true);
          this.sucursalForm.patchValue({ id_sucursal: sucursales[0].id_sucursal });
          this.sucursalForm.get('id_sucursal')?.disable({ emitEvent: false });
        }
        this.onSucursal();
      },
      error: () => this.alert.error('No se pudieron cargar sucursales.'),
    });
  }

  onTab(id: string) {
    this.tab.set(id as TabCaja);
    if (id === 'historial') this.cargarHistorial(1);
    if (id === 'cobrar') this.cargarPendientes();
  }

  onSucursal() {
    const id = Number(this.sucursalForm.getRawValue().id_sucursal) || null;
    this.idSucursal.set(id);
    this.detalle.set(null);
    if (!id && this.sucursales().length > 1) {
      this.turno.set(null);
      this.pendientes.set([]);
      return;
    }
    this.cargarTurno();
    this.cargarPendientes();
  }

  cargarTurno() {
    const id = this.idSucursal();
    this.service.turnoActual(id || undefined).subscribe({
      next: (res) => this.turno.set(this.unwrapObject(res)),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo leer el turno.')),
    });
  }

  abrirTurno() {
    const id = this.idSucursal();
    if (!id) {
      this.alert.warning('Seleccione sucursal.');
      return;
    }
    if (this.abrirForm.invalid) return;
    const raw = this.abrirForm.getRawValue();
    this.alert.showLoading('Abriendo turno...');
    this.service.abrir({ id_sucursal: id, monto_apertura: raw.monto_apertura, notas: raw.notas }).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        this.turno.set(this.unwrapObject(res));
        this.alert.success('Turno abierto.');
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo abrir el turno.'));
      },
    });
  }

  cerrarTurno() {
    const t = this.turno();
    if (!t) return;
    if (this.cerrarForm.invalid) return;
    const raw = this.cerrarForm.getRawValue();
    this.alert.confirmAction('¿Cerrar turno?', 'No se podrán registrar cobros hasta abrir otro.', 'Sí, cerrar')
      .then((ok) => {
        if (!ok) return;
        this.alert.showLoading('Cerrando...');
        this.service.cerrar(t.id_turno, raw).subscribe({
          next: () => {
            this.alert.closeLoading();
            this.alert.success('Turno cerrado.');
            this.turno.set(null);
            this.cargarTurno();
          },
          error: (e) => {
            this.alert.closeLoading();
            this.alert.error(this.msgError(e, 'No se pudo cerrar el turno.'));
          },
        });
      });
  }

  cargarPendientes() {
    const id = this.idSucursal();
    if (!id) {
      this.pendientes.set([]);
      return;
    }
    this.loading.set(true);
    this.service.pendientes(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => this.pendientes.set(this.unwrapArray(res)),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudieron cargar las cuentas.')),
    });
  }

  abrirPedido(p: any) {
    this.loading.set(true);
    this.service.cuenta(p.id_pedido).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const det = this.unwrapObject(res);
        this.detalle.set(det);
        this.idsSel.set([]);
        this.mediosDraft.set([]);
        this.cobroForm.patchValue({ modo: det?.cuenta?.tipo_division || 'COMPLETA', n_parte: null });
        this.docForm.reset({
          tipo_comprobante: 'NINGUNO',
          tipo_doc_cliente: '0',
          num_doc_cliente: '',
          razon_social_cliente: 'CLIENTES VARIOS',
          direccion_cliente: '',
        });
        this.tab.set('cobrar');
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo abrir la cuenta.')),
    });
  }

  toggleItem(id: number) {
    this.idsSel.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  agregarMedio() {
    const raw = this.mediosForm.getRawValue();
    const monto = this.round2(Number(raw.monto));
    if (!(monto > 0) || !raw.medio) return;
    this.mediosDraft.update((list) => [
      ...list,
      {
        medio: String(raw.medio),
        monto,
        recibido: raw.medio === 'EFECTIVO' ? this.round2(Number(raw.recibido ?? monto)) : null,
        referencia: String(raw.referencia || '').trim(),
      },
    ]);
    this.mediosForm.patchValue({ monto: 0, recibido: null, referencia: '' });
  }

  quitarMedio(i: number) {
    this.mediosDraft.update((list) => list.filter((_, idx) => idx !== i));
  }

  llenarEfectivo() {
    const m = this.montoACobrar();
    this.mediosDraft.set([{ medio: 'EFECTIVO', monto: m, recibido: m, referencia: '' }]);
  }

  cobrar() {
    const det = this.detalle();
    if (!det) return;
    const esperado = this.montoACobrar();
    if (!(esperado > 0)) {
      this.alert.warning('Nada que cobrar.');
      return;
    }
    if (this.round2(this.sumaMedios()) !== this.round2(esperado)) {
      this.alert.warning('La suma de medios debe coincidir con el monto a cobrar.');
      return;
    }
    const raw = this.cobroForm.getRawValue();
    const payload: any = {
      id_pedido: det.pedido.id_pedido,
      modo: raw.modo,
      total_esperado: esperado,
      medios: this.mediosDraft(),
    };
    if (raw.modo === 'ITEMS') payload.ids_items = this.idsSel();
    if (raw.modo === 'PARTES') {
      payload.n_partes = raw.n_partes;
      payload.n_parte = raw.n_parte;
    }
    this.alert.showLoading('Registrando cobro...');
    this.service.cobrar(payload).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const detNuevo = this.unwrapObject(res);
        this.detalle.set(detNuevo);
        this.mediosDraft.set([]);
        this.idsSel.set([]);
        this.alert.success('Cobro registrado.');
        this.cargarPendientes();
        this.cargarTurno();
        this.emitirTrasCobro(detNuevo, esperado);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo cobrar.'));
      },
    });
  }

  consultarSunat() {
    const tipoUi = this.docForm.getRawValue().tipo_doc_cliente;
    const tipo = tipoUi === '6' ? 'RUC' : tipoUi === '1' ? 'DNI' : '';
    const numero = String(this.docForm.getRawValue().num_doc_cliente || '').replace(/\D/g, '');
    if (!tipo) {
      this.alert.toast('Elija DNI o RUC para consultar.', 'warning');
      return;
    }
    this.consultando.set(true);
    this.pos.identity(tipo, numero).pipe(finalize(() => this.consultando.set(false))).subscribe({
      next: (res) => {
        const data = res?.data || res;
        this.docForm.patchValue({
          razon_social_cliente: data.razon_social || data.nombre_comercial || '',
          direccion_cliente: data.direccion || '',
        });
        this.alert.success('Datos de SUNAT cargados.');
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo consultar SUNAT.')),
    });
  }

  private emitirTrasCobro(det: any, total: number) {
    const tipo = String(this.docForm.getRawValue().tipo_comprobante || 'NINGUNO');
    if (tipo === 'NINGUNO') return;
    if (!this.perms.hasPermission('crear_venta_pos')) {
      this.alert.toast('El cobro quedó registrado. Emita el documento en Comprobantes.', 'info');
      return;
    }
    const cobros = det?.cobros || [];
    const idCobro = Number(cobros[cobros.length - 1]?.id_cobro || 0);
    const doc = this.docForm.getRawValue();
    this.alert.showLoading('Emitiendo documento...');
    this.pos.emitirCuenta({
      id_cuenta: Number(det?.cuenta?.id_cuenta),
      id_cobro: idCobro || undefined,
      tipo_comprobante: tipo,
      total_esperado: total,
      tipo_doc_cliente: doc.tipo_doc_cliente,
      num_doc_cliente: doc.num_doc_cliente,
      razon_social_cliente: doc.razon_social_cliente,
      direccion_cliente: doc.direccion_cliente,
    }).pipe(finalize(() => this.alert.closeLoading())).subscribe({
      next: (res) => {
        const data = res?.data || res;
        if (data?.error) {
          this.alert.toast(data.error, 'warning');
          return;
        }
        this.alert.success('Documento emitido.');
        if (data?.id_documento) {
          this.pos.pdfInterno(Number(data.id_documento)).subscribe((blob) => this.abrirBlob(blob));
        } else if (data?.id_comprobante) {
          this.comps.pdf(Number(data.id_comprobante)).subscribe((blob) => this.abrirBlob(blob));
        }
      },
      error: (e) => this.alert.toast(this.msgError(e, 'El cobro quedó, pero no se emitió el documento.'), 'warning'),
    });
  }

  private abrirBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  descargarPrecuenta() {
    const det = this.detalle();
    if (!det) return;
    this.service.precuenta(det.pedido.id_pedido).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.alert.error('No se pudo generar la pre-cuenta.'),
    });
  }

  encolarTicket() {
    const det = this.detalle();
    if (!det) return;
    this.reportes.encolar({ tipo: 'PRECUENTA', id_referencia: Number(det.pedido.id_pedido) }).subscribe({
      next: () => this.alert.success('Ticket encolado. Puede descargarlo en Reportes → Cola tickets.'),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo encolar el ticket.')),
    });
  }

  irAComprobante() {
    const det = this.detalle();
    const idCuenta = Number(det?.cuenta?.id_cuenta);
    if (!idCuenta) return;
    this.router.navigate(['/comprobantes'], { queryParams: { cuenta: idCuenta } });
  }

  cargarHistorial(page: number) {
    this.historialLoading.set(true);
    this.service.turnos(page, 10, this.idSucursal() || undefined)
      .pipe(finalize(() => this.historialLoading.set(false)))
      .subscribe({
        next: (res) => {
          const block = res?.data?.data ? res.data : res;
          this.historial.set(block?.data || []);
          this.historialMeta.set(block?.meta || { total: 0, page, limit: 10 });
        },
        error: (e) => this.alert.error(this.msgError(e, 'No se pudo cargar el historial.')),
      });
  }

  abrirDetalleTurno(row: any, tpl: TemplateRef<any>) {
    this.service.turno(row.id_turno).subscribe({
      next: (res) => {
        this.turnoDetalle.set(this.unwrapObject(res));
        this.modal.open(tpl, { size: 'lg', centered: true });
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo abrir el turno.')),
    });
  }

  cerrarModal() {
    this.modal.dismissAll();
  }

  turnoDetalle = signal<any | null>(null);

  etiquetaMedio(c: string) {
    return this.mediosCat.find((m) => m.codigo === c)?.etiqueta || c;
  }

  partesSelect(det: any) {
    const partes = (det?.partes || []).filter((p: any) => p.estado === 'PENDIENTE');
    if (partes.length) {
      return partes.map((p: any) => ({
        ...p,
        etiqueta: `Parte ${p.n_parte} · S/ ${Number(p.monto).toFixed(2)}`,
      }));
    }
    return [{ n_parte: 1, monto: 0, estado: 'PENDIENTE', etiqueta: 'Parte 1 (se crearán)' }];
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
