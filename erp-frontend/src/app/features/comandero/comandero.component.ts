import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize, forkJoin } from 'rxjs';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { SessionContextService } from 'src/app/core/services/session-context.service';
import { PedidosService } from './pedidos.service';
import { CajaHttpService } from '../caja/caja.service';

export interface LineaComanda {
  uid: string;
  id_producto: number;
  nombre: string;
  estacion: string;
  cantidad: number;
  precio_base: number;
  notas: string;
  mods: { id_insumo: number; accion: 'AGREGAR' | 'QUITAR'; cantidad: number; costo_adicional: number; etiqueta: string }[];
  porciones: { id_porcion: number; nombre: string; precio: number }[];
  id_pedido_item?: number;
  estado_preparacion?: string;
}

@Component({
  selector: 'app-comandero',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgbModalModule, NgSelectModule, FormErrorComponent],
  templateUrl: './comandero.component.html',
  styleUrls: ['./comandero.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComanderoComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PedidosService);
  private caja = inject(CajaHttpService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private route = inject(ActivatedRoute);
  public perms = inject(PermissionsService);
  private sessionContext = inject(SessionContextService);

  get esTablet(): boolean {
    return this.sessionContext.esTabletOperativo();
  }

  sucursales = signal<any[]>([]);
  mesas = signal<any[]>([]);
  carta = signal<any[]>([]);
  insumos = signal<any[]>([]);
  porcionesCat = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  idSucursal = signal<number | null>(null);
  idMesa = signal<number | null>(null);
  categoria = signal<string | null>(null);
  pedidoId = signal<number | null>(null);
  pedidoEstado = signal<string | null>(null);
  pedidoOrigen = signal<string | null>(null);
  lineas = signal<LineaComanda[]>([]);
  loading = signal(false);
  productoSel = signal<any | null>(null);

  accionesMod = [
    { id: 'AGREGAR', etiqueta: 'Extra' },
    { id: 'QUITAR', etiqueta: 'Sin' },
  ];
  terminos = [
    { id: '', etiqueta: 'Sin término' },
    { id: 'TÉRMINO CRUDO', etiqueta: 'Crudo' },
    { id: 'TÉRMINO MEDIO', etiqueta: 'Medio' },
    { id: 'TÉRMINO TRES CUARTOS', etiqueta: 'Tres cuartos' },
    { id: 'TÉRMINO BIEN COCIDO', etiqueta: 'Bien cocido' },
  ];

  filtros = this.fb.group({
    id_sucursal: [null as number | null, Validators.required],
    id_mesa: [null as number | null, Validators.required],
  });

  itemForm = this.fb.group({
    cantidad: [1, [Validators.required, Validators.min(0.001)]],
    notas: [''],
    termino: [''],
    id_insumo: [null as number | null],
    accion: ['AGREGAR' as 'AGREGAR' | 'QUITAR'],
    id_porcion: [null as number | null],
  });
  modsDraft = signal<LineaComanda['mods']>([]);
  porcionesDraft = signal<LineaComanda['porciones']>([]);

  categorias = computed(() => {
    const seen = new Map<string, number>();
    for (const p of this.carta()) {
      if (!seen.has(p.categoria)) seen.set(p.categoria, Number(p.categoria_orden || 0));
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([nombre]) => nombre);
  });

  cartaFiltrada = computed(() => {
    const cat = this.categoria();
    return this.carta().filter((p) => !cat || p.categoria === cat);
  });

  total = computed(() => {
    return this.round2(this.lineas().reduce((s, l) => s + this.lineaTotal(l), 0));
  });

  esBorrador = computed(() => !this.pedidoEstado() || this.pedidoEstado() === 'PENDIENTE_CONFIRMACION');
  puedeEditar = computed(() => this.esBorrador() && this.perms.hasPermission('crear_pedido'));
  puedePedirCuenta = computed(() =>
    !!this.pedidoId()
    && !this.esBorrador()
    && this.pedidoEstado() !== 'PAGADO'
    && this.perms.hasPermission('pedir_cuenta'),
  );

  etiquetaEstadoPedido(estado: string | null) {
    const map: Record<string, string> = {
      PENDIENTE_CONFIRMACION: 'Pendiente confirmación',
      CONFIRMADO: 'Confirmado',
      EN_PREPARACION: 'En preparación',
      LISTO: 'Listo en cocina/bar',
      ENTREGADO: 'Entregado — puede pedir cuenta',
      PAGADO: 'Pagado',
      ANULADO: 'Anulado',
    };
    return estado ? (map[estado] || estado) : '';
  }

  ngOnInit() {
    this.service.sucursales().subscribe({
      next: (res) => {
        const sucursales = this.unwrapArray(res);
        this.sucursales.set(sucursales);
        const qMesa = Number(this.route.snapshot.queryParamMap.get('mesa') || 0);
        const idCtx = this.sessionContext.idSucursal();
        if (sucursales.length === 1 || (this.esTablet && idCtx)) {
          this.sucursalBloqueada.set(true);
          const id = sucursales.length === 1 ? sucursales[0].id_sucursal : idCtx;
          this.filtros.patchValue({ id_sucursal: id });
          this.filtros.get('id_sucursal')?.disable({ emitEvent: false });
          this.onSucursal(qMesa || undefined);
        }
      },
      error: () => this.alert.error('No se pudieron cargar sucursales.'),
    });
  }

  onSucursal(preselectMesa?: number) {
    const id = Number(this.filtros.getRawValue().id_sucursal);
    if (!id) return;
    this.idSucursal.set(id);
    this.idMesa.set(null);
    this.pedidoId.set(null);
    this.pedidoEstado.set(null);
    this.pedidoOrigen.set(null);
    this.lineas.set([]);
    forkJoin({
      mesas: this.service.mesas(id),
      carta: this.service.carta(id),
      insumos: this.service.insumosMod(),
      porciones: this.service.porciones(),
    }).subscribe({
      next: (res) => {
        this.mesas.set(this.unwrapArray(res.mesas));
        this.carta.set(this.unwrapArray(res.carta));
        this.insumos.set(this.unwrapArray(res.insumos));
        this.porcionesCat.set(
          this.unwrapArray(res.porciones).map((p: any) => ({
            ...p,
            id_porcion: Number(p.id_porcion),
            precio: Number(p.precio),
          })),
        );
        const cats = this.categorias();
        if (cats.length) this.categoria.set(cats[0]);
        if (preselectMesa) {
          this.filtros.patchValue({ id_mesa: preselectMesa });
          this.onMesa();
        }
      },
      error: () => this.alert.error('No se pudo cargar la carta.'),
    });
  }

  onMesa() {
    const id = Number(this.filtros.getRawValue().id_mesa);
    this.idMesa.set(id || null);
    this.pedidoId.set(null);
    this.pedidoEstado.set(null);
    this.pedidoOrigen.set(null);
    this.lineas.set([]);
    if (!id) return;
    this.loading.set(true);
    this.service.activo(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const data = this.unwrapObject(res);
        if (!data?.id_pedido) return;
        this.cargarPedido(data);
      },
      error: () => this.alert.error('No se pudo cargar la comanda de la mesa.'),
    });
  }

  abrirProducto(prod: any, modal: TemplateRef<any>) {
    if (!this.puedeEditar()) return;
    if (!this.idMesa()) {
      this.alert.warning('Seleccione una mesa.');
      return;
    }
    this.productoSel.set(prod);
    this.modsDraft.set([]);
    this.porcionesDraft.set([]);
    this.itemForm.reset({ cantidad: 1, notas: '', termino: '', id_insumo: null, accion: 'AGREGAR', id_porcion: null });
    this.modal.open(modal, { centered: true, backdrop: 'static' });
  }

  productoPermiteMods(prod?: any) {
    const est = String(prod?.estacion || '').toUpperCase();
    return est === 'PARRILLA' || est === 'COCINA';
  }

  productoPermiteTermino(prod?: any) {
    return String(prod?.estacion || '').toUpperCase() === 'PARRILLA';
  }

  porcionesDisponibles = computed(() => {
    const est = String(this.productoSel()?.estacion || '').toUpperCase();
    if (!est || est === 'BAR' || est === 'NINGUNA') return [];
    return this.porcionesCat().filter((p) => {
      const a = String(p.aplica_estacion || 'TODAS').toUpperCase();
      return a === 'TODAS' || a === est;
    });
  });

  cmpPorcion = (a: any, b: any) => Number(a) === Number(b);

  agregarPorcion(sel?: any) {
    const id = Number(
      sel?.id_porcion ?? (sel != null && sel !== '' && typeof sel !== 'object' ? sel : null) ?? this.itemForm.getRawValue().id_porcion,
    );
    if (!id) return;
    const p = this.porcionesDisponibles().find((x) => Number(x.id_porcion) === id);
    if (!p) return;
    this.porcionesDraft.update((list) => {
      if (list.some((x) => x.id_porcion === Number(p.id_porcion))) return list;
      return [...list, { id_porcion: Number(p.id_porcion), nombre: p.nombre, precio: Number(p.precio) }];
    });
    this.itemForm.patchValue({ id_porcion: null });
  }

  quitarPorcion(idx: number) {
    this.porcionesDraft.update((list) => list.filter((_, i) => i !== idx));
  }

  agregarMod() {
    const raw = this.itemForm.getRawValue();
    const insumo = this.insumos().find((i) => Number(i.id_insumo) === Number(raw.id_insumo));
    if (!insumo) return;
    const accion = raw.accion as 'AGREGAR' | 'QUITAR';
    const cantidad = 1;
    const costo = accion === 'AGREGAR' ? this.round4(Number(insumo.costo_unitario) * cantidad) : 0;
    this.modsDraft.update((list) => {
      if (list.some((m) => m.id_insumo === insumo.id_insumo && m.accion === accion)) return list;
      return [...list, { id_insumo: Number(insumo.id_insumo), accion, cantidad, costo_adicional: costo, etiqueta: insumo.nombre }];
    });
    this.itemForm.patchValue({ id_insumo: null });
  }

  quitarMod(idx: number) {
    this.modsDraft.update((list) => list.filter((_, i) => i !== idx));
  }

  confirmarProducto(modalRef: any) {
    const prod = this.productoSel();
    if (!prod || this.itemForm.get('cantidad')?.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }
    const raw = this.itemForm.getRawValue();
    const termino = this.productoPermiteTermino(prod) ? String(raw.termino || '').trim() : '';
    const notasLibres = String(raw.notas || '').trim();
    const notas = [termino, notasLibres].filter(Boolean).join(' · ');
    this.lineas.update((list) => [
      ...list,
      {
        uid: `${Date.now()}-${prod.id_producto}`,
        id_producto: Number(prod.id_producto),
        nombre: prod.nombre,
        estacion: prod.estacion,
        cantidad: Number(raw.cantidad),
        precio_base: Number(prod.precio),
        notas,
        mods: this.productoPermiteMods(prod) ? this.modsDraft() : [],
        porciones: this.productoPermiteMods(prod) ? this.porcionesDraft() : [],
      },
    ]);
    modalRef.close();
  }

  quitarLinea(uid: string) {
    this.lineas.update((list) => list.filter((l) => l.uid !== uid));
  }

  lineaTotal(l: LineaComanda) {
    const extraMods = l.mods.reduce((s, m) => s + (m.accion === 'AGREGAR' ? Number(m.costo_adicional) : 0), 0);
    const extraPorc = (l.porciones || []).reduce((s, p) => s + Number(p.precio || 0), 0);
    return this.round2((Number(l.precio_base) + extraMods + extraPorc) * Number(l.cantidad));
  }

  guardarBorrador() {
    this.persistir(false);
  }

  confirmarComanda() {
    this.alert.confirmAction('¿Confirmar comanda?', 'Se enviará al KDS. El stock se descuenta al PREPARAR, no al confirmar.', 'Sí, confirmar')
      .then((ok) => { if (ok) this.persistir(true); });
  }

  anularComanda() {
    const id = this.pedidoId();
    if (!id) return;
    this.alert.confirmAction('¿Anular comanda?', 'La mesa quedará libre si no hay otro pedido.', 'Sí, anular').then((ok) => {
      if (!ok) return;
      this.alert.showLoading('Anulando...');
      this.service.anular(id).subscribe({
        next: () => {
          this.alert.closeLoading();
          this.alert.success('Comanda anulada.');
          this.pedidoId.set(null);
          this.pedidoEstado.set(null);
    this.pedidoOrigen.set(null);
          this.lineas.set([]);
        },
        error: (e) => {
          this.alert.closeLoading();
          this.alert.error(this.msgError(e, 'No se pudo anular.'));
        },
      });
    });
  }

  pedirCuenta() {
    const id = this.pedidoId();
    if (!id) return;
    this.caja.pedirCuenta(id).subscribe({
      next: () => this.alert.success('Mesa en pidiendo cuenta.'),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo pedir la cuenta.')),
    });
  }

  entregarItem(item: any) {
    const id = this.pedidoId();
    if (!id) return;
    this.service.cambiarPreparacion(id, item.id_pedido_item, 'ENTREGADO').subscribe({
      next: (res) => this.cargarPedido(this.unwrapObject(res)),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo marcar entregado.')),
    });
  }

  private persistir(confirmar: boolean) {
    const raw = this.filtros.getRawValue();
    if (!raw.id_sucursal || !raw.id_mesa) {
      this.alert.warning('Seleccione sucursal y mesa.');
      return;
    }
    if (!this.lineas().length) {
      this.alert.warning('Agregue al menos un producto.');
      return;
    }
    const payload = {
      id_sucursal: Number(raw.id_sucursal),
      id_mesa: Number(raw.id_mesa),
      total_esperado: this.total(),
      items: this.lineas().map((l) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
        notas: l.notas || null,
        mods: l.mods.map((m) => ({ id_insumo: m.id_insumo, accion: m.accion, cantidad: m.cantidad })),
        porciones: (l.porciones || []).map((p) => p.id_porcion),
      })),
    };
    this.alert.showLoading(confirmar ? 'Confirmando...' : 'Guardando...');
    const id = this.pedidoId();
    const req$ = id ? this.service.actualizar(id, payload) : this.service.crear(payload);
    req$.subscribe({
      next: (res) => {
        const data = this.unwrapObject(res);
        const idPedido = this.extractPedidoId(res);
        if (!idPedido) {
          this.alert.closeLoading();
          this.alert.error('No se obtuvo el ID del pedido. Recargue la mesa e intente de nuevo.');
          return;
        }
        this.pedidoId.set(idPedido);
        if (confirmar) {
          this.service.confirmar(idPedido, this.total()).subscribe({
            next: (res2) => {
              this.alert.closeLoading();
              this.alert.success('Comanda confirmada. Cocina ya puede verla.');
              this.cargarPedido(this.unwrapObject(res2));
            },
            error: (e) => {
              this.alert.closeLoading();
              this.alert.error(this.msgError(e, 'Se guardó el borrador pero falló la confirmación.'));
              this.cargarPedido(data);
            },
          });
        } else {
          this.alert.closeLoading();
          this.alert.success('Borrador guardado.');
          this.cargarPedido(data);
        }
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo guardar la comanda.'));
      },
    });
  }

  private cargarPedido(data: any) {
    this.pedidoId.set(data.id_pedido);
    this.pedidoEstado.set(data.estado);
    this.pedidoOrigen.set(data.origen || 'MOZO');
    const padres = (data.items || []).filter((i: any) => !i.id_item_padre);
    this.lineas.set(padres.map((i: any) => ({
      uid: `db-${i.id_pedido_item}`,
      id_producto: Number(i.id_producto),
      nombre: i.producto,
      estacion: i.estacion,
      cantidad: Number(i.cantidad),
      precio_base: this.round2(
        Number(i.precio_unitario)
        - (i.mods || []).reduce((s: number, m: any) => s + (m.accion === 'AGREGAR' ? Number(m.costo_adicional) : 0), 0)
        - (i.porciones || []).reduce((s: number, p: any) => s + Number(p.precio || 0), 0),
      ),
      notas: i.notas || '',
      mods: (i.mods || []).map((m: any) => ({
        id_insumo: Number(m.id_insumo),
        accion: m.accion,
        cantidad: Number(m.cantidad),
        costo_adicional: Number(m.costo_adicional),
        etiqueta: m.insumo,
      })),
      porciones: (i.porciones || []).map((p: any) => ({
        id_porcion: Number(p.id_porcion),
        nombre: p.nombre,
        precio: Number(p.precio),
      })),
      id_pedido_item: i.id_pedido_item,
      estado_preparacion: i.estado_preparacion,
    })));
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private unwrapObject(res: any): any {
    if (res == null) return null;
    if (res.success && (res.data === null || res.data === undefined)) return null;
    const candidates = [res.data, res.data?.data, res, res?.data?.data?.data];
    for (const c of candidates) {
      if (c?.id_pedido != null) return c;
    }
    return res?.data?.data || res?.data || res;
  }

  private extractPedidoId(res: any): number | null {
    const data = this.unwrapObject(res);
    const id = Number(data?.id_pedido ?? 0);
    return id > 0 ? id : null;
  }

  private msgError(e: any, fallback: string) {
    const m = e?.error?.mensaje || e?.error?.message;
    return Array.isArray(m) ? m[0] : (m || fallback);
  }

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private round4(n: number) {
    return Math.round(Number(n || 0) * 10000) / 10000;
  }
}
