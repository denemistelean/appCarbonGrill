import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { interval, finalize, forkJoin } from 'rxjs';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { SalonService } from './salon.service';

type TabSalon = 'mapa' | 'mesas' | 'uniones';

@Component({
  selector: 'app-salon',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    NgbModalModule,
    RouterModule,
    NgSelectModule,
    TableProComponent,
    FormErrorComponent,
    ErpTabsComponent,
  ],
  templateUrl: './salon.component.html',
  styleUrls: ['./salon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalonComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(SalonService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private destroyRef = inject(DestroyRef);
  public perms = inject(PermissionsService);

  private crudService = {
    findAll: (page: number, limit: number, search: string) =>
      this.service.findAll(page, limit, {
        search,
        id_sucursal: this.idSucursal() || this.filtrosMapa.getRawValue().id_sucursal || undefined,
      }),
    create: (data: any) => this.service.create(data),
    update: (id: number, data: any) => this.service.update(id, data),
    delete: (id: number) => this.service.delete(id),
  };

  public crud = useCrud<any>(this.crudService as any, { itemName: 'Mesa', initialLimit: 20 });

  tab = signal<TabSalon>('mapa');
  sucursales = signal<any[]>([]);
  estados = signal<any[]>([]);
  zonas = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  idSucursal = signal<number | null>(null);
  filtroZona = signal<string | null>(null);

  mapa = signal<any[]>([]);
  mapaLoading = signal(false);
  mesaSeleccionada = signal<any | null>(null);
  mesasParaUnir = signal<any[]>([]);
  llamados = signal<any[]>([]);
  qrData = signal<any | null>(null);
  organizar = signal(false);
  arrastrandoId = signal<number | null>(null);
  listado = signal<any[]>([]);
  listadoMeta = signal({ total: 0, page: 1, limit: 50 });
  listadoLoading = signal(false);
  private mapaCanvas = viewChild<ElementRef<HTMLElement>>('mapaCanvas');
  private drag: { id: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null = null;
  private skipClick = false;

  uniones = signal<any[]>([]);
  unionesMeta = signal({ total: 0, page: 1, limit: 10 });
  unionesLoading = signal(false);

  tabs: ErpTab[] = [
    { id: 'mapa', label: 'Mapa', icon: 'bi-grid-3x3-gap' },
    { id: 'mesas', label: 'Mesas', icon: 'bi-table' },
    { id: 'uniones', label: 'Uniones', icon: 'bi-link-45deg' },
  ];

  filtrosMapa: FormGroup = this.fb.group({ id_sucursal: [null], zona: [null] });
  mesaModalForm: FormGroup = this.fb.group({
    estado: [null, Validators.required],
    id_mesas_unir: [[]],
  });
  formMesa: FormGroup = this.fb.group({
    id_sucursal: [null, Validators.required],
    numero: ['', [Validators.required, Validators.maxLength(10)]],
    nombre: ['', Validators.maxLength(60)],
    capacidad: [4, [Validators.required, Validators.min(1), Validators.max(20)]],
    zona: ['SALON', Validators.required],
    pos_x: [50, [Validators.min(0), Validators.max(100)]],
    pos_y: [40, [Validators.min(0), Validators.max(100)]],
  });

  mesasUnidasLabel = computed(() => {
    const m = this.mesaSeleccionada();
    if (!m?.mesas_unidas?.length) return '';
    return m.mesas_unidas.map((x: any) => x.numero).join(' + ');
  });

  ngOnInit() {
    forkJoin({ cat: this.service.catalogos(), suc: this.service.sucursales() }).subscribe({
      next: (res) => {
        const cat = this.unwrapObject(res.cat);
        this.estados.set(cat.estados || []);
        this.zonas.set(cat.zonas || []);
        const sucursales = this.unwrapArray(res.suc);
        this.sucursales.set(sucursales);
        if (sucursales.length === 1) {
          this.sucursalBloqueada.set(true);
          const id = sucursales[0].id_sucursal;
          this.idSucursal.set(id);
          this.filtrosMapa.patchValue({ id_sucursal: id });
          this.filtrosMapa.get('id_sucursal')?.disable({ emitEvent: false });
        }
        this.cargarMapa();
        this.cargarListado();
      },
      error: () => this.alert.error('No se pudo cargar sucursales.'),
    });

    interval(10000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.tab() === 'mapa' && this.idSucursal() && !this.organizar() && !this.arrastrandoId()) {
        this.cargarMapa(true);
        this.cargarLlamados();
      }
    });
  }

  onTab(id: string) {
    const t = id as TabSalon;
    this.tab.set(t);
    if (t === 'mapa') {
      this.cargarMapa();
      this.cargarLlamados();
    }
    if (t === 'mesas') this.cargarListado();
    if (t === 'uniones') this.cargarUniones();
  }

  onSucursalMapa() {
    const raw = this.filtrosMapa.getRawValue();
    this.idSucursal.set(raw.id_sucursal ? Number(raw.id_sucursal) : null);
    this.filtroZona.set(raw.zona || null);
    this.cargarMapa();
    this.cargarLlamados();
    if (this.tab() === 'mesas') this.cargarListado();
  }

  toggleOrganizar() {
    if (!this.perms.hasPermission('actualizar_mesa')) return;
    this.organizar.update((v) => !v);
    if (!this.organizar()) this.cargarMapa(true);
  }

  abrirMesa(mesa: any, modal: TemplateRef<any>) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.service.findOne(mesa.id_mesa).subscribe({
      next: (res) => {
        const data = this.unwrapObject(res);
        this.mesaSeleccionada.set(data);
        this.mesaModalForm.reset({ estado: data.estado, id_mesas_unir: [] });
        this.cargarMesasParaUnir(data);
        this.modal.open(modal, { centered: true, backdrop: 'static', size: 'lg' });
      },
      error: () => this.alert.error('No se pudo cargar la mesa.'),
    });
  }

  guardarEstadoMesa(modalRef: any) {
    const mesa = this.mesaSeleccionada();
    if (!mesa || this.mesaModalForm.invalid) {
      this.mesaModalForm.markAllAsTouched();
      return;
    }
    const raw = this.mesaModalForm.getRawValue();
    const unir: number[] = (raw.id_mesas_unir || []).map((x: any) => Number(x));

    this.alert.showLoading('Guardando...');
    this.service.cambiarEstado(mesa.id_mesa, raw.estado).subscribe({
      next: () => {
        const done = () => {
          this.alert.closeLoading();
          this.alert.success('Mesa actualizada.');
          modalRef.close();
          this.cargarMapa();
        };
        if (unir.length && this.perms.hasPermission('actualizar_mesa')) {
          this.service.unir(mesa.id_mesa, unir).subscribe({
            next: () => done(),
            error: (e) => {
              this.alert.closeLoading();
              this.alert.error(this.msgError(e, 'Estado guardado pero falló la unión.'));
              this.cargarMapa();
            },
          });
        } else {
          done();
        }
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo actualizar la mesa.'));
      },
    });
  }

  separarMesa(modalRef: any) {
    const mesa = this.mesaSeleccionada();
    if (!mesa) return;
    this.alert.confirmAction('¿Separar mesas?', 'Las mesas unidas quedarán libres.', 'Sí, separar').then((ok) => {
      if (!ok) return;
      this.alert.showLoading('Separando...');
      this.service.separar(mesa.id_mesa).subscribe({
        next: () => {
          this.alert.closeLoading();
          this.alert.success('Mesas separadas.');
          modalRef.close();
          this.cargarMapa();
        },
        error: (e) => {
          this.alert.closeLoading();
          this.alert.error(this.msgError(e, 'No se pudo separar.'));
        },
      });
    });
  }

  liberarMesa(modalRef: any) {
    const mesa = this.mesaSeleccionada();
    if (!mesa) return;
    this.alert.showLoading('Liberando mesa...');
    this.service.cambiarEstado(mesa.id_mesa, 'LIBRE').subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Mesa lista. Ya puede recibir otro cliente.');
        modalRef.close();
        this.cargarMapa();
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo liberar la mesa.'));
      },
    });
  }

  claseEstado(estado: string) {
    return `mesa-card mesa-${(estado || 'LIBRE').toLowerCase()}`;
  }

  etiquetaEstado(codigo: string) {
    return this.estados().find((e) => e.codigo === codigo)?.etiqueta || codigo;
  }

  etiquetaZona(codigo: string) {
    return this.zonas().find((z) => z.codigo === codigo)?.etiqueta || codigo;
  }

  abrirFormMesa(modal: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crud.setupModal(item?.id_mesa || null);
    const idSuc = this.idSucursal() || this.filtrosMapa.getRawValue().id_sucursal;
    this.formMesa.reset({
      id_sucursal: item?.id_sucursal || idSuc,
      numero: item?.numero || '',
      nombre: item?.nombre || '',
      capacidad: item?.capacidad ?? 4,
      zona: item?.zona || 'SALON',
      pos_x: item?.pos_x ?? this.siguientePos().x,
      pos_y: item?.pos_y ?? this.siguientePos().y,
    });
    if (this.sucursalBloqueada()) this.formMesa.get('id_sucursal')?.disable({ emitEvent: false });
    this.crud.openModal(modal, { centered: true, backdrop: 'static' });
  }

  guardarMesa() {
    if (this.formMesa.invalid) {
      this.formMesa.markAllAsTouched();
      return;
    }
    this.crud.save(this.formMesa.getRawValue(), () => {
      this.cargarMapa();
      this.cargarListado();
    });
  }

  eliminarMesa(id: number) {
    this.alert.confirmDelete('¿Eliminar mesa?', 'Dejará de verse en el salón y en la carta QR.').then((ok) => {
      if (!ok) return;
      this.alert.showLoading('Eliminando...');
      this.service.delete(id).subscribe({
        next: () => {
          this.alert.closeLoading();
          this.alert.success('Mesa eliminada.');
          this.cargarListado();
          this.cargarMapa();
        },
        error: (e) => {
          this.alert.closeLoading();
          this.alert.error(this.msgError(e, 'No se pudo eliminar la mesa.'));
        },
      });
    });
  }

  onMesaClick(mesa: any, modal: TemplateRef<any>) {
    if (this.organizar() || this.skipClick) {
      this.skipClick = false;
      return;
    }
    this.abrirMesa(mesa, modal);
  }

  onMesaPointerDown(ev: PointerEvent, mesa: any) {
    if (!this.organizar() || !this.perms.hasPermission('actualizar_mesa')) return;
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    this.drag = {
      id: Number(mesa.id_mesa),
      startX: ev.clientX,
      startY: ev.clientY,
      origX: Number(mesa.pos_x || 0),
      origY: Number(mesa.pos_y || 0),
      moved: false,
    };
    this.arrastrandoId.set(this.drag.id);
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(ev: PointerEvent) {
    if (!this.drag || !this.organizar()) return;
    const canvas = this.mapaCanvas()?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = ((ev.clientX - this.drag.startX) / rect.width) * 100;
    const dy = ((ev.clientY - this.drag.startY) / rect.height) * 100;
    if (Math.abs(dx) + Math.abs(dy) > 0.8) this.drag.moved = true;
    const pos_x = Math.min(96, Math.max(4, this.drag.origX + dx));
    const pos_y = Math.min(96, Math.max(8, this.drag.origY + dy));
    const id = this.drag.id;
    this.mapa.update((rows) => rows.map((m) => (Number(m.id_mesa) === id ? { ...m, pos_x, pos_y } : m)));
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onPointerUp() {
    if (!this.drag) return;
    const info = this.drag;
    this.drag = null;
    this.arrastrandoId.set(null);
    if (!info.moved) return;
    this.skipClick = true;
    const mesa = this.mapa().find((m) => Number(m.id_mesa) === info.id);
    const idSuc = this.idSucursal();
    if (!mesa || !idSuc) return;
    this.service.actualizarPosiciones(idSuc, [{
      id_mesa: mesa.id_mesa,
      pos_x: Math.round(Number(mesa.pos_x)),
      pos_y: Math.round(Number(mesa.pos_y)),
    }]).subscribe({
      next: (res) => {
        const actualizado = this.unwrapArray(res);
        if (actualizado.length) this.mapa.set(actualizado);
        this.alert.toast(`Mesa ${mesa.numero} reposicionada.`, 'success');
      },
      error: (e) => {
        this.alert.error(this.msgError(e, 'No se pudo guardar la posición.'));
        this.cargarMapa(true);
      },
    });
  }

  onSucursalListado() {
    const raw = this.filtrosMapa.getRawValue();
    this.idSucursal.set(raw.id_sucursal ? Number(raw.id_sucursal) : null);
    this.listadoMeta.update((m) => ({ ...m, page: 1 }));
    this.cargarListado();
  }

  onBuscarListado(q: string) {
    this.crud.searchControl.setValue(q || '', { emitEvent: false });
    this.listadoMeta.update((m) => ({ ...m, page: 1 }));
    this.cargarListado();
  }

  cargarListado() {
    this.listadoLoading.set(true);
    const raw = this.filtrosMapa.getRawValue();
    const id = Number(this.idSucursal() || raw.id_sucursal || 0) || undefined;
    const { page, limit } = this.listadoMeta();
    this.service.findAll(page, limit, { search: this.crud.searchControl.value || '', id_sucursal: id })
      .pipe(finalize(() => this.listadoLoading.set(false)))
      .subscribe({
        next: (res) => {
          const payload = this.unwrapPayload(res, this.listadoMeta());
          this.listado.set(payload.data);
          this.listadoMeta.set(payload.meta);
        },
        error: (e) => this.alert.error(this.msgError(e, 'No se pudo cargar el listado de mesas.')),
      });
  }

  cambiarPaginaListado(page: number) {
    this.listadoMeta.update((m) => ({ ...m, page }));
    this.cargarListado();
  }

  cargarMapa(silencioso = false) {
    const raw = this.filtrosMapa.getRawValue();
    const id = Number(raw.id_sucursal);
    if (!id) {
      this.mapa.set([]);
      return;
    }
    this.idSucursal.set(id);
    if (!silencioso) this.mapaLoading.set(true);
    this.service.mapa(id, raw.zona || undefined)
      .pipe(finalize(() => this.mapaLoading.set(false)))
      .subscribe({
        next: (res) => this.mapa.set(this.unwrapArray(res)),
        error: (e) => {
          if (!silencioso) this.alert.error(this.msgError(e, 'No se pudo cargar el mapa.'));
        },
      });
  }

  cargarLlamados() {
    const id = this.idSucursal();
    if (!id || !this.perms.hasPermission('ver_llamado')) {
      this.llamados.set([]);
      return;
    }
    this.service.llamados(id).subscribe({
      next: (res) => this.llamados.set(this.unwrapArray(res)),
      error: () => this.llamados.set([]),
    });
  }

  atenderLlamado(l: any) {
    this.service.atenderLlamado(l.id_llamado).subscribe({
      next: () => {
        this.alert.success('Llamado atendido.');
        this.cargarLlamados();
        this.cargarMapa(true);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo atender.')),
    });
  }

  mostrarQr(tpl: TemplateRef<any>) {
    const mesa = this.mesaSeleccionada();
    if (!mesa) return;
    this.alert.showLoading('Generando QR...');
    this.service.qrMesa(mesa.id_mesa).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        this.qrData.set(this.unwrapObject(res));
        this.modal.open(tpl, { centered: true });
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo generar el QR.'));
      },
    });
  }

  cerrarQr() {
    this.modal.dismissAll();
  }

  cerrarSesionQr() {
    const mesa = this.mesaSeleccionada();
    if (!mesa) return;
    this.service.cerrarSesionQr(mesa.id_mesa).subscribe({
      next: () => {
        this.alert.success('Sesión QR cerrada.');
        this.modal.dismissAll();
        this.cargarMapa(true);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo cerrar la sesión.')),
    });
  }

  cambiarPaginaUniones(page: number) {
    this.unionesMeta.update((m) => ({ ...m, page }));
    this.cargarUniones();
  }

  private cargarUniones() {
    this.unionesLoading.set(true);
    const { page, limit } = this.unionesMeta();
    this.service.uniones(page, limit, this.idSucursal() || undefined)
      .pipe(finalize(() => this.unionesLoading.set(false)))
      .subscribe({
        next: (res: any) => {
          const payload = this.unwrapPayload(res, this.unionesMeta());
          this.uniones.set(payload.data);
          this.unionesMeta.set(payload.meta);
        },
        error: () => this.alert.error('No se pudo cargar el historial.'),
      });
  }

  private cargarMesasParaUnir(mesa: any) {
    const idSuc = mesa.id_sucursal;
    this.service.lista(idSuc).subscribe({
      next: (res) => {
        const todas = this.unwrapArray(res);
        this.mesasParaUnir.set(
          todas.filter((m: any) =>
            Number(m.id_mesa) !== Number(mesa.id_mesa) &&
            !m.mesa_padre_id &&
            m.estado === 'LIBRE'
          )
        );
      },
    });
  }

  private siguientePos() {
    const n = this.mapa().length || this.listado().length;
    return {
      x: 12 + (n % 5) * 19,
      y: 22 + Math.floor(n / 5) * 28,
    };
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data?.items)) return res.data.items;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.items)) return res.items;
    return [];
  }

  private unwrapObject(res: any): any {
    return res?.data?.data || res?.data || res || {};
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

  private msgError(e: any, fallback: string) {
    return e?.error?.mensaje || e?.error?.message || fallback;
  }
}
