import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  private route = inject(ActivatedRoute);
  public perms = inject(PermissionsService);

  tab = signal<TabCaja>('turno');
  sucursales = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  idSucursal = signal<number | null>(null);
  turno = signal<any | null>(null);
  pendientes = signal<any[]>([]);
  sinComprobante = signal<any[]>([]);
  detalle = signal<any | null>(null);
  idsSel = signal<number[]>([]);
  loading = signal(false);
  emitiendoDoc = signal(false);

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
  comprobanteEmitidoEnCobro = signal(false);
  tipoDocVenta = signal('NINGUNO');

  saldo = computed(() => Number(this.detalle()?.cuenta?.saldo || 0));
  totalCuenta = computed(() => Number(this.detalle()?.cuenta?.total || 0));
  pagadoCuenta = computed(() => Number(this.detalle()?.cuenta?.pagado || 0));
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

  /** Progreso del cobro actual (medios en borrador). */
  progresoPagoPct = computed(() => {
    const meta = this.montoACobrar();
    if (!(meta > 0)) return 0;
    return Math.min(100, Math.round((this.sumaMedios() / meta) * 100));
  });

  pagosCompletos = computed(() => {
    const meta = this.montoACobrar();
    return meta > 0 && this.round2(this.sumaMedios()) >= this.round2(meta);
  });

  /** Progreso histórico de la cuenta (ya cobrado vs total). */
  progresoCuentaPct = computed(() => {
    const tot = this.totalCuenta();
    if (!(tot > 0)) return 0;
    return Math.min(100, Math.round((this.pagadoCuenta() / tot) * 100));
  });

  mostrarEmitirComprobante = computed(() => {
    const det = this.detalle();
    if (!det) return false;
    const est = det.cuenta?.estado;
    if (est !== 'PAGADA' && est !== 'PARCIAL') return false;
    if (!this.perms.hasPermission('emitir_comprobante') && !this.perms.hasPermission('crear_venta_pos')) {
      return false;
    }
    if (this.comprobanteEmitidoEnCobro()) return false;
    if (det.cuenta?.tiene_comprobante_electronico) return false;
    return true;
  });

  /** Tras cobro: formulario de cliente visible para corregir y emitir. */
  mostrarPanelClienteEmitir = computed(() => {
    const det = this.detalle();
    if (!det) return false;
    if (this.comprobanteEmitidoEnCobro() || det.cuenta?.tiene_comprobante_electronico) return false;
    const est = det.cuenta?.estado;
    const saldo = Number(det.cuenta?.saldo || 0);
    if (est === 'PAGADA') return true;
    // Parcial ya sin saldo pendiente de cobro (p.ej. redondeo)
    if (est === 'PARCIAL' && !(saldo > 0.009)) return true;
    return false;
  });

  ngOnInit() {
    this.docForm.get('tipo_comprobante')?.valueChanges.subscribe((v) => {
      const tipo = String(v || 'NINGUNO');
      this.tipoDocVenta.set(tipo);
      if (tipo === 'FACTURA') {
        this.docForm.patchValue({ tipo_doc_cliente: '6' }, { emitEvent: false });
      }
    });
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
        this.abrirDesdeQuery();
      },
      error: () => this.alert.error('No se pudieron cargar sucursales.'),
    });
  }

  /** Deep-link desde salón: /caja?pedido=123&tab=cobrar */
  private abrirDesdeQuery() {
    const q = this.route.snapshot.queryParamMap;
    const idPedido = Number(q.get('pedido') || 0);
    const tab = String(q.get('tab') || '');
    if (tab === 'cobrar' || idPedido) this.tab.set('cobrar');
    if (!idPedido) return;
    this.abrirPedido({ id_pedido: idPedido });
  }

  onTab(id: string) {
    this.tab.set(id as TabCaja);
    if (id === 'historial') this.cargarHistorial(1);
    if (id === 'cobrar') {
      this.cargarPendientes();
      this.cargarSinComprobante();
    }
  }

  onSucursal() {
    const id = Number(this.sucursalForm.getRawValue().id_sucursal) || null;
    this.idSucursal.set(id);
    this.detalle.set(null);
    if (!id && this.sucursales().length > 1) {
      this.turno.set(null);
      this.pendientes.set([]);
      this.sinComprobante.set([]);
      return;
    }
    this.cargarTurno();
    this.cargarPendientes();
    this.cargarSinComprobante();
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

  cargarSinComprobante() {
    const id = this.idSucursal();
    if (!id) {
      this.sinComprobante.set([]);
      return;
    }
    this.service.sinComprobante(id).subscribe({
      next: (res) => this.sinComprobante.set(this.unwrapArray(res)),
      error: () => this.sinComprobante.set([]),
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
        this.comprobanteEmitidoEnCobro.set(!!det?.cuenta?.tiene_comprobante_electronico);
        this.tipoDocVenta.set('NINGUNO');
        this.cobroForm.patchValue({ modo: det?.cuenta?.tipo_division || 'COMPLETA', n_parte: null });
        const esPagada = det?.cuenta?.estado === 'PAGADA' || det?.cuenta?.estado === 'PARCIAL';
        this.docForm.reset({
          tipo_comprobante: esPagada && !det?.cuenta?.tiene_comprobante_electronico ? 'FACTURA' : 'NINGUNO',
          tipo_doc_cliente: esPagada && !det?.cuenta?.tiene_comprobante_electronico ? '6' : '0',
          num_doc_cliente: '',
          razon_social_cliente: 'CLIENTES VARIOS',
          direccion_cliente: '',
        });
        this.tipoDocVenta.set(this.docForm.getRawValue().tipo_comprobante || 'NINGUNO');
        this.tab.set('cobrar');
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo abrir la cuenta.')),
    });
  }

  toggleItem(id: number) {
    this.idsSel.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  agregarMedio() {
    if (this.pagosCompletos()) return;
    const raw = this.mediosForm.getRawValue();
    const monto = this.round2(Number(raw.monto));
    if (!(monto > 0) || !raw.medio) return;
    const restante = this.round2(Math.max(0, this.montoACobrar() - this.sumaMedios()));
    const montoFinal = Math.min(monto, restante || monto);
    this.mediosDraft.update((list) => [
      ...list,
      {
        medio: String(raw.medio),
        monto: this.round2(montoFinal),
        recibido: raw.medio === 'EFECTIVO' ? this.round2(Number(raw.recibido ?? montoFinal)) : null,
        referencia: String(raw.referencia || '').trim(),
      },
    ]);
    this.mediosForm.patchValue({ monto: 0, recibido: null, referencia: '' });
  }

  quitarMedio(i: number) {
    this.mediosDraft.update((list) => list.filter((_, idx) => idx !== i));
  }

  llenarEfectivo() {
    if (this.pagosCompletos()) return;
    const m = this.montoACobrar();
    this.mediosDraft.set([{ medio: 'EFECTIVO', monto: m, recibido: m, referencia: '' }]);
  }

  claseMedioChip(medio: string): string {
    const m = String(medio || '').toUpperCase();
    if (m === 'EFECTIVO') return 'pago-chip-efectivo';
    if (m === 'YAPE' || m === 'PLIN') return 'pago-chip-wallet';
    if (m === 'TARJETA' || m === 'VISA' || m === 'MASTERCARD') return 'pago-chip-tarjeta';
    if (m === 'TRANSFERENCIA') return 'pago-chip-transfer';
    return 'pago-chip-otro';
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
    const errDoc = this.validarDocumentoVenta();
    if (errDoc) {
      this.alert.warning(errDoc);
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
        this.cargarSinComprobante();
        this.cargarTurno();
        this.emitirTrasCobro(detNuevo, esperado);
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo cobrar.'));
      },
    });
  }

  /** Valida cliente antes de cobrar / emitir. */
  validarDocumentoVenta(): string | null {
    const tipo = String(this.docForm.getRawValue().tipo_comprobante || this.tipoDocVenta() || 'NINGUNO');
    if (tipo === 'NINGUNO' || tipo === 'NOTA_VENTA' || tipo === 'BOLETA_SIMPLE') return null;
    const doc = this.docForm.getRawValue();
    const num = String(doc.num_doc_cliente || '').replace(/\D/g, '');
    const razon = String(doc.razon_social_cliente || '').trim().toUpperCase();
    if (tipo === 'FACTURA') {
      if (String(doc.tipo_doc_cliente) !== '6' || !/^(10|15|17|20)\d{9}$/.test(num)) {
        return 'La factura requiere RUC válido de 11 dígitos (inicia con 10, 15, 17 o 20). Corrija el documento antes de cobrar.';
      }
      if (!razon || razon === 'CLIENTES VARIOS') {
        return 'Indique la razón social del RUC (use el botón SUNAT).';
      }
    }
    if (tipo === 'BOLETA') {
      if (doc.tipo_doc_cliente === '1' && num && !/^\d{8}$/.test(num)) {
        return 'DNI inválido: debe tener 8 dígitos.';
      }
      if (doc.tipo_doc_cliente === '6' && num && !/^\d{11}$/.test(num)) {
        return 'RUC inválido: debe tener 11 dígitos.';
      }
      if (this.montoACobrar() >= 700 && (String(doc.tipo_doc_cliente) !== '1' || !/^\d{8}$/.test(num))) {
        return 'Boleta de S/ 700 o más requiere DNI de 8 dígitos.';
      }
    }
    return null;
  }

  reintentarEmision() {
    const det = this.detalle();
    if (!det) return;
    const errDoc = this.validarDocumentoVenta();
    if (errDoc) {
      this.alert.warning(errDoc);
      return;
    }
    const tipo = String(this.docForm.getRawValue().tipo_comprobante || 'NINGUNO');
    if (tipo === 'NINGUNO') {
      this.irAComprobante();
      return;
    }
    const total = this.round2(Number(det.cuenta?.pagado || det.cuenta?.total || 0));
    this.emitirTrasCobro(det, total > 0 ? total : this.round2(Number(det.cuenta?.total || 0)));
  }

  consultarSunat() {
    const tipoUi = this.docForm.getRawValue().tipo_doc_cliente;
    const tipo = tipoUi === '6' ? 'RUC' : tipoUi === '1' ? 'DNI' : '';
    const numero = String(this.docForm.getRawValue().num_doc_cliente || '').replace(/\D/g, '');
    if (!tipo) {
      this.alert.toast('Elija DNI o RUC para consultar.', 'warning');
      return;
    }
    if (tipo === 'RUC' && !/^\d{11}$/.test(numero)) {
      this.alert.warning('El RUC debe tener 11 dígitos.');
      return;
    }
    if (tipo === 'DNI' && !/^\d{8}$/.test(numero)) {
      this.alert.warning('El DNI debe tener 8 dígitos.');
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
    const tipo = String(this.docForm.getRawValue().tipo_comprobante || this.tipoDocVenta() || 'NINGUNO');
    if (tipo === 'NINGUNO') {
      this.cargarSinComprobante();
      return;
    }
    const errDoc = this.validarDocumentoVenta();
    if (errDoc) {
      this.comprobanteEmitidoEnCobro.set(false);
      this.alert.warning(
        `${errDoc} El cobro ya quedó registrado (cuenta #${det?.cuenta?.id_cuenta}). Corrija el documento y pulse EMITIR.`,
      );
      this.cargarSinComprobante();
      return;
    }
    if (!this.perms.hasPermission('crear_venta_pos')) {
      this.alert.toast(
        `Cobro OK (cuenta #${det?.cuenta?.id_cuenta}). Emita el documento en Comprobantes.`,
        'info',
      );
      this.cargarSinComprobante();
      return;
    }
    const cobros = det?.cobros || [];
    const idCobro = Number(cobros[cobros.length - 1]?.id_cobro || 0);
    const doc = this.docForm.getRawValue();
    this.emitiendoDoc.set(true);
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
    }).pipe(finalize(() => {
      this.alert.closeLoading();
      this.emitiendoDoc.set(false);
    })).subscribe({
      next: (res) => {
        const data = res?.data || res;
        if (data?.error) {
          this.comprobanteEmitidoEnCobro.set(false);
          this.alert.warning(
            `${data.error} Cuenta #${det?.cuenta?.id_cuenta}. Corrija y vuelva a emitir.`,
          );
          this.cargarSinComprobante();
          return;
        }
        this.comprobanteEmitidoEnCobro.set(true);
        this.detalle.update((d) =>
          d
            ? {
                ...d,
                cuenta: { ...d.cuenta, tiene_comprobante_electronico: true },
              }
            : d,
        );
        this.alert.success('Documento emitido.');
        this.cargarSinComprobante();
        if (data?.id_documento) {
          this.pos.pdfInterno(Number(data.id_documento)).subscribe((blob) => this.abrirBlob(blob));
        } else if (data?.id_comprobante) {
          this.comps.pdf(Number(data.id_comprobante)).subscribe((blob) => this.abrirBlob(blob));
        }
      },
      error: (e) => {
        this.comprobanteEmitidoEnCobro.set(false);
        this.alert.warning(
          `${this.msgError(e, 'No se emitió el documento')}. Cuenta #${det?.cuenta?.id_cuenta} · Pedido #${det?.pedido?.id_pedido}. Corrija el RUC/DNI y pulse EMITIR.`,
        );
        this.cargarSinComprobante();
      },
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
