import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { PermissionsService } from '../services/seguridad/permissions.service';

@Directive({
  selector: '[appShowIf]',
  standalone: true
})
export class ShowIfDirective {
  private templateRef = inject(TemplateRef);
  private viewContainer = inject(ViewContainerRef);
  private permissionsService = inject(PermissionsService);

  private permissionCode = '';

  constructor() {
    // ✨ MAGIA DE ANGULAR 21: EFFECT
    // Esto hace que la directiva "reaccione" automáticamente cuando 
    // el servicio de permisos actualice su lista (Signal).
    effect(() => {
      // Al llamar a hasPermission dentro de un effect, Angular crea la dependencia.
      // Si los permisos cambian, este código se ejecuta de nuevo.
      this.updateView();
    });
  }

  @Input() set appShowIf(val: string) {
    this.permissionCode = val;
    // También actualizamos si cambia el código del input
    this.updateView(); 
  }

  private updateView() {
    // Limpiamos siempre primero para evitar duplicados
    this.viewContainer.clear();

    if (this.permissionsService.hasPermission(this.permissionCode)) {
      // ✅ Si tiene permiso (ya sea al inicio o 1 segundo después), mostramos.
      this.viewContainer.createEmbeddedView(this.templateRef);
    }
  }
}