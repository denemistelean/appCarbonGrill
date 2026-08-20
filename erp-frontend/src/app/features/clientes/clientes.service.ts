import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/clientes`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (search) params = params.set('search', search);
    return this.http.get(this.apiUrl, { params });
  }

  lista(search?: string): Observable<any> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/lista`, { params });
  }

  identity(tipo: string, numero: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/identity/${tipo}/${numero}`);
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
