import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AlertService } from '../services/ui/alert.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const alert = inject(AlertService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      
      if (req.url.includes('carta-publica') || req.url.includes('carta-vitrina')) {
        return throwError(() => error);
      }

      // El login responde 401 con credenciales inválidas: no es sesión expirada.
      if (error.status === 401 && req.url.includes('/auth/login')) {
        return throwError(() => error);
      }

      if (error.status === 401) {
        localStorage.removeItem('token');
        router.navigate(['/auth/login']);
        alert.toast('Tu sesión ha expirado', 'warning');
      } 
      else if (error.status === 403) {
        // 🔥 AQUÍ ESTÁ EL FIX: Si el backend rechaza, lo pateamos de la pantalla
        router.navigate(['/dashboard']);
        alert.error('No tienes permisos suficientes para ver este módulo o realizar esta acción.');
      }

      return throwError(() => error);
    })
  );
};