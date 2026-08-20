import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class TrasladosHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/traslados`;

  catalogos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/catalogos`);
  }

  lista(page: number, limit: number, filters: any = {}): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get(this.apiUrl, { params });
  }

  detalle(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  stockOrigen(idInsumo: number, idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/stock-origen`, {
      params: new HttpParams().set('id_insumo', String(idInsumo)).set('id_sucursal', String(idSucursal)),
    });
  }

  crear(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  aprobar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/aprobar`, {});
  }

  rechazar(id: number, motivo?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/rechazar`, { motivo });
  }

  despachar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/despachar`, {});
  }

  recibir(id: number, items: any[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/recibir`, { items });
  }

  cancelar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/cancelar`, {});
  }
}
