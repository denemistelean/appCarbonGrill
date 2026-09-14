import { Component, OnInit, TemplateRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterModule } from '@angular/router';
import { NgbDropdownModule, NgbModal, NgbModalModule, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Sidebar } from '../sidebar/sidebar';
import { SettingsPanel } from '../settings-panel/settings-panel';
import { ToastComponent } from '../../components/toast/toast';
import { LayoutService } from '../../services/layout.service';
import { PermissionsService } from '../../services/seguridad/permissions.service';
import { AuthService } from '../../services/auth.service';
import { SessionContextService } from '../../services/session-context.service';
import { AlertService } from '../../services/ui/alert.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    NgbModalModule,
    NgbDropdownModule,
    Sidebar,
    SettingsPanel,
    ToastComponent,
  ],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.scss'],
})
export class AdminLayout implements OnInit {
  public layoutService = inject(LayoutService);
  private permissionsService = inject(PermissionsService);
  private auth = inject(AuthService);
  sessionContext = inject(SessionContextService);
  private modal = inject(NgbModal);
  private alert = inject(AlertService);
  private fb = inject(FormBuilder);

  usuarioLabel = '';

  get esTablet(): boolean {
    return this.sessionContext.esTabletOperativo();
  }

  claveForm = this.fb.group({
    clave_actual: ['', Validators.required],
    clave_nueva: ['', [Validators.required, Validators.minLength(6)]],
    clave_nueva2: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}');
      this.usuarioLabel = [u.nombres, u.apellidos].filter(Boolean).join(' ') || u.correo || 'Usuario';
    } catch {
      this.usuarioLabel = 'Usuario';
    }

    this.layoutService.showLoader();

    if (this.permissionsService.permissionsSignal().length > 0) {
      this.sessionContext.load().finally(() => this.layoutService.hideLoader());
      return;
    }

    this.permissionsService.loadPermissions().subscribe({
      next: () => {
        this.sessionContext.load().finally(() => this.layoutService.hideLoader());
      },
      error: () => this.layoutService.hideLoader(),
    });
  }

  abrirCambiarClave(tpl: TemplateRef<any>) {
    this.claveForm.reset();
    this.modal.open(tpl, { centered: true, backdrop: 'static' });
  }

  guardarClave(modal: NgbModalRef) {
    if (this.claveForm.invalid) {
      this.claveForm.markAllAsTouched();
      return;
    }
    const raw = this.claveForm.getRawValue();
    if (raw.clave_nueva !== raw.clave_nueva2) {
      this.alert.warning('La confirmación de clave no coincide.');
      return;
    }
    this.alert.showLoading('Actualizando clave...');
    this.auth.cambiarClave(String(raw.clave_actual), String(raw.clave_nueva)).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Clave actualizada.');
        modal.close();
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(e.error?.mensaje || e.error?.message || 'No se pudo cambiar la clave.');
      },
    });
  }

  cerrarSesion() {
    this.auth.logout();
  }
}
