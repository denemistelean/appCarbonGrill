import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { NumberFieldComponent } from 'src/app/shared/components/number-field/number-field.component';
import { InsumosService } from './insumos.service';

@Component({
  selector: 'app-insumos',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent, NumberFieldComponent],
  templateUrl: './insumos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InsumosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(InsumosService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Insumo' });
  unidades = signal<any[]>([]);

  form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    id_unidad_medida: [null, Validators.required],
    precio_costo: [0, [Validators.required, Validators.min(0)]],
    precio_venta: [0, [Validators.min(0)]],
  });

  ngOnInit() {
    this.service.unidades().subscribe({
      next: (res: any) => this.unidades.set(this.unwrap(res)),
    });
  }

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crud.setupModal(item?.id_insumo || null);
    this.form.reset({
      nombre: item?.nombre || '',
      id_unidad_medida: item?.id_unidad_medida || null,
      precio_costo: item?.costo_unitario ?? 0,
      precio_venta: item?.precio_venta ?? 0,
    });
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.crud.save({
      nombre: raw.nombre,
      id_unidad_medida: Number(raw.id_unidad_medida),
      costo_unitario: Number(raw.precio_costo),
      precio_venta: Number(raw.precio_venta ?? 0),
    });
  }

  private unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }
}
