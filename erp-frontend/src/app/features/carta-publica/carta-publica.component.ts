import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { finalize } from 'rxjs/operators';

import { AlertService } from 'src/app/core/services/ui/alert.service';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { CartaPublicaHttpService } from './carta-publica.service';

type Linea = { id_producto: number; nombre: string; precio: number; cantidad: number; notas: string };

@Component({
  selector: 'app-carta-publica',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgSelectModule, FormErrorComponent],
  templateUrl: './carta-publica.component.html',
  styleUrls: ['./carta-publica.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartaPublicaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(CartaPublicaHttpService);
  private alert = inject(AlertService);
  private fb = inject(FormBuilder);

  token = signal('');
  loading = signal(true);
  error = signal<string | null>(null);
  ctx = signal<any | null>(null);
  categoria = signal<string | null>(null);
  carrito = signal<Linea[]>([]);
  enviando = signal(false);

  motivos = [
    { codigo: 'AYUDA', etiqueta: 'Necesito ayuda' },
    { codigo: 'PEDIDO', etiqueta: 'Confirmar / ver pedido' },
    { codigo: 'CUENTA', etiqueta: 'Pedir la cuenta' },
    { codigo: 'OTRO', etiqueta: 'Otro' },
  ];

  llamarForm = this.fb.group({
    motivo: ['AYUDA', Validators.required],
    detalle: [''],
  });

  categorias = computed(() => {
    const seen = new Map<string, number>();
    for (const p of this.ctx()?.carta || []) {
      if (!seen.has(p.categoria)) seen.set(p.categoria, Number(p.categoria_orden || 0));
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  });

  cartaFiltrada = computed(() => {
    const cat = this.categoria();
    return (this.ctx()?.carta || []).filter((p: any) => !cat || p.categoria === cat);
  });

  total = computed(() =>
    this.round2(this.carrito().reduce((s, l) => s + l.precio * l.cantidad, 0)),
  );

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') || '';
    this.token.set(token);
    this.cargar();
  }

  cargar() {
    const token = this.token();
    if (!token) {
      this.error.set('QR incompleto.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.service.contexto(token).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const ctx = this.unwrapObject(res);
        this.ctx.set(ctx);
        this.error.set(null);
        if (ctx?.pedido?.items?.length && !this.carrito().length) {
          this.carrito.set(
            (ctx.pedido.items as any[])
              .filter((i) => !i.id_item_padre)
              .map((i) => ({
                id_producto: Number(i.id_producto),
                nombre: i.producto,
                precio: Number(i.precio_unitario),
                cantidad: Number(i.cantidad),
                notas: i.notas || '',
              })),
          );
        }
        if (!this.categoria() && this.categorias().length) this.categoria.set(this.categorias()[0]);
      },
      error: (e) => {
        this.ctx.set(null);
        this.error.set(this.msgError(e, 'No se pudo abrir la carta de esta mesa.'));
      },
    });
  }

  agregar(prod: any) {
    if (!this.ctx()?.puede_pedir) return;
    this.carrito.update((list) => {
      const i = list.findIndex((l) => l.id_producto === Number(prod.id_producto) && !l.notas);
      if (i >= 0) {
        const copy = [...list];
        copy[i] = { ...copy[i], cantidad: this.round2(copy[i].cantidad + 1) };
        return copy;
      }
      return [...list, {
        id_producto: Number(prod.id_producto),
        nombre: prod.nombre,
        precio: Number(prod.precio),
        cantidad: 1,
        notas: '',
      }];
    });
  }

  quitar(idx: number) {
    this.carrito.update((list) => list.filter((_, i) => i !== idx));
  }

  enviar() {
    if (!this.carrito().length) {
      this.alert.warning('Agregue al menos un plato.');
      return;
    }
    const payload = {
      total_esperado: this.total(),
      items: this.carrito().map((l) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
        notas: l.notas || undefined,
      })),
    };
    this.enviando.set(true);
    this.alert.showLoading('Enviando al mozo...');
    this.service.enviarPedido(this.token(), payload).pipe(finalize(() => this.enviando.set(false))).subscribe({
      next: (res) => {
        this.alert.closeLoading();
        const p = this.unwrapObject(res);
        this.alert.success('Pedido enviado. El mozo lo confirmará en cocina.');
        this.ctx.update((c) => ({ ...c, pedido: p, puede_pedir: p?.estado === 'PENDIENTE_CONFIRMACION' }));
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo enviar el pedido.'));
      },
    });
  }

  llamar() {
    if (this.llamarForm.invalid) return;
    const raw = this.llamarForm.getRawValue();
    this.alert.showLoading('Llamando al mozo...');
    this.service.llamar(this.token(), raw).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('El mozo fue notificado.');
        this.cargar();
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(this.msgError(e, 'No se pudo llamar al mozo.'));
      },
    });
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
