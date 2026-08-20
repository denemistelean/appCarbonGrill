import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/inventario`;

  stock(page: number, limit: number, filters: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}/stock`, { params: this.buildParams(page, limit, filters) });
  }

  actualizarMinimo(data: { id_insumo: number; id_sucursal: number; stock_minimo: number }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/stock/minimo`, data);
  }

  insumos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/insumos`);
  }

  sucursales(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sucursales`);
  }

  motivosMerma(): Observable<any> {
    return this.http.get(`${this.apiUrl}/motivos-merma`);
  }

  lotes(idInsumo: number, idSucursal: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/lotes`, {
      params: new HttpParams().set('id_insumo', String(idInsumo)).set('id_sucursal', String(idSucursal)),
    });
  }

  kardex(page: number, limit: number, filters: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}/kardex`, { params: this.buildParams(page, limit, filters) });
  }

  registrarMovimiento(tipo: 'ingreso' | 'salida' | 'ajuste', data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/movimientos/${tipo}`, data);
  }

  ingresoLote(data: { id_sucursal: number; motivo?: string; detalle?: string; items: any[] }): Observable<any> {
    return this.http.post(`${this.apiUrl}/movimientos/ingreso-lote`, data);
  }

  mermas(page: number, limit: number, filters: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}/mermas`, { params: this.buildParams(page, limit, filters) });
  }

  mermasResumen(filters: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}/mermas/resumen`, { params: this.buildParams(undefined, undefined, filters) });
  }

  crearMerma(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/mermas`, data);
  }

  private buildParams(page?: number, limit?: number, filters: any = {}) {
    let params = new HttpParams();
    if (page != null) params = params.set('page', String(page));
    if (limit != null) params = params.set('limit', String(limit));
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
