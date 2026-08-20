import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CartaPublicaHttpService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/carta-publica`;

  contexto(token: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${encodeURIComponent(token)}`);
  }

  enviarPedido(token: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${encodeURIComponent(token)}/pedido`, data);
  }

  llamar(token: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${encodeURIComponent(token)}/llamar`, data);
  }
}
