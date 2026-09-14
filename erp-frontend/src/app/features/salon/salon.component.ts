import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
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
import { SessionContextService } from 'src/app/core/services/session-context.service';
import { CajaHttpService } from '../caja/caja.service';

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
  private caja = inject(CajaHttpService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  public perms = inject(PermissionsService);
  private sessionContext = inject(SessionContextService);

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
  plano = signal<{
    tipo_forma: string;
    puntos: number[][];
    landmarks: any[];
  }>({ tipo_forma: 'RECT', puntos: [[0, 0], [100, 0], [100, 100], [0, 100]], landmarks: [] });
  editandoPlano = signal(false);
  dibujando = signal(false);
  draftPoints = signal<number[][]>([]);
  landmarkPendiente = signal<string | null>(null);
  landmarkArrastrando = signal<number | null>(null);
  formasMapa = signal<any[]>([]);
  tiposLandmark = signal<any[]>([]);
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

  get esTabletMozo(): boolean {
    return this.sessionContext.esTabletOperativo() && this.sessionContext.nombreRol() === 'MOZO';
  }

  get tabsVisibles(): ErpTab[] {
    if (this.esTabletMozo) return this.tabs.filter((t) => t.id === 'mapa');
    return this.tabs;
  }

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
        this.formasMapa.set(cat.formas_mapa || [
          { codigo: 'RECT', etiqueta: 'Rectangular' },
          { codigo: 'L', etiqueta: 'Forma en L' },
          { codigo: 'CIRCLE', etiqueta: 'Circular' },
          { codigo: 'CUSTOM', etiqueta: 'Personalizado' },
        ]);
        this.tiposLandmark.set(cat.landmarks || [
          { codigo: 'TV', etiqueta: 'TV / Pantalla' },
          { codigo: 'BANO', etiqueta: 'Baño' },
          { codigo: 'ESCALERA', etiqueta: 'Escalera' },
          { codigo: 'COCINA', etiqueta: 'Cocina' },
          { codigo: 'CAJA', etiqueta: 'Caja' },
          { codigo: 'ENTRADA', etiqueta: 'Entrada' },
        ]);
        const sucursales = this.unwrapArray(res.suc);
        this.sucursales.set(sucursales);
        const idCtx = this.sessionContext.idSucursal();
        if (sucursales.length === 1 || (this.esTabletMozo && idCtx)) {
          this.sucursalBloqueada.set(true);
          const id = sucursales.length === 1 ? sucursales[0].id_sucursal : idCtx;
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
    if (this.editandoPlano()) this.toggleEditarPlano();
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
    if (this.editandoPlano() || this.organizar() || this.skipClick) {
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
    const lmIdx = this.landmarkArrastrando();
    if (lmIdx != null) {
      const canvas = this.mapaCanvas()?.nativeElement;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = this.snapPct(((ev.clientX - rect.left) / rect.width) * 100);
      const y = this.snapPct(((ev.clientY - rect.top) / rect.height) * 100);
      this.plano.update((p) => {
        const landmarks = [...(p.landmarks || [])];
        if (!landmarks[lmIdx]) return p;
        landmarks[lmIdx] = { ...landmarks[lmIdx], x, y };
        return { ...p, landmarks };
      });
      return;
    }

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
    if (this.landmarkArrastrando() != null) {
      this.landmarkArrastrando.set(null);
      if (this.editandoPlano()) this.guardarPlano();
      return;
    }

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
        const data = this.unwrapObject(res);
        const actualizado = Array.isArray(data?.mesas) ? data.mesas : this.unwrapArray(res);
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
        next: (res) => {
          const data = this.unwrapObject(res);
          if (Array.isArray(data)) {
            this.mapa.set(data);
            return;
          }
          if (data?.plano) {
            this.plano.set({
              tipo_forma: data.plano.tipo_forma || 'RECT',
              puntos: Array.isArray(data.plano.puntos) ? data.plano.puntos : [[2, 2], [98, 2], [98, 98], [2, 98]],
              landmarks: Array.isArray(data.plano.landmarks) ? data.plano.landmarks : [],
            });
          }
          this.mapa.set(Array.isArray(data?.mesas) ? data.mesas : this.unwrapArray(res));
        },
        error: (e) => {
          if (!silencioso) this.alert.error(this.msgError(e, 'No se pudo cargar el mapa.'));
        },
      });
  }

  toggleEditarPlano() {
    if (this.organizar()) this.toggleOrganizar();
    const next = !this.editandoPlano();
    this.editandoPlano.set(next);
    this.dibujando.set(false);
    this.draftPoints.set([]);
    this.landmarkPendiente.set(null);
  }

  aplicarForma(codigo: string) {
    if (codigo === 'CUSTOM') {
      this.iniciarDibujo();
      return;
    }
    const puntos =
      codigo === 'L'
        ? [[0, 0], [50, 0], [50, 50], [100, 50], [100, 100], [0, 100]]
        : codigo === 'CIRCLE'
          ? [[50, 50], [48, 48]]
          : [[0, 0], [100, 0], [100, 100], [0, 100]];
    this.plano.update((p) => ({ ...p, tipo_forma: codigo, puntos }));
    this.dibujando.set(false);
    this.draftPoints.set([]);
    this.guardarPlano();
  }

  iniciarDibujo() {
    this.dibujando.set(true);
    this.draftPoints.set([]);
    this.landmarkPendiente.set(null);
    this.plano.update((p) => ({ ...p, tipo_forma: 'CUSTOM' }));
  }

  cancelarDibujo() {
    this.dibujando.set(false);
    this.draftPoints.set([]);
  }

  deshacerPunto() {
    this.draftPoints.update((pts) => pts.slice(0, -1));
  }

  onCanvasClick(ev: MouseEvent) {
    if (!this.editandoPlano()) return;
    if ((ev.target as HTMLElement)?.closest?.('.mesa-card, .landmark-del, .mapa-landmark')) return;
    const canvas = this.mapaCanvas()?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Coordenadas 0–100 en toda la superficie (como celdas A1… del plano de referencia)
    const x = this.snapPct(((ev.clientX - rect.left) / rect.width) * 100);
    const y = this.snapPct(((ev.clientY - rect.top) / rect.height) * 100);

    const lmTipo = this.landmarkPendiente();
    if (lmTipo) {
      this.plano.update((p) => ({
        ...p,
        landmarks: [...(p.landmarks || []), { tipo: lmTipo, x, y }],
      }));
      this.landmarkPendiente.set(null);
      this.guardarPlano();
      return;
    }

    if (!this.dibujando()) return;
    const draft = this.draftPoints();
    if (draft.length >= 3) {
      const first = draft[0];
      const dist = Math.hypot(x - first[0], y - first[1]);
      if (dist < 5) {
        this.plano.update((p) => ({ ...p, tipo_forma: 'CUSTOM', puntos: draft.slice() }));
        this.dibujando.set(false);
        this.draftPoints.set([]);
        this.guardarPlano();
        return;
      }
    }
    this.draftPoints.update((pts) => [...pts, [x, y]]);
  }

  elegirLandmark(tipo: string) {
    this.dibujando.set(false);
    this.landmarkPendiente.set(tipo);
  }

  quitarLandmark(idx: number) {
    this.plano.update((p) => ({
      ...p,
      landmarks: (p.landmarks || []).filter((_: any, i: number) => i !== idx),
    }));
    this.guardarPlano();
  }

  onLandmarkPointerDown(ev: PointerEvent, idx: number) {
    if (!this.editandoPlano()) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.landmarkArrastrando.set(idx);
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  guardarPlano() {
    const id = this.idSucursal();
    if (!id) return;
    const p = this.plano();
    this.service.guardarPlano({
      id_sucursal: id,
      tipo_forma: p.tipo_forma,
      puntos: p.puntos,
      landmarks: p.landmarks,
    }).subscribe({
      next: (res) => {
        const data = this.unwrapObject(res);
        if (data?.tipo_forma) {
          this.plano.set({
            tipo_forma: data.tipo_forma,
            puntos: data.puntos || p.puntos,
            landmarks: data.landmarks || [],
          });
        }
        this.alert.toast('Plano guardado', 'success');
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo guardar el plano.')),
    });
  }

  roomPathD(): string {
    const dibujando = this.dibujando();
    const pts = dibujando && this.draftPoints().length
      ? this.draftPoints()
      : this.plano().puntos || [];
    if (this.plano().tipo_forma === 'CIRCLE' && !dibujando) return '';
    if (pts.length < 2) return '';
    const base = 'M ' + pts.map((p) => `${p[0]},${p[1]}`).join(' L ');
    return dibujando || pts.length < 3 ? base : base + ' Z';
  }

  circleAttrs() {
    const pts = this.plano().puntos || [];
    const cx = pts[0]?.[0] ?? 50;
    const cy = pts[0]?.[1] ?? 50;
    const rx = pts[1]?.[0] ?? 46;
    const ry = pts[1]?.[1] ?? 46;
    return { cx, cy, rx, ry };
  }

  iconoLandmark(tipo: string): string {
    const map: Record<string, string> = {
      TV: 'bi-tv',
      BANO: 'bi-droplet',
      ESCALERA: 'bi-sort-up',
      COCINA: 'bi-fire',
      CAJA: 'bi-cash-stack',
      ENTRADA: 'bi-door-open',
    };
    return map[tipo] || 'bi-geo-alt';
  }

  etiquetaLandmark(tipo: string): string {
    return this.tiposLandmark().find((t) => t.codigo === tipo)?.etiqueta || tipo;
  }

  private snapPct(n: number) {
    // Rejilla cada 2% (equivalente al snap de 20px del HTML de referencia)
    const snapped = Math.round(n / 2) * 2;
    return Math.min(100, Math.max(0, snapped));
  }

  private clampPct(n: number) {
    return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
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

  /** QR Carta: cualquier rol con permiso (incluye mozo en tablet; antes se ocultaba con !esTabletMozo). */
  puedeVerQrCarta(m: any): boolean {
    return !!m?.id_mesa && this.perms.hasPermission('ver_qr_mesa');
  }

  puedeCobrarDesdeSalon(m: any): boolean {
    if (!m || String(m.estado) !== 'PIDIENDO_CUENTA') return false;
    return this.perms.hasPermission('cobrar') || this.perms.hasPermission('ver_caja');
  }

  irACobrar(modal: any) {
    const mesa = this.mesaSeleccionada();
    if (!mesa) return;
    const idPedido = Number(mesa.id_pedido || 0);
    if (idPedido) {
      modal.dismiss();
      this.router.navigate(['/caja'], { queryParams: { pedido: idPedido, tab: 'cobrar' } });
      return;
    }
    // Fallback: buscar cuenta abierta de la mesa
    this.alert.showLoading('Abriendo cobro...');
    this.caja.pendientes(Number(mesa.id_sucursal || this.idSucursal())).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const list = this.unwrapArray(res);
        const hit = list.find((p: any) => Number(p.id_mesa) === Number(mesa.id_mesa));
        if (!hit?.id_pedido) {
          this.alert.warning('No se encontró un pedido pendiente de cobro para esta mesa.');
          return;
        }
        modal.dismiss();
        this.router.navigate(['/caja'], { queryParams: { pedido: hit.id_pedido, tab: 'cobrar' } });
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo abrir el cobro.'));
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
