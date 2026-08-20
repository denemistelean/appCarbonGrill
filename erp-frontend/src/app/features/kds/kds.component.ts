import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { interval } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PedidosService } from '../comandero/pedidos.service';
import { KdsSocketService } from './kds-socket.service';

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgSelectModule],
  templateUrl: './kds.component.html',
  styleUrls: ['./kds.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KdsComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private service = inject(PedidosService);
  private alert = inject(AlertService);
  private destroyRef = inject(DestroyRef);
  private kdsSocket = inject(KdsSocketService);
  public perms = inject(PermissionsService);

  sucursales = signal<any[]>([]);
  items = signal<any[]>([]);
  loading = signal(false);
  enVivo = signal(false);
  ahora = signal(Date.now());
  sucursalBloqueada = signal(false);
  estaciones = [
    { codigo: 'PARRILLA', etiqueta: 'Parrilla' },
    { codigo: 'COCINA', etiqueta: 'Cocina' },
    { codigo: 'BAR', etiqueta: 'Bar' },
  ];

  pendientes = computed(() => this.items().filter((i) => i.estado_preparacion === 'PENDIENTE'));
  enPrep = computed(() => this.items().filter((i) => i.estado_preparacion === 'EN_PREPARACION'));
  listos = computed(() => this.items().filter((i) => i.estado_preparacion === 'LISTO'));
  columnas = computed(() => [
    { estado: 'PENDIENTE', titulo: 'Pendiente', items: this.pendientes() },
    { estado: 'EN_PREPARACION', titulo: 'En preparación', items: this.enPrep() },
    { estado: 'LISTO', titulo: 'Listo', items: this.listos() },
  ]);

  filtros = this.fb.group({
    id_sucursal: [null as number | null],
    estacion: [null as string | null],
  });

  ngOnInit() {
    this.service.cocinaContexto().subscribe({
      next: (res) => {
        const sucursales = this.unwrapArray(res);
        this.sucursales.set(sucursales);
        if (sucursales.length === 1) {
          this.sucursalBloqueada.set(true);
          this.filtros.patchValue({ id_sucursal: sucursales[0].id_sucursal });
          this.filtros.get('id_sucursal')?.disable({ emitEvent: false });
        }
        this.cargar();
      },
      error: () => this.cargar(),
    });

    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.ahora.set(Date.now());
    });

    interval(8000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.enVivo.set(this.kdsSocket.conectado());
      this.cargar(true);
    });
  }

  ngOnDestroy() {
    this.kdsSocket.desconectar();
  }

  cargar(silencio = false) {
    const raw = this.filtros.getRawValue();
    const id = Number(raw.id_sucursal) || undefined;
    if (!id && this.sucursales().length > 1) {
      this.items.set([]);
      return;
    }
    if (id) this.kdsSocket.conectar(id, () => this.cargar(true));
    this.enVivo.set(this.kdsSocket.conectado());
    if (!silencio) this.loading.set(true);
    this.service.cocina(id, raw.estacion || undefined)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => this.items.set(this.unwrapArray(res)),
        error: (e) => {
          if (!silencio) this.alert.error(this.msgError(e, 'No se pudo cargar la estación.'));
        },
      });
  }

  avanzar(item: any) {
    const next = item.estado_preparacion === 'PENDIENTE' ? 'EN_PREPARACION'
      : item.estado_preparacion === 'EN_PREPARACION' ? 'LISTO' : null;
    if (!next) return;
    this.service.cambiarPreparacion(item.id_pedido, item.id_pedido_item, next).subscribe({
      next: () => this.cargar(true),
      error: (e) => this.alert.error(this.msgError(e, 'No se pudo actualizar el ítem.')),
    });
  }

  tiempoEnCocina(item: any) {
    const base = item?.fecha_confirma || item?.fecha_pedido;
    if (!base) return '—';
    const ms = Math.max(0, this.ahora() - new Date(base).getTime());
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  etiquetaPrep(estado: string) {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_PREPARACION: 'En preparación',
      LISTO: 'Listo',
    };
    return map[estado] || estado;
  }

  private unwrapArray(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  private msgError(e: any, fallback: string) {
    const m = e?.error?.mensaje || e?.error?.message;
    return Array.isArray(m) ? m[0] : (m || fallback);
  }
}
