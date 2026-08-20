import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrlGestion;

  // ⚠️ CAMBIO CRÍTICO: Debe ser PUBLIC para que el Sidebar pueda reaccionar a él
  public permissionsSignal = signal<string[]>([]);

  constructor() {}

  loadPermissions() {
    return this.http.get<any>(`${this.apiUrl}/seguridad/permisos`).pipe(
      tap(response => {
        // 🔥 FIX: Extracción profunda (Deep Extract)
        // Buscamos el arreglo 'permisos' en cualquier nivel de anidación 'data'
        let lista = [];
        
        if (Array.isArray(response)) {
          lista = response;
        } else if (response.data?.data?.permisos) {
          lista = response.data.data.permisos;
        } else if (response.data?.permisos) {
          lista = response.data.permisos;
        } else if (response.permisos) {
          lista = response.permisos;
        }

        if (Array.isArray(lista) && lista.length > 0) {
          console.log('✅ Permisos cargados (Signal):', lista.length);
          this.permissionsSignal.set(lista);
        } else {
          console.warn('⚠️ No se encontraron permisos válidos en la respuesta:', response);
          this.permissionsSignal.set([]);
        }
      })
    );
  }

  hasPermission(code: string): boolean {
    const perms = this.permissionsSignal();
    return perms.includes(code);
  }

  clear() {
    this.permissionsSignal.set([]);
  }
}