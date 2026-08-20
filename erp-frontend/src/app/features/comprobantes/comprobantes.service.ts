import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ComprobantesHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/comprobantes`;

  catalogos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/catalogos`);
  }

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  series(filters: { id_sucursal?: number | null; tipo?: string | null } = {}): Observable<any> {
    let params = new HttpParams();
    if (filters.id_sucursal) params = params.set('id_sucursal', String(filters.id_sucursal));
    if (filters.tipo) params = params.set('tipo', String(filters.tipo));
    return this.http.get(`${this.apiUrl}/series`, { params });
  }

  crearSerie(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/series`, data);
  }

  previewCuenta(idCuenta: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/cuenta/${idCuenta}/preview`);
  }

  listar(page: number, limit: number, filters: any = {}): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http.get(this.apiUrl, { params });
  }

  detalle(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  emitir(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/emitir`, data);
  }

  notaCredito(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/nota-credito`, data);
  }

  anular(id: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/anular`, data);
  }

  reenviar(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/reenviar`, {});
  }

  reenviarLote(idSucursal?: number | null): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.post(`${this.apiUrl}/reintentar-lote`, {}, { params });
  }

  pdf(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/pdf`, { responseType: 'blob' });
  }

  ticket(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/ticket`, { responseType: 'blob' });
  }

  xml(id: number, tipo: 'xml' | 'cdr' = 'xml'): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/xml`, {
      params: new HttpParams().set('tipo', tipo),
      responseType: 'blob',
    });
  }
}
