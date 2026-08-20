import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router'; // 🔥 Importamos Router
import { PermissionsService } from '../services/seguridad/permissions.service';
import { AlertService } from '../services/ui/alert.service';

export const permissionGuard: CanActivateFn = (route, state) => {
  const permsService = inject(PermissionsService);
  const alert = inject(AlertService);
  const router = inject(Router); // 🔥 Inyectamos Router

  const requiredPermission = route.data['permiso'];

  // 💡 LOGS DE DEBUG: Te dirán la verdad en la consola del navegador
  console.log('👉 Permiso que exige esta ruta:', requiredPermission);
  console.log('📦 Permisos que tiene el usuario en memoria:', permsService.permissionsSignal());

  // Validamos si la ruta no exige permiso o si el usuario lo tiene
  if (!requiredPermission || permsService.hasPermission(requiredPermission)) {
    return true; // ✅ Pasa
  }

  // ⛔ Bloqueado
  alert.error('No tienes permisos suficientes para entrar a este módulo.');
  router.navigate(['/dashboard']);
  return false; 
};