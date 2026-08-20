import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Server, Socket } from 'socket.io';

export const KDS_TICKET_EVENT = 'kds.ticket';

export type KdsTicketPayload = {
  id_sucursal: number;
  id_pedido: number;
  id_item?: number;
};

@WebSocketGateway({
  namespace: '/kds',
  cors: { origin: true, credentials: true },
})
@Injectable()
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(KdsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        client.handshake.auth?.token ||
        String(client.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!raw) throw new Error('sin token');
      const payload = await this.jwtService.verifyAsync(raw);
      const idUsuario = Number(payload.sub);
      const idRol = Number(payload.roleId);
      if (!idUsuario || !idRol) throw new Error('payload');
      client.data.user = { idUsuario, correo: String(payload.username || ''), idRol };
    } catch {
      this.logger.warn(`KDS rechazó socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { id_sucursal?: number },
  ) {
    const user = client.data?.user;
    if (!user) {
      client.disconnect(true);
      return { ok: false };
    }

    const [perm] = await this.dataSource.query(
      `SELECT COUNT(*) AS n
       FROM sis_permiso p
       INNER JOIN sis_accion a ON a.id_accion = p.id_accion
       WHERE p.id_rol = ? AND a.codigo_accion IN ('ver_cocina', 'ver_kds')`,
      [user.idRol],
    );
    if (Number(perm?.n || 0) === 0) return { ok: false, error: 'Sin permiso KDS' };

    const [rol] = await this.dataSource.query(`SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`, [user.idRol]);
    const esSuperadmin = String(rol?.nombre || '') === 'SUPERADMIN';
    let idSucursal = Number(body?.id_sucursal || 0);

    if (!esSuperadmin) {
      const [asig] = await this.dataSource.query(
        `SELECT a.id_sucursal FROM sucursal_asignacion a
         INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
         WHERE a.id_usuario = ? AND a.estado_registro = 'ACTIVO' AND a.vigente_hasta IS NULL
           AND s.estado_registro = 'ACTIVO'
         ORDER BY a.id_asignacion DESC LIMIT 1`,
        [user.idUsuario],
      );
      const asignada = Number(asig?.id_sucursal || 0);
      if (!asignada) return { ok: false, error: 'Sin sucursal' };
      if (idSucursal && idSucursal !== asignada) return { ok: false, error: 'Sucursal no permitida' };
      idSucursal = asignada;
    }

    if (!idSucursal) return { ok: false, error: 'Debe indicar sucursal' };

    for (const room of [...client.rooms]) {
      if (room.startsWith('sucursal:')) client.leave(room);
    }
    await client.join(`sucursal:${idSucursal}`);
    return { ok: true, id_sucursal: idSucursal };
  }

  @OnEvent(KDS_TICKET_EVENT)
  notificar(payload: KdsTicketPayload) {
    if (!this.server || !payload?.id_sucursal) return;
    this.server.to(`sucursal:${payload.id_sucursal}`).emit('ticket_actualizado', payload);
  }
}
