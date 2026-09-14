import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
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
export class CartaVitrinaPublicaComponent implements OnInit, OnDestroy {
  private service = inject(CartaVitrinaHttpService);
  private route = inject(ActivatedRoute);
  private title = inject(Title);

  private faviconOriginal = '';
  private titleOriginal = '';

  loading = signal(true);
  error = signal<string | null>(null);
  sucursal = signal<any | null>(null);
  config = signal<any>({ nombre: '', tagline: '', promo: '', moneda: 'S/', tema: 'carbon_grill' });
  categorias = signal<any[]>([]);
  sabores = signal<string[]>([]);
  chorizos = signal<string[]>([]);
  items = signal<any[]>([]);
  categoria = signal('all');
  busqueda = signal('');
  foto = signal<any | null>(null);
  menuAbierto = signal(false);

  esDonPapas() {
    return String(this.config()?.tema || '') === 'don_papas'
      || String(this.sucursal()?.codigo || '').toUpperCase() === 'DONOBAS'
      || String(this.sucursal()?.codigo || '').toUpperCase() === 'LOC-1RO';
  }

  ngOnInit() {
    this.titleOriginal = this.title.getTitle();
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    this.faviconOriginal = link?.href || '';

    const raw = this.route.snapshot.queryParamMap.get('id_sucursal');
    const idSucursal = raw ? Number(raw) : undefined;
    this.service.publica(idSucursal).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        const wrap = res?.data ?? res ?? {};
        const data = Array.isArray(wrap) ? { productos: wrap } : wrap;
        this.sucursal.set(data.sucursal || null);
        this.config.set(data.config || {});
        this.categorias.set(Array.isArray(data.categorias) ? data.categorias : []);
        this.sabores.set(Array.isArray(data.sabores) ? data.sabores : []);
        this.chorizos.set(Array.isArray(data.chorizos) ? data.chorizos : []);
        const productos = data.productos ?? data.items ?? [];
        this.items.set(Array.isArray(productos) ? productos : []);
        this.aplicarBrandingPagina();
      },
      error: () => this.error.set('No se pudo cargar la carta. Intente de nuevo en unos minutos.'),
    });
  }

  ngOnDestroy() {
    if (this.titleOriginal) this.title.setTitle(this.titleOriginal);
    if (this.faviconOriginal) this.setFavicon(this.faviconOriginal);
  }

  /** Título e icono del navegador según el local/marca de la carta. */
  private aplicarBrandingPagina() {
    const nombre =
      this.config()?.nombre ||
      this.sucursal()?.nombre_comercial ||
      this.sucursal()?.nombre ||
      'Carta';
    this.title.setTitle(nombre);

    const logo = String(this.sucursal()?.logo_url || '').trim();
    if (logo) {
      this.setFavicon(logo.startsWith('http') || logo.startsWith('/') ? logo : `/${logo.replace(/^\/+/, '')}`);
      return;
    }
    // Fallback por tema si aún no hay logo subido
    if (this.esDonPapas()) {
      this.setFavicon('/assets/img/favicon-don-papas.svg');
    }
  }

  private setFavicon(href: string) {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    const lower = href.toLowerCase();
    link.type = lower.endsWith('.svg')
      ? 'image/svg+xml'
      : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/x-icon';
    // cache-bust para forzar cambio al navegar entre marcas
    link.href = href.includes('?') ? href : `${href}?v=${Date.now()}`;
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
    if (!this.sabores().length) return false;
    const cat = this.categoria();
    if (this.esDonPapas()) {
      return cat === 'all' || cat === 'dp_alitas' || cat === 'dp_boneless';
    }
    return cat === 'all' || cat === 'alitas_boneless';
  }

  mostrarChorizos() {
    if (this.esDonPapas()) return false;
    const cat = this.categoria();
    return this.chorizos().length && (cat === 'all' || cat === 'parrilla_especial' || cat === 'parrillas_compartir');
  }

  tieneJunior(item: any) {
    const j = Number(item?.precio_junior);
    return Number.isFinite(j) && j > 0;
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
