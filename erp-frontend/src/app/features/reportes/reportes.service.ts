import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportesHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/reportes`;

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  ventas(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/ventas`, { params: this.params(filters) });
  }

  consolidado(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/consolidado`, { params: this.params(filters) });
  }

  platos(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/platos`, { params: this.params(filters) });
  }

  rentabilidad(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/rentabilidad`, { params: this.params(filters) });
  }

  mermas(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/mermas`, { params: this.params(filters) });
  }

  ocupacion(filters: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/ocupacion`, { params: this.params(filters) });
  }

  excel(tipo: string, filters: any): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/excel`, {
      params: this.params({ ...filters, tipo }),
      responseType: 'blob',
    });
  }

  pdf(tipo: string, filters: any): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/pdf`, {
      params: this.params({ ...filters, tipo }),
      responseType: 'blob',
    });
  }

  cola(page: number, limit: number, filters: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}/impresion`, {
      params: this.params({ ...filters, page, limit }),
    });
  }

  encolar(data: { tipo: string; id_referencia: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/impresion`, data);
  }

  reintentar(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/impresion/${id}/reintentar`, {});
  }

  marcarImpreso(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/impresion/${id}/marcar-impreso`, {});
  }

  marcarError(id: number, mensaje: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/impresion/${id}/error`, { mensaje });
  }

  escpos(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/impresion/${id}/escpos`, { responseType: 'blob' });
  }

  private params(filters: any) {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
