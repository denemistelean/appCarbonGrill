import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class SalonService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/mesas`;

  catalogos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/estados`);
  }

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  mapa(idSucursal: number, zona?: string): Observable<any> {
    let params = new HttpParams().set('id_sucursal', String(idSucursal));
    if (zona) params = params.set('zona', zona);
    return this.http.get(`${this.apiUrl}/mapa`, { params });
  }

  lista(idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/lista`, { params: new HttpParams().set('id_sucursal', String(idSucursal)) });
  }

  findAll(page: number, limit: number, filters: any = {}): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    const search = typeof filters === 'string' ? filters : filters?.search;
    if (search) params = params.set('search', String(search));
    if (filters?.id_sucursal) params = params.set('id_sucursal', String(filters.id_sucursal));
    return this.http.get(this.apiUrl, { params });
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

  cambiarEstado(id: number, estado: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/estado`, { estado });
  }

  actualizarPosiciones(idSucursal: number, items: any[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/posiciones`, { id_sucursal: idSucursal, items });
  }

  unir(idPrincipal: number, secundarias: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/unir`, { id_mesa_principal: idPrincipal, id_mesas_secundarias: secundarias });
  }

  separar(idMesa: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/separar`, { id_mesa: idMesa });
  }

  uniones(page: number, limit: number, idSucursal?: number): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(`${this.apiUrl}/uniones`, { params });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  qrMesa(idMesa: number): Observable<any> {
    return this.http.get(`${environment.apiUrlGestion}/carta/mesas/${idMesa}/qr`);
  }

  abrirSesionQr(idMesa: number): Observable<any> {
    return this.http.post(`${environment.apiUrlGestion}/carta/sesiones/abrir`, { id_mesa: idMesa });
  }

  cerrarSesionQr(idMesa: number): Observable<any> {
    return this.http.post(`${environment.apiUrlGestion}/carta/sesiones/${idMesa}/cerrar`, {});
  }

  llamados(idSucursal?: number): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(`${environment.apiUrlGestion}/carta/llamados`, { params });
  }

  atenderLlamado(id: number): Observable<any> {
    return this.http.post(`${environment.apiUrlGestion}/carta/llamados/${id}/atender`, {});
  }
}
