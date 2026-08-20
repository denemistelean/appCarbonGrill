import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';

import { AlertService } from 'src/app/core/services/ui/alert.service';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private service = inject(DashboardService);
  private alert = inject(AlertService);

  loading = signal(true);
  indicadores = signal<any>({});

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.service
      .getResumen()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: any) => {
          const data = res?.data ?? res ?? {};
          this.indicadores.set(data.indicadores || data.totales || {});
        },
        error: (err) => this.alert.error(err?.error?.message || 'No se pudo cargar el dashboard'),
      });
  }
}
