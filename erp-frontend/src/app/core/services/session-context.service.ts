import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SessionContext {
  es_superadmin: boolean;
  id_sucursal: number | null;
  sucursal_nombre: string | null;
  nombre_marca: string;
  logo_url: string | null;
  sucursal: {
    id_sucursal: number;
    codigo: string;
    nombre: string;
    nombre_comercial: string;
    logo_path: string | null;
    logo_url: string | null;
    ruc: string | null;
    razon_social: string | null;
    direccion: string | null;
    telefono: string | null;
    tipo: string;
  } | null;
  usuario: {
    id_usuario: number;
    nombres: string;
    apellidos: string;
    correo: string;
    id_rol: number;
    nombre_rol: string;
  };
}

@Injectable({ providedIn: 'root' })
export class SessionContextService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrlGestion;

  readonly context = signal<SessionContext | null>(null);
  readonly loaded = signal(false);

  nombreMarca(): string {
    return this.context()?.nombre_marca || 'Portal de gestión';
  }

  logoUrl(): string | null {
    return this.context()?.logo_url || null;
  }

  esSuperadmin(): boolean {
    return !!this.context()?.es_superadmin;
  }

  idSucursal(): number | null {
    return this.context()?.id_sucursal ?? null;
  }

  nombreRol(): string {
    return String(this.context()?.usuario?.nombre_rol || '').toUpperCase();
  }

  /** Roles operativos de piso: UI compacta tipo tablet. */
  esTabletOperativo(): boolean {
    return ['MOZO', 'COCINA', 'BAR'].includes(this.nombreRol());
  }

  rutaInicio(): string {
    const rol = this.nombreRol();
    if (rol === 'MOZO') return '/salon';
    if (rol === 'COCINA' || rol === 'BAR') return '/kds';
    if (rol === 'CAJA') return '/caja';
    return '/dashboard';
  }

  async load(): Promise<SessionContext | null> {
    try {
      const res: any = await firstValueFrom(this.http.get(`${this.apiUrl}/auth/contexto`));
      const data = res?.data ?? res;
      this.context.set(data);
      this.loaded.set(true);
      return data;
    } catch {
      this.loaded.set(true);
      return null;
    }
  }

  clear(): void {
    this.context.set(null);
    this.loaded.set(false);
  }
}
