import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CartaVitrinaHttpService } from './carta-vitrina.service';

@Component({
  selector: 'app-carta-vitrina-publica',
  standalone: true,
  imports: [CommonModule, DecimalPipe, FormsModule],
  templateUrl: './carta-vitrina-publica.component.html',
  styleUrls: ['./carta-vitrina-publica.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartaVitrinaPublicaComponent implements OnInit {
  private service = inject(CartaVitrinaHttpService);

  loading = signal(true);
  error = signal<string | null>(null);
  config = signal<any>({ nombre: '', tagline: '', promo: '', moneda: 'S/' });
  categorias = signal<any[]>([]);
  sabores = signal<string[]>([]);
  chorizos = signal<string[]>([]);
  items = signal<any[]>([]);
  categoria = signal('all');
  busqueda = signal('');
  foto = signal<any | null>(null);
  menuAbierto = signal(false);

  ngOnInit() {
    this.service.publica().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const wrap = res?.data ?? res ?? {};
        const data = Array.isArray(wrap) ? { productos: wrap } : wrap;
        this.config.set(data.config || {});
        this.categorias.set(Array.isArray(data.categorias) ? data.categorias : []);
        this.sabores.set(Array.isArray(data.sabores) ? data.sabores : []);
        this.chorizos.set(Array.isArray(data.chorizos) ? data.chorizos : []);
        const productos = data.productos ?? data.items ?? [];
        this.items.set(Array.isArray(productos) ? productos : []);
      },
      error: () => this.error.set('No se pudo cargar la carta. Intente de nuevo en unos minutos.'),
    });
  }

  toggleMenu() {
    this.menuAbierto.update(v => !v);
  }

  setCategoria(id: string) {
    this.categoria.set(id);
    this.menuAbierto.set(false);
  }

  iconoCategoria() {
    const cat = this.categorias().find(c => c.codigo === this.categoria());
    return cat?.icono || '🌟';
  }

  nombreCategoria() {
    const cat = this.categorias().find(c => c.codigo === this.categoria());
    return cat?.nombre || 'Toda la Carta';
  }

  visibles() {
    const q = this.busqueda().toLowerCase().trim();
    const cat = this.categoria();
    return this.items().filter((i) => {
      const matchCat = cat === 'all' || i.categoria === cat;
      const matchQ = !q || String(i.nombre).toLowerCase().includes(q) || String(i.descripcion || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }

  categoriasConItems() {
    const vis = this.visibles();
    return this.categorias().filter((c) => vis.some((i) => i.categoria === c.codigo));
  }

  itemsDe(codigo: string) {
    return this.visibles().filter((i) => i.categoria === codigo);
  }

  mostrarSabores() {
    const cat = this.categoria();
    return this.sabores().length && (cat === 'all' || cat === 'alitas_boneless');
  }

  mostrarChorizos() {
    const cat = this.categoria();
    return this.chorizos().length && (cat === 'all' || cat === 'parrilla_especial' || cat === 'parrillas_compartir');
  }

  urlFoto(item: any) {
    const img = String(item?.imagen || '').trim();
    if (!img) return '';
    if (img.startsWith('http') || img.startsWith('data:')) return img;
    return `${environment.uploadsUrl}${img.replace(/^\/+/, '')}`;
  }

  abrirFoto(item: any) {
    if (!this.urlFoto(item)) return;
    this.foto.set(item);
  }

  cerrarFoto() {
    this.foto.set(null);
  }
}
