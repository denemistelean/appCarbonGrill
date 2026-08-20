import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ClientesService } from './clientes.service';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent],
  templateUrl: './clientes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientesComponent {
  private fb = inject(FormBuilder);
  private service = inject(ClientesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Cliente' });
  consultando = signal(false);

  tipos = [
    { id: 'DNI', nombre: 'DNI' },
    { id: 'RUC', nombre: 'RUC' },
    { id: 'CE', nombre: 'Carné extranjería' },
    { id: 'PAS', nombre: 'Pasaporte' },
    { id: 'OTRO', nombre: 'Otro' },
  ];

  form: FormGroup = this.fb.group({
    tipo_documento: ['DNI', Validators.required],
    numero_documento: ['', Validators.required],
    razon_social: ['', Validators.required],
    nombres: [''],
    direccion: [''],
    telefono: [''],
    correo: [''],
  });

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.crud.setupModal(item?.id_cliente || null);
    this.form.reset({ tipo_documento: 'DNI' });
    if (item) this.form.patchValue(item);
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  consultarSunat() {
    const tipo = String(this.form.getRawValue().tipo_documento || '');
    const numero = String(this.form.getRawValue().numero_documento || '').replace(/\D/g, '');
    if (tipo !== 'DNI' && tipo !== 'RUC') {
      this.alert.toast('La consulta SUNAT solo aplica a DNI o RUC.', 'warning');
      return;
    }
    this.consultando.set(true);
    this.service.identity(tipo, numero).subscribe({
      next: (res) => {
        this.consultando.set(false);
        const data = res?.data || res;
        this.form.patchValue({
          razon_social: data.razon_social || data.nombre_comercial || '',
          nombres: data.nombres || '',
          direccion: data.direccion || this.form.getRawValue().direccion,
        });
        this.alert.success('Datos obtenidos de SUNAT.');
      },
      error: (e) => {
        this.consultando.set(false);
        this.alert.error(e?.error?.mensaje || e?.error?.message || 'No se pudo consultar SUNAT.');
      },
    });
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.crud.save(this.form.value);
  }
}
