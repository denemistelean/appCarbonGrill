import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CartaVitrinaHttpService {
  private http = inject(HttpClient);
  private publicaUrl = `${environment.apiUrlGestion}/carta-vitrina`;
  private adminUrl = `${environment.apiUrlGestion}/carta-visual`;

  private paramsSucursal(idSucursal?: number | null): HttpParams {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return params;
  }

  publica(idSucursal?: number): Observable<any> {
    return this.http.get(this.publicaUrl, { params: this.paramsSucursal(idSucursal) });
  }

  admin(idSucursal?: number | null): Observable<any> {
    return this.http.get(this.adminUrl, { params: this.paramsSucursal(idSucursal) });
  }

  guardarConfig(data: any, idSucursal?: number | null): Observable<any> {
    return this.http.put(`${this.adminUrl}/config`, data, { params: this.paramsSucursal(idSucursal) });
  }

  crearTag(data: any, idSucursal?: number | null): Observable<any> {
    return this.http.post(`${this.adminUrl}/tags`, data, { params: this.paramsSucursal(idSucursal) });
  }

  eliminarTag(id: number, idSucursal?: number | null): Observable<any> {
    return this.http.delete(`${this.adminUrl}/tags/${id}`, { params: this.paramsSucursal(idSucursal) });
  }

  guardarProducto(data: any, idSucursal?: number | null): Observable<any> {
    return this.http.post(`${this.adminUrl}/productos`, data, { params: this.paramsSucursal(idSucursal) });
  }

  toggleDisponible(id: number, idSucursal?: number | null): Observable<any> {
    return this.http.patch(`${this.adminUrl}/productos/${id}/disponible`, {}, { params: this.paramsSucursal(idSucursal) });
  }

  quitarProducto(id: number, idSucursal?: number | null): Observable<any> {
    return this.http.delete(`${this.adminUrl}/productos/${id}`, { params: this.paramsSucursal(idSucursal) });
  }

  restaurarProducto(id: number, idSucursal?: number | null): Observable<any> {
    return this.http.patch(`${this.adminUrl}/productos/${id}/visible`, {}, { params: this.paramsSucursal(idSucursal) });
  }

  subirImagen(id: number, file: File, idSucursal?: number | null): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.adminUrl}/productos/${id}/imagen`, fd, { params: this.paramsSucursal(idSucursal) });
  }

  quitarImagen(id: number, idSucursal?: number | null): Observable<any> {
    return this.http.delete(`${this.adminUrl}/productos/${id}/imagen`, { params: this.paramsSucursal(idSucursal) });
  }
}
