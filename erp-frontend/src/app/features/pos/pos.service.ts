import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class PosHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/pos`;

  tipos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/tipos`);
  }

  productos(idSucursal: number, search?: string): Observable<any> {
    let params = new HttpParams().set('id_sucursal', String(idSucursal));
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/productos`, { params });
  }

  identity(tipo: string, numero: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/identity/${tipo}/${numero}`);
  }

  vender(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/ventas`, data);
  }

  emitirCuenta(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/emitir-cuenta`, data);
  }

  pdfInterno(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/documentos/${id}/pdf`, { responseType: 'blob' });
  }
}
