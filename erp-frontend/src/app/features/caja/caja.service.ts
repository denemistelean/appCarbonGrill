import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CajaHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/caja`;

  catalogos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/catalogos`);
  }

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  turnoActual(idSucursal?: number): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(`${this.apiUrl}/turno-actual`, { params });
  }

  turnos(page: number, limit: number, idSucursal?: number): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(`${this.apiUrl}/turnos`, { params });
  }

  turno(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/turnos/${id}`);
  }

  abrir(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/turnos/abrir`, data);
  }

  cerrar(id: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/turnos/${id}/cerrar`, data);
  }

  pendientes(idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/pendientes`, {
      params: new HttpParams().set('id_sucursal', String(idSucursal)),
    });
  }

  cuenta(idPedido: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/cuentas/${idPedido}`);
  }

  precuenta(idPedido: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/cuentas/${idPedido}/precuenta`, { responseType: 'blob' });
  }

  pedirCuenta(idPedido: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/pedir-cuenta`, { id_pedido: idPedido });
  }

  cobrar(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/cobrar`, data);
  }
}
