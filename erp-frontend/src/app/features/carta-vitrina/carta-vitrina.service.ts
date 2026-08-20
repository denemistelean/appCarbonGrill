import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CartaVitrinaHttpService {
  private http = inject(HttpClient);
  private publicaUrl = `${environment.apiUrlGestion}/carta-vitrina`;
  private adminUrl = `${environment.apiUrlGestion}/carta-visual`;

  publica(idSucursal?: number): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(this.publicaUrl, { params });
  }

  admin(): Observable<any> {
    return this.http.get(this.adminUrl);
  }

  guardarConfig(data: any): Observable<any> {
    return this.http.put(`${this.adminUrl}/config`, data);
  }

  crearTag(data: any): Observable<any> {
    return this.http.post(`${this.adminUrl}/tags`, data);
  }

  eliminarTag(id: number): Observable<any> {
    return this.http.delete(`${this.adminUrl}/tags/${id}`);
  }

  guardarProducto(data: any): Observable<any> {
    return this.http.post(`${this.adminUrl}/productos`, data);
  }

  toggleDisponible(id: number): Observable<any> {
    return this.http.patch(`${this.adminUrl}/productos/${id}/disponible`, {});
  }

  quitarProducto(id: number): Observable<any> {
    return this.http.delete(`${this.adminUrl}/productos/${id}`);
  }

  restaurarProducto(id: number): Observable<any> {
    return this.http.patch(`${this.adminUrl}/productos/${id}/visible`, {});
  }

  subirImagen(id: number, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.adminUrl}/productos/${id}/imagen`, fd);
  }

  quitarImagen(id: number): Observable<any> {
    return this.http.delete(`${this.adminUrl}/productos/${id}/imagen`);
  }
}
