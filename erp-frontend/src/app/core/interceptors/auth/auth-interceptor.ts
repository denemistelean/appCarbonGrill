import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../../services/auth.service'; // 🔥 CORRECCIÓN: Usamos ../../ para salir de interceptors/auth/

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Usamos la inyección moderna para llamar al servicio
  const authService = inject(AuthService);
  
  // 2. Recuperar token usando el método centralizado
  const token = authService.getToken();

  // 3. Si existe, clonar la petición e inyectar el header
  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  // 4. Si no hay token, pasar normal
  return next(req);
};