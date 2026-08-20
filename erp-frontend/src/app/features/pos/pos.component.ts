import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { CajaHttpService } from '../caja/caja.service';
import { ComprobantesHttpService } from '../comprobantes/comprobantes.service';
import { ClientesService } from '../clientes/clientes.service';
import { PosHttpService } from './pos.service';

type Linea = { id_producto: number; nombre: string; precio: number; cantidad: number };

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgSelectModule, FormErrorComponent],
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private pos = inject(PosHttpService);
  private caja = inject(CajaHttpService);
  private clientesApi = inject(ClientesService);
  private comps = inject(ComprobantesHttpService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  sucursales = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  turno = signal<any | null>(null);
  productos = signal<any[]>([]);
  categoria = signal<string>('TODAS');
  busqueda = signal('');
  carrito = signal<Linea[]>([]);
  clientes = signal<any[]>([]);
  consultando = signal(false);
  cobrando = signal(false);
  productoCtrl = new FormControl<any>(null);

  tipos = [
    { id: 'NOTA_VENTA', nombre: 'Nota de venta' },
    { id: 'BOLETA_SIMPLE', nombre: 'Boleta simple' },
    { id: 'BOLETA', nombre: 'Boleta electrónica' },
    { id: 'FACTURA', nombre: 'Factura electrónica' },
  ];
  mediosCat = [
    { codigo: 'EFECTIVO', etiqueta: 'Efectivo' },
    { codigo: 'TARJETA', etiqueta: 'Tarjeta' },
    { codigo: 'YAPE', etiqueta: 'Yape' },
    { codigo: 'PLIN', etiqueta: 'Plin' },
  ];
  tiposDoc = [
    { codigo: '0', etiqueta: 'Sin documento' },
    { codigo: '1', etiqueta: 'DNI' },
    { codigo: '6', etiqueta: 'RUC' },
  ];

  cabecera = this.fb.group({
    id_sucursal: [null as number | null, Validators.required],
    id_cliente: [null as number | null],
    tipo_comprobante: ['NOTA_VENTA', Validators.required],
    tipo_doc_cliente: ['0'],
    num_doc_cliente: [''],
    razon_social_cliente: ['CLIENTES VARIOS'],
    direccion_cliente: [''],
    medio: ['EFECTIVO'],
    recibido: [null as number | null],
  });

  categorias = computed(() => {
    const set = new Set<string>(['TODAS']);
    for (const p of this.productos()) set.add(String(p.categoria || 'OTROS'));
    return [...set];
  });

  cartaFiltrada = computed(() => {
    const cat = this.categoria();
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter((p) => {
      if (cat !== 'TODAS' && p.categoria !== cat) return false;
      if (q && !`${p.nombre} ${p.codigo || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  total = computed(() => this.round2(this.carrito().reduce((s, l) => s + l.precio * l.cantidad, 0)));

  ngOnInit() {
    this.caja.sucursales().subscribe({
      next: (res) => {
        const list = this.unwrapArray(res);
        this.sucursales.set(list);
        if (list.length === 1) {
          this.sucursalBloqueada.set(true);
          this.cabecera.patchValue({ id_sucursal: list[0].id_sucursal });
          this.cabecera.get('id_sucursal')?.disable({ emitEvent: false });
          this.onSucursal();
        }
      },
    });
    this.cabecera.get('id_sucursal')?.valueChanges.subscribe(() => this.onSucursal());
    this.cabecera.get('tipo_comprobante')?.valueChanges.subscribe((t) => {
      if (t === 'FACTURA') this.cabecera.patchValue({ tipo_doc_cliente: '6', razon_social_cliente: '' });
      if (t === 'NOTA_VENTA' || t === 'BOLETA_SIMPLE') {
        if (!this.cabecera.getRawValue().id_cliente) {
          this.cabecera.patchValue({ tipo_doc_cliente: '0', razon_social_cliente: 'CLIENTES VARIOS' });
        }
      }
    });
  }

  onSucursal() {
    const id = Number(this.cabecera.getRawValue().id_sucursal);
    if (!id) return;
    this.pos.productos(id).subscribe({
      next: (res) => this.productos.set(this.unwrapArray(res)),
      error: () => this.alert.error('No se pudo cargar la carta.'),
    });
    this.caja.turnoActual(id).subscribe({
      next: (res) => this.turno.set(this.unwrapObject(res)),
      error: () => this.turno.set(null),
    });
    this.clientesApi.lista().subscribe({
      next: (res) => this.clientes.set(this.unwrapArray(res)),
    });
  }

  buscarClientes(term: string) {
    this.clientesApi.lista(term || undefined).subscribe({
      next: (res) => this.clientes.set(this.unwrapArray(res)),
    });
  }

  onCliente(cli: any) {
    const item = cli && typeof cli === 'object'
      ? cli
      : this.clientes().find((c) => Number(c.id_cliente) === Number(cli));
    if (!item) {
      this.cabecera.patchValue({
        tipo_doc_cliente: this.cabecera.getRawValue().tipo_comprobante === 'FACTURA' ? '6' : '0',
        num_doc_cliente: '',
        razon_social_cliente: this.cabecera.getRawValue().tipo_comprobante === 'FACTURA' ? '' : 'CLIENTES VARIOS',
        direccion_cliente: '',
      });
      return;
    }
    this.cabecera.patchValue({
      tipo_doc_cliente: this.mapTipoDoc(item.tipo_documento),
      num_doc_cliente: item.numero_documento,
      razon_social_cliente: item.razon_social,
      direccion_cliente: item.direccion || '',
    });
  }

  agregarDesdeSelect(p: any) {
    if (!p) return;
    this.agregar(p);
    this.productoCtrl.setValue(null, { emitEvent: false });
  }

  agregar(p: any) {
    const id = Number(p.id_producto);
    const precio = Number(p.precio);
    this.carrito.update((rows) => {
      const i = rows.findIndex((r) => r.id_producto === id);
      if (i >= 0) {
        const copy = [...rows];
        copy[i] = { ...copy[i], cantidad: this.round3(copy[i].cantidad + 1) };
        return copy;
      }
      return [...rows, { id_producto: id, nombre: p.nombre, precio, cantidad: 1 }];
    });
  }

  setCantidad(id: number, raw: string) {
    const n = Math.max(0.001, Number(raw) || 0);
    this.carrito.update((rows) => rows.map((r) => r.id_producto === id ? { ...r, cantidad: this.round3(n) } : r));
  }

  quitar(id: number) {
    this.carrito.update((rows) => rows.filter((r) => r.id_producto !== id));
  }

  consultarSunat() {
    const tipoUi = this.cabecera.getRawValue().tipo_doc_cliente;
    const tipo = tipoUi === '6' ? 'RUC' : tipoUi === '1' ? 'DNI' : '';
    const numero = String(this.cabecera.getRawValue().num_doc_cliente || '').replace(/\D/g, '');
    if (!tipo) {
      this.alert.toast('Elija DNI o RUC para consultar.', 'warning');
      return;
    }
    this.consultando.set(true);
    this.pos.identity(tipo, numero).pipe(finalize(() => this.consultando.set(false))).subscribe({
      next: (res) => {
        const data = res?.data || res;
        this.cabecera.patchValue({
          razon_social_cliente: data.razon_social || data.nombre_comercial || '',
          direccion_cliente: data.direccion || '',
        });
        this.alert.success('Datos de SUNAT cargados.');
      },
      error: (e) => this.alert.error(e?.error?.mensaje || 'No se pudo consultar SUNAT.'),
    });
  }

  confirmar() {
    if (!this.turno()) {
      this.alert.error('Abra un turno de caja antes de vender.');
      return;
    }
    if (!this.carrito().length) {
      this.alert.error('Agregue productos.');
      return;
    }
    const v = this.cabecera.getRawValue();
    const total = this.total();
    const medio = String(v.medio || 'EFECTIVO');
    const recibido = medio === 'EFECTIVO' ? Number(v.recibido ?? total) : undefined;
    this.cobrando.set(true);
    this.pos.vender({
      id_sucursal: Number(v.id_sucursal),
      tipo_comprobante: v.tipo_comprobante,
      total_esperado: total,
      items: this.carrito().map((l) => ({ id_producto: l.id_producto, cantidad: l.cantidad })),
      medios: [{ medio, monto: total, recibido }],
      id_cliente: v.id_cliente || undefined,
      tipo_doc_cliente: v.tipo_doc_cliente,
      num_doc_cliente: v.num_doc_cliente,
      razon_social_cliente: v.razon_social_cliente,
      direccion_cliente: v.direccion_cliente,
    }).pipe(finalize(() => this.cobrando.set(false))).subscribe({
      next: (res) => {
        const data = res?.data || res;
        if (data?.documento?.error) {
          this.alert.toast(data.documento.error, 'warning');
        } else {
          this.alert.success('Venta registrada.');
        }
        const doc = data?.documento;
        if (doc?.id_documento) {
          this.pos.pdfInterno(Number(doc.id_documento)).subscribe((blob) => this.abrirBlob(blob));
        } else if (doc?.id_comprobante) {
          this.comps.pdf(Number(doc.id_comprobante)).subscribe((blob) => this.abrirBlob(blob));
        }
        this.carrito.set([]);
        this.onSucursal();
      },
      error: (e) => this.alert.error(e?.error?.mensaje || 'No se pudo registrar la venta.'),
    });
  }

  private abrirBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  private mapTipoDoc(tipo: string) {
    const t = String(tipo || '').toUpperCase();
    if (t === 'DNI') return '1';
    if (t === 'RUC') return '6';
    if (t === 'CE') return '4';
    if (t === 'PAS') return '7';
    return '0';
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private unwrapObject(res: any): any {
    return res?.data?.data || res?.data || res;
  }

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private round3(n: number) {
    return Math.round(Number(n || 0) * 1000) / 1000;
  }
}
