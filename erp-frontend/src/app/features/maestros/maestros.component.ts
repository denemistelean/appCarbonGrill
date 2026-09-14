import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { NumberFieldComponent } from 'src/app/shared/components/number-field/number-field.component';
import { CategoriasService, PorcionesService, UnidadesService } from './maestros.service';

@Component({
  selector: 'app-maestros',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent, ErpTabsComponent, NumberFieldComponent],
  templateUrl: './maestros.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaestrosComponent {
  private fb = inject(FormBuilder);
  public perms = inject(PermissionsService);

  public crudUnidades = useCrud<any>(inject(UnidadesService) as any, { itemName: 'Unidad' });
  public crudCategorias = useCrud<any>(inject(CategoriasService) as any, { itemName: 'Categoría' });
  public crudPorciones = useCrud<any>(inject(PorcionesService) as any, { itemName: 'Porción' });

  tab = signal<'unidades' | 'categorias' | 'porciones'>('unidades');
  tabs: ErpTab[] = [
    { id: 'unidades', label: 'Unidades', icon: 'bi-rulers' },
    { id: 'categorias', label: 'Categorías', icon: 'bi-tags' },
    { id: 'porciones', label: 'Porciones', icon: 'bi-plus-square' },
  ];
  estacionesPorcion = [
    { codigo: 'TODAS', etiqueta: 'Todas (salvo bar)' },
    { codigo: 'PARRILLA', etiqueta: 'Parrilla' },
    { codigo: 'COCINA', etiqueta: 'Cocina' },
  ];

  formUnidad: FormGroup = this.fb.group({
    codigo: ['', [Validators.required, Validators.maxLength(10)]],
    nombre: ['', [Validators.required, Validators.maxLength(50)]],
  });

  formCategoria: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    orden: [0, [Validators.required, Validators.min(0)]],
  });

  formPorcion: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(80)]],
    precio: [0, [Validators.required, Validators.min(0)]],
    aplica_estacion: ['TODAS', Validators.required],
    orden: [0, [Validators.required, Validators.min(0)]],
  });

  onTab(id: string) {
    this.tab.set(id as 'unidades' | 'categorias' | 'porciones');
  }

  abrirUnidad(modal: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crudUnidades.setupModal(item?.id_unidad_medida || null);
    this.formUnidad.reset({ codigo: item?.codigo || '', nombre: item?.nombre || '' });
    this.crudUnidades.openModal(modal, { centered: true, backdrop: 'static' });
  }

  guardarUnidad() {
    if (this.formUnidad.invalid) {
      this.formUnidad.markAllAsTouched();
      return;
    }
    this.crudUnidades.save(this.formUnidad.value);
  }

  abrirCategoria(modal: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crudCategorias.setupModal(item?.id_categoria || null);
    this.formCategoria.reset({ nombre: item?.nombre || '', orden: item?.orden ?? 0 });
    this.crudCategorias.openModal(modal, { centered: true, backdrop: 'static' });
  }

  guardarCategoria() {
    if (this.formCategoria.invalid) {
      this.formCategoria.markAllAsTouched();
      return;
    }
    this.crudCategorias.save(this.formCategoria.value);
  }

  abrirPorcion(modal: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crudPorciones.setupModal(item?.id_porcion || null);
    this.formPorcion.reset({
      nombre: item?.nombre || '',
      precio: item?.precio ?? 0,
      aplica_estacion: item?.aplica_estacion || 'TODAS',
      orden: item?.orden ?? 0,
    });
    this.crudPorciones.openModal(modal, { centered: true, backdrop: 'static' });
  }

  guardarPorcion() {
    if (this.formPorcion.invalid) {
      this.formPorcion.markAllAsTouched();
      return;
    }
    this.crudPorciones.save(this.formPorcion.getRawValue());
  }
}
