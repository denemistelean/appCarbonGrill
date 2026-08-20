import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/productos`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(this.apiUrl, { params });
  }

  lista(esCombo?: number): Observable<any> {
    let params = new HttpParams();
    if (esCombo === 0) params = params.set('es_combo', '0');
    return this.http.get(`${this.apiUrl}/lista`, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
