import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { CategoriasService } from '../maestros/maestros.service';
import { InsumosService } from '../insumos/insumos.service';
import { SucursalesService } from '../sucursales/sucursales.service';
import { NumberFieldComponent } from 'src/app/shared/components/number-field/number-field.component';
import { ProductosService } from './productos.service';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent, NumberFieldComponent],
  templateUrl: './productos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ProductosService);
  private categoriasService = inject(CategoriasService);
  private insumosService = inject(InsumosService);
  private sucursalesService = inject(SucursalesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Producto' });

  categorias = signal<any[]>([]);
  insumos = signal<any[]>([]);
  platos = signal<any[]>([]);
  sucursalesCatalogo = signal<any[]>([]);
  esComboView = signal(false);

  readonly tipos = [
    { id: '0', nombre: 'PLATO / BEBIDA' },
    { id: '1', nombre: 'COMBO' },
  ];
  readonly estaciones = [
    { id: 'PARRILLA', nombre: 'PARRILLA' },
    { id: 'COCINA', nombre: 'COCINA' },
    { id: 'BAR', nombre: 'BAR' },
    { id: 'NINGUNA', nombre: 'NINGUNA (combo)' },
  ];

  form: FormGroup = this.fb.group({
    codigo: ['', [Validators.required, Validators.maxLength(30)]],
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
    id_categoria: [null, Validators.required],
    precio: [0, [Validators.required, Validators.min(0)]],
    es_combo: ['0', Validators.required],
    estacion: ['COCINA', Validators.required],
    descripcion: ['', Validators.maxLength(255)],
    receta: this.fb.array([]),
    combo_items: this.fb.array([]),
    sucursales: this.fb.array([]),
  });

  get receta(): FormArray {
    return this.form.get('receta') as FormArray;
  }
  get comboItems(): FormArray {
    return this.form.get('combo_items') as FormArray;
  }
  get sucursales(): FormArray {
    return this.form.get('sucursales') as FormArray;
  }
  get esCombo(): boolean {
    return this.esComboView();
  }

  ngOnInit() {
    this.categoriasService.lista().subscribe({ next: (res) => this.categorias.set(this.unwrap(res)) });
    this.insumosService.lista().subscribe({
      next: (res) => this.insumos.set(this.unwrap(res)),
      error: () => this.alert.error('No se pudo cargar la lista de insumos para la receta.'),
    });
    this.service.lista(0).subscribe({ next: (res) => this.platos.set(this.unwrap(res)) });
    this.sucursalesService.lista().subscribe({ next: (res) => this.sucursalesCatalogo.set(this.unwrap(res)) });
    this.form.get('es_combo')?.valueChanges.subscribe((v) => this.esComboView.set(String(v) === '1'));
  }

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  agregarLineaReceta() {
    this.receta.push(this.fb.group({
      id_insumo: [null, Validators.required],
      cantidad: [1, [Validators.required, Validators.min(0.0001)]],
    }));
  }

  quitarLineaReceta(i: number) {
    this.receta.removeAt(i);
  }

  agregarLineaCombo() {
    this.comboItems.push(this.fb.group({
      id_producto: [null, Validators.required],
      cantidad: [1, [Validators.required, Validators.min(0.001)]],
    }));
  }

  quitarLineaCombo(i: number) {
    this.comboItems.removeAt(i);
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    if (item) {
      this.alert.showLoading('Cargando producto...');
      this.service.findOne(item.id_producto).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.llenarFormulario(data);
          this.crud.setupModal(data.id_producto);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
        },
        error: () => {
          this.alert.closeLoading();
          this.alert.error('No se pudo cargar el producto.');
        },
      });
      return;
    }

    this.crud.setupModal(null);
    this.llenarFormulario(null);
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const esCombo = Number(raw.es_combo) === 1;
    this.crud.save({
      codigo: raw.codigo,
      nombre: raw.nombre,
      id_categoria: Number(raw.id_categoria),
      precio: Number(raw.precio),
      es_combo: esCombo ? 1 : 0,
      estacion: raw.estacion,
      descripcion: raw.descripcion || null,
      receta: esCombo ? [] : raw.receta
        .filter((l: any) => l.id_insumo)
        .map((l: any) => ({
          id_insumo: Number(l.id_insumo),
          cantidad: Number(l.cantidad),
        })),
      combo_items: esCombo ? raw.combo_items
        .filter((l: any) => l.id_producto)
        .map((l: any) => ({
          id_producto: Number(l.id_producto),
          cantidad: Number(l.cantidad),
        })) : [],
      sucursales: raw.sucursales.map((s: any) => ({
        id_sucursal: Number(s.id_sucursal),
        disponible: s.disponible ? 1 : 0,
        precio_override: s.precio_override === '' || s.precio_override === null || s.precio_override === undefined
          ? null
          : Number(s.precio_override),
      })),
    });
  }

  private llenarFormulario(data: any | null) {
    this.receta.clear();
    this.comboItems.clear();
    this.sucursales.clear();

    this.form.patchValue({
      codigo: data?.codigo || '',
      nombre: data?.nombre || '',
      id_categoria: data?.id_categoria || null,
      precio: data?.precio ?? 0,
      es_combo: Number(data?.es_combo) ? '1' : '0',
      estacion: data?.estacion || 'COCINA',
      descripcion: data?.descripcion || '',
    });
    this.esComboView.set(Number(data?.es_combo) === 1);

    for (const linea of data?.receta || []) {
      this.receta.push(this.fb.group({
        id_insumo: [linea.id_insumo, Validators.required],
        cantidad: [Number(linea.cantidad), [Validators.required, Validators.min(0.0001)]],
      }));
    }
    for (const linea of data?.combo_items || []) {
      this.comboItems.push(this.fb.group({
        id_producto: [linea.id_producto, Validators.required],
        cantidad: [Number(linea.cantidad), [Validators.required, Validators.min(0.001)]],
      }));
    }

    const sucursales = data?.sucursales?.length ? data.sucursales : this.sucursalesCatalogo();
    for (const s of sucursales) {
      this.sucursales.push(this.fb.group({
        id_sucursal: [s.id_sucursal, Validators.required],
        nombre: [{ value: s.nombre || s.codigo, disabled: true }],
        disponible: [Number(s.disponible ?? 1) === 1],
        precio_override: [s.precio_override ?? null],
      }));
    }
  }

  private unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }
}
