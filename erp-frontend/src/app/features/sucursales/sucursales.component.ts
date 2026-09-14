import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { SucursalesService } from './sucursales.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, NgSelectModule, TableProComponent, FormErrorComponent],
  templateUrl: './sucursales.component.html',
  styleUrl: './sucursales.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SucursalesComponent {
  private fb = inject(FormBuilder);
  private baseService = inject(SucursalesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  logoPreview = signal<string | null>(null);
  logoFile = signal<File | null>(null);
  uploadsUrl = environment.uploadsUrl;

  filtroTipo = signal<'TODOS' | 'LOCAL' | 'ALMACEN'>('TODOS');

  filtrosTipo = [
    { id: 'TODOS' as const, label: 'TODOS', icon: 'bi-grid-3x3-gap', clase: 'filtro-todos' },
    { id: 'LOCAL' as const, label: 'LOCALES', icon: 'bi-shop', clase: 'filtro-local' },
    { id: 'ALMACEN' as const, label: 'ALMACENES', icon: 'bi-box-seam', clase: 'filtro-almacen' },
  ];

  public crud = useCrud<any>({
    findAll: (page, limit, search) => this.baseService.findAll(page, limit, search, this.filtroTipo()),
    create: (data) => this.baseService.create(data),
    update: (id, data) => this.baseService.update(id, data),
    delete: (id) => this.baseService.delete(id),
  }, { itemName: 'Sucursal' });

  tipos = [
    { id: 'LOCAL', nombre: 'LOCAL DE ATENCIÓN' },
    { id: 'ALMACEN', nombre: 'ALMACÉN (no es un local)' },
  ];

  form: FormGroup = this.fb.group({
    codigo: ['', [Validators.required, Validators.maxLength(20)]],
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    tipo: ['LOCAL', Validators.required],
    direccion: ['', Validators.maxLength(255)],
    telefono: ['', Validators.maxLength(30)],
    codigo_establecimiento_sunat: ['', Validators.maxLength(4)],
    ruc: ['', Validators.maxLength(11)],
    razon_social: ['', Validators.maxLength(200)],
    nombre_comercial: ['', Validators.maxLength(150)],
    ubigeo: ['', Validators.maxLength(6)],
    departamento: ['', Validators.maxLength(50)],
    provincia: ['', Validators.maxLength(50)],
    distrito: ['', Validators.maxLength(50)],
    direccion_fiscal: ['', Validators.maxLength(255)],
    nubefact_url: ['', Validators.maxLength(255)],
    nubefact_token: ['', Validators.maxLength(255)],
  });

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  setFiltroTipo(tipo: 'TODOS' | 'LOCAL' | 'ALMACEN') {
    this.filtroTipo.set(tipo);
    this.crud.refresh();
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    this.crud.setupModal(item?.id_sucursal || null);
    this.form.reset({ tipo: 'LOCAL' });
    this.logoPreview.set(null);
    this.logoFile.set(null);

    if (item) {
      this.baseService.findOne(item.id_sucursal).subscribe({
        next: (res) => {
          const data = res?.data || res;
          this.form.patchValue({
            codigo: data.codigo,
            nombre: data.nombre,
            tipo: data.tipo || 'LOCAL',
            direccion: data.direccion,
            telefono: data.telefono,
            codigo_establecimiento_sunat: data.codigo_establecimiento_sunat,
            ruc: data.ruc,
            razon_social: data.razon_social,
            nombre_comercial: data.nombre_comercial,
            ubigeo: data.ubigeo,
            departamento: data.departamento,
            provincia: data.provincia,
            distrito: data.distrito,
            direccion_fiscal: data.direccion_fiscal,
            nubefact_url: data.nubefact_url,
            nubefact_token: data.nubefact_token,
          });
          if (data.logo_path) {
            this.logoPreview.set(`${this.uploadsUrl}${data.logo_path}`);
          }
        },
        error: () => this.form.patchValue(item),
      });
    }

    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.logoFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  quitarLogo() {
    const id = this.crud.editingId();
    if (id) {
      this.baseService.removeLogo(id).subscribe({
        next: () => {
          this.logoPreview.set(null);
          this.logoFile.set(null);
          this.alert.toast('Logo eliminado', 'success');
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo eliminar el logo'),
      });
      return;
    }
    this.logoPreview.set(null);
    this.logoFile.set(null);
  }

  private subirLogoSiCorresponde(id: number) {
    const file = this.logoFile();
    if (!file) return;
    this.baseService.uploadLogo(id, file).subscribe({
      next: () => this.crud.refresh(),
      error: (e) => this.alert.warning(e.error?.mensaje || 'Sucursal guardada, pero falló el logo'),
    });
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = { ...this.form.value };
    const editingId = this.crud.editingId();
    const obs = editingId
      ? this.baseService.update(editingId, payload)
      : this.baseService.create(payload);

    obs.subscribe({
      next: (res: any) => {
        const data = res?.data ?? res;
        const id = editingId || data?.id_sucursal;
        if (id) this.subirLogoSiCorresponde(Number(id));
        this.crud.refresh();
        this.crud.closeModal();
        this.alert.toast(editingId ? 'Sucursal actualizada' : 'Sucursal creada', 'success');
      },
      error: (e) => this.alert.error(e.error?.mensaje || e.error?.message || 'No se pudo guardar'),
    });
  }
}
