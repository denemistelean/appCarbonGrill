import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from 'src/app/core/services/auth.service';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class KdsSocketService {
  private socket: Socket | null = null;
  private joinedSucursal: number | null = null;
  private onTicket: (() => void) | null = null;

  constructor(private auth: AuthService) {}

  conectar(idSucursal: number, onTicket: () => void) {
    this.onTicket = onTicket;
    const token = this.auth.getToken();
    if (!token || !idSucursal) return;

    if (!this.socket) {
      this.socket = io(environment.wsUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
      });
      this.socket.on('ticket_actualizado', () => this.onTicket?.());
      this.socket.on('connect', () => {
        if (this.joinedSucursal) this.socket?.emit('join', { id_sucursal: this.joinedSucursal });
      });
    }

    this.joinedSucursal = idSucursal;
    if (this.socket.connected) {
      this.socket.emit('join', { id_sucursal: idSucursal });
    }
  }

  conectado(): boolean {
    return !!this.socket?.connected;
  }

  desconectar() {
    this.onTicket = null;
    this.joinedSucursal = null;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
