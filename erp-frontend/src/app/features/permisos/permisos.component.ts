import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { PermisosService } from './permisos.service';
import { LayoutService } from 'src/app/core/services/layout.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
// Importamos el servicio global de permisos para actualizar el Sidebar reactivamente
import { PermissionsService as GlobalPermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';

@Component({
  selector: 'app-permisos',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgSelectModule, NgbModalModule, FormErrorComponent],
  templateUrl: './permisos.component.html'
})
export class PermisosComponent implements OnInit {
  private permisosService = inject(PermisosService);
  private globalPerms = inject(GlobalPermissionsService); // Inyectamos el servicio global
  private layout = inject(LayoutService);
  private alert = inject(AlertService);
  private fb = inject(FormBuilder);
  private modal = inject(NgbModal);
  public perms = inject(PermissionsService);

  roles = signal<any[]>([]);
  modulos = signal<any[]>([]);

  // Rol seleccionado
  rolSeleccionado = signal<number | null>(null);
  /** Modelo de ng-select (bindValue = id_rol) */
  rolSelectModel: number | null = null;

  // Array donde guardamos los IDs de las acciones marcadas
  accionesMarcadas = signal<number[]>([]);

  // Gestión de roles (crear/editar)
  modalRolRef: any = null;
  editingRolId = signal<number | null>(null);
  private pendingSelectRolNombre: string | null = null;
  formRol: FormGroup = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: ['']
  });

  ngOnInit() {
    this.cargarDatosBase();
  }

  puedeCrearRol() {
    return this.perms.hasPermission('ver_seguridad') || this.perms.hasPermission('crear_seguridad');
  }

  puedeActualizarRol() {
    return this.perms.hasPermission('ver_seguridad') || this.perms.hasPermission('actualizar_seguridad');
  }

  puedeEliminarRol() {
    return this.perms.hasPermission('ver_seguridad') || this.perms.hasPermission('eliminar_seguridad');
  }

  esRolAdmin() {
    return Number(this.rolSeleccionado()) === 1;
  }

  cargarDatosBase(selectIdRol?: number | null) {
    this.layout.showLoader();

    this.permisosService.getRoles().subscribe({
      next: (res) => {
        const listaRoles = res.data?.data || res.data || [];
        this.roles.set(listaRoles);

        let idToSelect = selectIdRol ?? null;
        if (!idToSelect && this.pendingSelectRolNombre) {
          const creado = listaRoles.find(
            (r: any) => String(r.nombre || '').toUpperCase() === this.pendingSelectRolNombre
          );
          idToSelect = creado?.id_rol ?? null;
          this.pendingSelectRolNombre = null;
        }
        if (idToSelect) {
          this.seleccionarRol(idToSelect);
        }
      },
      error: () => this.roles.set([])
    });

    this.permisosService.getMatriz().subscribe({
      next: (res) => {
        const listaModulos = res.data?.data || res.data || [];
        this.modulos.set(listaModulos);
        this.layout.hideLoader();
      },
      error: () => {
        this.modulos.set([]);
        this.layout.hideLoader();
      }
    });
  }

  seleccionarRol(idRol: number) {
    this.rolSelectModel = idRol;
    const rol = this.roles().find((r) => Number(r.id_rol) === Number(idRol));
    this.onRolChange(rol || { id_rol: idRol });
  }

  onRolChange(event: any) {
    const idRol = event ? event.id_rol : null;
    this.rolSeleccionado.set(idRol);
    this.rolSelectModel = idRol;

    if (!idRol) {
      this.accionesMarcadas.set([]);
      return;
    }

    this.layout.showLoader();
    this.permisosService.getPermisosRol(idRol).subscribe({
      next: (res) => {
        const ids = res.data?.data || res.data || [];
        this.accionesMarcadas.set(ids);
        this.layout.hideLoader();
      },
      error: () => {
        this.accionesMarcadas.set([]);
        this.layout.hideLoader();
      }
    });
  }

  moduloCompletoMarcado(modulo: any): boolean {
    const ids = (modulo.acciones || []).map((a: any) => a.id_accion);
    return ids.length > 0 && ids.every((id: number) => this.isMarcado(id));
  }

  toggleModuloCompleto(modulo: any) {
    const ids = (modulo.acciones || []).map((a: any) => Number(a.id_accion));
    const marcar = !this.moduloCompletoMarcado(modulo);
    let actuales = [...this.accionesMarcadas()];
    if (marcar) {
      for (const id of ids) {
        if (!actuales.includes(id)) actuales.push(id);
      }
    } else {
      actuales = actuales.filter((id) => !ids.includes(id));
    }
    this.accionesMarcadas.set(actuales);
  }

  toggleAccion(idAccion: number, isChecked: boolean) {
    const actuales = [...this.accionesMarcadas()];
    if (isChecked) {
      actuales.push(idAccion);
    } else {
      const index = actuales.indexOf(idAccion);
      if (index > -1) actuales.splice(index, 1);
    }
    this.accionesMarcadas.set(actuales);
  }

  isMarcado(idAccion: number): boolean {
    return this.accionesMarcadas().includes(idAccion);
  }

  rolActual(): any {
    return this.roles().find(r => r.id_rol === this.rolSeleccionado()) || null;
  }

  abrirModalRol(content: any, rol: any = null) {
    this.editingRolId.set(rol?.id_rol ?? null);
    this.formRol.reset();
    if (rol) {
      this.formRol.patchValue({ nombre: rol.nombre, descripcion: rol.descripcion });
    }
    this.modalRolRef = this.modal.open(content, { centered: true, backdrop: 'static' });
  }

  guardarRol() {
    if (this.formRol.invalid) { this.formRol.markAllAsTouched(); return; }

    const data = this.formRol.getRawValue();
    const editId = this.editingRolId();

    this.layout.showLoader();
    const obs = editId ? this.permisosService.updateRol(editId, data) : this.permisosService.createRol(data);

    obs.subscribe({
      next: () => {
        this.layout.hideLoader();
        this.alert.success(
          editId
            ? 'Rol actualizado correctamente'
            : 'Rol creado. Ahora asigne permisos por módulo y guarde la matriz.'
        );
        this.modalRolRef?.close();
        if (!editId) {
          this.pendingSelectRolNombre = String(data.nombre || '').trim().toUpperCase();
        }
        this.cargarDatosBase(editId || undefined);
      },
      error: (err) => {
        this.layout.hideLoader();
        this.alert.error(err.error?.mensaje || err.error?.message || 'No se pudo guardar el rol');
      }
    });
  }

  async eliminarRol(rol: any) {
    if (!await this.alert.confirmDelete('¿Eliminar rol?', `Se eliminará el rol "${rol.nombre}".`)) return;

    this.layout.showLoader();
    this.permisosService.deleteRol(rol.id_rol).subscribe({
      next: () => {
        this.layout.hideLoader();
        this.alert.success('Rol eliminado correctamente');
        if (this.rolSeleccionado() === rol.id_rol) {
          this.rolSeleccionado.set(null);
          this.accionesMarcadas.set([]);
        }
        this.cargarDatosBase();
      },
      error: () => this.layout.hideLoader()
    });
  }

  guardarMatriz() {
    if (!this.rolSeleccionado()) return;
    
    this.layout.showLoader();
    this.permisosService.savePermisos(this.rolSeleccionado()!, this.accionesMarcadas()).subscribe({
      next: (res) => {
        this.layout.hideLoader();
        this.alert.success(res.message);
        
        const user = JSON.parse(localStorage.getItem('usuario') || '{}');
        if (user.id_rol === this.rolSeleccionado()) {
            // 🔥 MAGIA REACTIVA: Actualizamos el menú sin recargar la página
            this.globalPerms.loadPermissions().subscribe();
        }
      },
      error: (err) => {
        this.layout.hideLoader();
        this.alert.error('Error al guardar los permisos');
      }
    });
  }
}