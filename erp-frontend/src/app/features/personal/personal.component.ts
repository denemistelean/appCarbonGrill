import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { SucursalesService } from '../sucursales/sucursales.service';
import { PersonalService } from './personal.service';

@Component({
  selector: 'app-personal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent, DatePipe],
  templateUrl: './personal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PersonalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PersonalService);
  private sucursalesService = inject(SucursalesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Asignación' });

  sucursales = signal<any[]>([]);
  roles = signal<any[]>([]);
  historial = signal<any[]>([]);
  trabajadorSeleccionado = signal<any>(null);

  form: FormGroup = this.fb.group({
    id_usuario: [null, Validators.required],
    id_sucursal: [null, Validators.required],
    id_rol: [null, Validators.required],
  });

  ngOnInit() {
    this.sucursalesService.lista().subscribe({
      next: (res: any) => this.sucursales.set(this.unwrapList(res)),
    });
    this.service.rolesOperativos().subscribe({
      next: (res: any) => this.roles.set(this.unwrapList(res)),
    });
  }

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  abrirAsignar(modalTemplate: TemplateRef<any>, item: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item.id_usuario === 1 || item.rol === 'SUPERADMIN') {
      this.alert.error('El administrador corporativo no se reasigna por sucursal.');
      return;
    }

    this.crud.setupModal(null);
    this.trabajadorSeleccionado.set(item);
    this.form.reset({
      id_usuario: item.id_usuario,
      id_sucursal: item.id_sucursal || null,
      id_rol: item.id_rol,
    });
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.crud.save(this.form.getRawValue());
  }

  abrirHistorial(modalTemplate: TemplateRef<any>, item: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.trabajadorSeleccionado.set(item);
    this.historial.set([]);
    this.alert.showLoading('Cargando historial...');
    this.service.historial(item.id_usuario).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        this.historial.set(this.unwrapList(res));
        this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
      },
      error: () => {
        this.alert.closeLoading();
        this.alert.error('No se pudo cargar el historial.');
      },
    });
  }

  private unwrapList(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }
}
