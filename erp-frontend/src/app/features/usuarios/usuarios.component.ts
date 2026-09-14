import { Component, inject, OnInit, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { UsuariosService } from './usuarios.service';
import { PermisosService as SeguridadService } from '../permisos/permisos.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './usuarios.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsuariosComponent implements OnInit {
  private fb               = inject(FormBuilder);
  private service          = inject(UsuariosService);
  private seguridadService = inject(SeguridadService);
  private alert            = inject(AlertService);
  public  perms            = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Usuario' });

  form: FormGroup;
  roles = signal<any[]>([]);

  constructor() {
    this.form = this.fb.group({
      nombres:   ['', Validators.required],
      apellidos: ['', Validators.required],
      correo:    ['', [Validators.required, Validators.minLength(3)]],
      password:  ['', [Validators.required, Validators.minLength(6)]],
      id_rol:    [null, Validators.required],
    });
  }

  ngOnInit() {
    this.seguridadService.getRoles().subscribe({
      next: (res: any) => this.roles.set(res.data?.data || res.data || []),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    if (item) {
      this.alert.showLoading('Cargando usuario...');
      this.service.findOne(item.id_usuario).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;

          this.crud.setupModal(data.id_usuario);

          this.form.patchValue({
            nombres:   data.nombres,
            apellidos: data.apellidos,
            correo:    data.correo,
            id_rol:    data.id_rol,
          });

          this.form.get('password')?.clearValidators();
          this.form.get('password')?.updateValueAndValidity();

          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => {
          this.alert.closeLoading();
          this.alert.error('No se pudo cargar el usuario.');
        },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset();

      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
      this.form.get('password')?.updateValueAndValidity();

      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.crud.save(this.form.getRawValue());
  }
}
