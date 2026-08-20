import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class PersonalService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/personal`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(this.apiUrl, { params });
  }

  rolesOperativos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/roles-operativos`);
  }

  historial(idUsuario: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${idUsuario}/historial`);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(_id: number, data: any): Observable<any> {
    return this.create(data);
  }

  delete(_id: number): Observable<any> {
    return this.http.post(this.apiUrl, {});
  }
}
