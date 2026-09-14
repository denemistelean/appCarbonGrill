import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PermissionsService } from './seguridad/permissions.service'; // 🔥 Importamos el servicio de permisos
import { SessionContextService } from './session-context.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private permsService = inject(PermissionsService); // 🔥 Lo inyectamos aquí
  private sessionContext = inject(SessionContextService);
  
  // Apunta a tu backend
  private apiUrl = environment.apiUrlGestion; 

  constructor() {}

  // ==========================================================
  // 🔐 LOGIN REAL (CERO SIMULACIONES)
  // ==========================================================
  login(credentials: any): Observable<any> {
    // Aquí hacemos la petición POST real.
    return this.http.post<any>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap(response => {
        // Solo para depurar, vemos qué responde el servidor real
        console.log('📡 Respuesta del Servidor:', response);

        // 🔥 FIX VITAL: Guardamos la respuesta en el almacenamiento del navegador
        // Recordar que NestJS envuelve la respuesta en "data"
        if (response && response.success && response.data?.usuario) {
          localStorage.setItem('token', response.data.access_token);
          localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
          console.log('✅ Usuario guardado con rol:', response.data.usuario.nombre_rol);
          this.sessionContext.load();
        }
      })
    );
  }

  // ==========================================================
  // 🛠️ UTILIDADES
  // ==========================================================
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.permsService.clear(); // 🔥 Limpiamos los permisos en el Signal (Memoria)
    this.sessionContext.clear();
    window.location.replace('/auth/login'); // replace() no añade entrada al historial
  }

  getContexto(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/contexto`);
  }

  cambiarClave(clave_actual: string, clave_nueva: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/cambiar-clave`, { clave_actual, clave_nueva });
  }
  
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}