import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { ReportesHttpService } from './reportes.service';

type TabRep = 'consolidado' | 'ventas' | 'platos' | 'rentabilidad' | 'mermas' | 'ocupacion' | 'impresion';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    NgSelectModule,
    TableProComponent,
    ErpTabsComponent,
  ],
  templateUrl: './reportes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ReportesHttpService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  tab = signal<TabRep>('consolidado');
  sucursales = signal<any[]>([]);
  sucursalBloqueada = signal(false);
  loading = signal(false);

  consolidado = signal<any | null>(null);
  ventas = signal<any | null>(null);
  platos = signal<any[]>([]);
  rentabilidad = signal<any | null>(null);
  mermas = signal<any | null>(null);
  ocupacion = signal<any | null>(null);

  cola = signal<any[]>([]);
  colaMeta = signal({ total: 0, page: 1, limit: 10 });
  colaLoading = signal(false);
  estadosCola = [
    { codigo: 'PENDIENTE', etiqueta: 'Pendiente' },
    { codigo: 'IMPRESO', etiqueta: 'Impreso' },
    { codigo: 'ERROR', etiqueta: 'Error' },
  ];

  tabs = computed<ErpTab[]>(() => {
    this.perms.permissionsSignal();
    return [
      { id: 'consolidado', label: 'Consolidado', icon: 'bi-layers' },
      { id: 'ventas', label: 'Ventas', icon: 'bi-graph-up' },
      { id: 'platos', label: 'Platos', icon: 'bi-egg-fried' },
      { id: 'rentabilidad', label: 'Rentabilidad', icon: 'bi-piggy-bank' },
      { id: 'mermas', label: 'Mermas', icon: 'bi-droplet' },
      { id: 'ocupacion', label: 'Ocupación', icon: 'bi-clock-history' },
      {
        id: 'impresion',
        label: 'Cola tickets',
        icon: 'bi-printer',
        visible: this.perms.hasPermission('ver_cola_impresion'),
      },
    ];
  });

  filtros = this.fb.group({
    id_sucursal: [null as number | null],
    fecha_desde: [this.haceDias(6)],
    fecha_hasta: [this.hoy()],
    estado: [null as string | null],
  });

  ngOnInit() {
    this.service.sucursales().subscribe({
      next: (res) => {
        const list = this.unwrapArray(res);
        this.sucursales.set(list);
        if (list.length === 1) {
          this.sucursalBloqueada.set(true);
          this.filtros.patchValue({ id_sucursal: list[0].id_sucursal });
        }
        this.cargar();
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudieron cargar sucursales.')),
    });
  }

  onTab(id: string) {
    this.tab.set(id as TabRep);
    this.cargar();
  }

  filtrar() {
    this.cargar();
  }

  cargar() {
    const t = this.tab();
    if (t === 'impresion') {
      this.cargarCola(1);
      return;
    }
    this.loading.set(true);
    const q = this.query();
    const req =
      t === 'consolidado' ? this.service.consolidado(q)
      : t === 'ventas' ? this.service.ventas(q)
      : t === 'platos' ? this.service.platos(q)
      : t === 'rentabilidad' ? this.service.rentabilidad(q)
      : t === 'mermas' ? this.service.mermas(q)
      : this.service.ocupacion(q);
    req.pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const data = this.unwrapObject(res);
        if (t === 'consolidado') this.consolidado.set(data);
        if (t === 'ventas') this.ventas.set(data);
        if (t === 'platos') this.platos.set(data?.data || []);
        if (t === 'rentabilidad') this.rentabilidad.set(data);
        if (t === 'mermas') this.mermas.set(data);
        if (t === 'ocupacion') this.ocupacion.set(data);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo cargar el reporte.')),
    });
  }

  cargarCola(page: number) {
    this.colaLoading.set(true);
    const raw = this.filtros.getRawValue();
    this.service.cola(page, 10, { id_sucursal: raw.id_sucursal, estado: raw.estado })
      .pipe(finalize(() => this.colaLoading.set(false)))
      .subscribe({
        next: (res) => {
          const pack = this.unwrapObject(res);
          const data = Array.isArray(pack?.data) ? pack.data : this.unwrapArray(res);
          this.cola.set(data);
          this.colaMeta.set({
            total: Number(pack?.meta?.total || data.length || 0),
            page: Number(pack?.meta?.page || page),
            limit: Number(pack?.meta?.limit || 10),
          });
        },
        error: (e) => this.alert.error(this.msgError(e, 'No se pudo cargar la cola.')),
      });
  }

  exportar(fmt: 'excel' | 'pdf') {
    const tipo = this.tab();
    if (tipo === 'impresion') return;
    const req = fmt === 'excel' ? this.service.excel(tipo, this.query()) : this.service.pdf(tipo, this.query());
    req.subscribe({
      next: (blob) => this.bajar(blob, `reporte-${tipo}.${fmt === 'excel' ? 'xlsx' : 'pdf'}`),
      error: () => this.alert.error('No se pudo exportar.'),
    });
  }

  reintentar(row: any) {
    this.service.reintentar(row.id_cola).subscribe({
      next: () => {
        this.alert.success('Ticket regenerado.');
        this.cargarCola(this.colaMeta().page);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo reintentar.')),
    });
  }

  marcarImpreso(row: any) {
    this.service.marcarImpreso(row.id_cola).subscribe({
      next: () => {
        this.alert.success('Marcado como impreso.');
        this.cargarCola(this.colaMeta().page);
      },
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo marcar.')),
    });
  }

  descargarBin(row: any) {
    this.service.escpos(row.id_cola).subscribe({
      next: (blob) => this.bajar(blob, `ticket-${row.id_cola}.bin`),
      error: () => this.alert.error('No se pudo descargar el ESC/POS.'),
    });
  }

  private query() {
    const raw = this.filtros.getRawValue();
    return {
      id_sucursal: raw.id_sucursal,
      fecha_desde: raw.fecha_desde,
      fecha_hasta: raw.fecha_hasta,
    };
  }

  private hoy() {
    return this.iso(new Date());
  }

  private haceDias(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return this.iso(d);
  }

  private iso(d: Date) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private bajar(blob: Blob, nombre: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private unwrapObject(res: any): any {
    if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
    return res;
  }

  private msgError(e: any, fallback: string) {
    return e?.error?.mensaje || e?.error?.message || fallback;
  }
}
