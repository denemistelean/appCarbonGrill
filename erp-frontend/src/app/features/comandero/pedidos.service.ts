import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/pedidos`;

  catalogos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/estados`);
  }

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  mesas(idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/mesas`, { params: new HttpParams().set('id_sucursal', String(idSucursal)) });
  }

  carta(idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/carta`, { params: new HttpParams().set('id_sucursal', String(idSucursal)) });
  }

  insumosMod(): Observable<any> {
    return this.http.get(`${this.apiUrl}/insumos-mod`);
  }

  porciones(estacion?: string): Observable<any> {
    let params = new HttpParams();
    if (estacion) params = params.set('estacion', estacion);
    return this.http.get(`${this.apiUrl}/porciones`, { params });
  }

  activo(idMesa: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/activo`, { params: new HttpParams().set('id_mesa', String(idMesa)) });
  }

  cocinaContexto(): Observable<any> {
    return this.http.get(`${this.apiUrl}/cocina-contexto`);
  }

  cocina(idSucursal?: number, estacion?: string): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    if (estacion) params = params.set('estacion', estacion);
    return this.http.get(`${this.apiUrl}/cocina`, { params });
  }

  findAll(page: number, limit: number, filters: any = {}): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get(this.apiUrl, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  crear(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  actualizar(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  confirmar(id: number, totalEsperado: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/confirmar`, { total_esperado: totalEsperado });
  }

  anular(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/anular`, {});
  }

  cambiarPreparacion(idPedido: number, idItem: number, estado: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${idPedido}/items/${idItem}/preparacion`, { estado_preparacion: estado });
  }
}
