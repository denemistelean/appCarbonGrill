import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import * as QRCode from 'qrcode';
import { AlcanceService } from '../../common/auth/alcance.service';
import { RequestUser } from '../../common/auth/request-user.interface';
import { PedidosService } from '../pedidos/pedidos.service';
import { AbrirSesionDto, CartaPedidoDto, LlamarMozoDto } from './carta.dto';

const SESION_HORAS = 4;
const INACTIVIDAD_MIN = 45;

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

@Injectable()
export class CartaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly pedidosService: PedidosService,
    private readonly config: ConfigService,
    private readonly alcanceService: AlcanceService,
  ) {}

  async contextoPublico(token: string) {
    const ctx = await this.resolverToken(token, true);
    const carta = await this.pedidosService.cartaPorSucursal(ctx.mesa.id_sucursal);
    let pedido: any = null;
    if (ctx.sesion.id_pedido) {
      try {
        pedido = await this.pedidosService.findOne(Number(ctx.sesion.id_pedido), null);
      } catch {
        pedido = null;
      }
    }
    const llamados = await this.dataSource.query(
      `SELECT id_llamado, motivo, detalle, estado, fecha_llamado
       FROM llamado_mozo
       WHERE id_sesion = ? AND estado_registro = 'ACTIVO'
       ORDER BY id_llamado DESC LIMIT 5`,
      [ctx.sesion.id_sesion],
    );
    return {
      mesa: {
        id_mesa: ctx.mesa.id_mesa,
        numero: ctx.mesa.numero,
        zona: ctx.mesa.zona,
        estado: ctx.mesa.estado,
      },
      sucursal: { nombre: ctx.sucursal.nombre },
      sesion: {
        token: ctx.sesion.token,
        expira_en: ctx.sesion.expira_en,
        estado: ctx.sesion.estado,
      },
      puede_pedir: ctx.mesa.estado !== 'LIMPIEZA' && ctx.mesa.estado !== 'PIDIENDO_CUENTA'
        && (!pedido || pedido.estado === 'PENDIENTE_CONFIRMACION'),
      carta,
      pedido,
      llamados,
    };
  }

  async enviarPrepedido(token: string, dto: CartaPedidoDto) {
    const ctx = await this.resolverToken(token, true);
    if (['LIMPIEZA', 'PIDIENDO_CUENTA'].includes(ctx.mesa.estado)) {
      throw new ConflictException('Esta mesa ya no admite pedidos. Llame al mozo.');
    }
    const userId = await this.usuarioSistema();
    return this.pedidosService.upsertDesdeCarta({
      idSucursal: Number(ctx.mesa.id_sucursal),
      idMesa: Number(ctx.mesa.id_mesa),
      idSesion: Number(ctx.sesion.id_sesion),
      idUsuario: userId,
      dto,
    });
  }

  async llamarMozo(token: string, dto: LlamarMozoDto) {
    const ctx = await this.resolverToken(token, true);
    const [abierto] = await this.dataSource.query(
      `SELECT id_llamado FROM llamado_mozo
       WHERE id_sesion = ? AND estado = 'PENDIENTE' AND estado_registro = 'ACTIVO'
         AND motivo = ? LIMIT 1`,
      [ctx.sesion.id_sesion, dto.motivo],
    );
    if (abierto) {
      throw new ConflictException('Ya hay un llamado pendiente con ese motivo');
    }
    const userId = await this.usuarioSistema();
    const ins = await this.dataSource.query(
      `INSERT INTO llamado_mozo (id_sesion, id_mesa, motivo, detalle, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?)`,
      [ctx.sesion.id_sesion, ctx.mesa.id_mesa, dto.motivo, dto.detalle?.trim() || null, userId],
    );
    if (dto.motivo === 'CUENTA' && ctx.sesion.id_pedido) {
      const [ped] = await this.dataSource.query(
        `SELECT id_pedido, estado FROM pedido
         WHERE id_pedido = ? AND estado_registro = 'ACTIVO' LIMIT 1`,
        [ctx.sesion.id_pedido],
      );
      if (ped && !['PENDIENTE_CONFIRMACION', 'ANULADO', 'PAGADO'].includes(String(ped.estado))) {
        const idMesa = ctx.mesa.mesa_padre_id ? Number(ctx.mesa.mesa_padre_id) : Number(ctx.mesa.id_mesa);
        await this.dataSource.query(
          `UPDATE mesa SET estado = 'PIDIENDO_CUENTA', id_usuario_mod = ?
           WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
          [userId, idMesa, idMesa],
        );
      }
    }
    return {
      id_llamado: Number(ins.insertId),
      motivo: dto.motivo,
      estado: 'PENDIENTE',
    };
  }

  async qrMesa(idMesa: number, user: RequestUser) {
    const mesa = await this.obtenerMesa(idMesa);
    await this.alcanceService.assertAccesoSucursal(mesa.id_sucursal, user);
    const idRaiz = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : Number(mesa.id_mesa);
    const raiz = idRaiz === Number(mesa.id_mesa) ? mesa : await this.obtenerMesa(idRaiz);
    if (!raiz.token_qr) {
      const tokenMesa = randomBytes(16).toString('hex');
      await this.dataSource.query(
        `UPDATE mesa SET token_qr = ?, id_usuario_mod = ? WHERE id_mesa = ?`,
        [tokenMesa, user.idUsuario, raiz.id_mesa],
      );
      raiz.token_qr = tokenMesa;
    }
    const sesion = await this.asegurarSesion(raiz, user.idUsuario, false);
    const url = this.urlPublica(sesion.token);
    const qr_png = await QRCode.toDataURL(url, { width: 360, margin: 1 });
    return {
      id_mesa: raiz.id_mesa,
      numero: raiz.numero,
      url,
      token: sesion.token,
      token_mesa: raiz.token_qr,
      expira_en: sesion.expira_en,
      qr_png,
    };
  }

  async abrirSesion(dto: AbrirSesionDto, user: RequestUser) {
    const mesa = await this.obtenerMesa(dto.id_mesa);
    await this.alcanceService.assertAccesoSucursal(mesa.id_sucursal, user);
    const idRaiz = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : Number(mesa.id_mesa);
    const raiz = await this.obtenerMesa(idRaiz);
    const sesion = await this.asegurarSesion(raiz, user.idUsuario, true);
    await this.auditoriaService.registrar('mesa_sesion', Number(sesion.id_sesion), 'CREAR', user.idUsuario, null, {
      id_mesa: raiz.id_mesa,
    });
    return this.qrMesa(idRaiz, user);
  }

  async cerrarSesion(idMesa: number, user: RequestUser) {
    const mesa = await this.obtenerMesa(idMesa);
    await this.alcanceService.assertAccesoSucursal(mesa.id_sucursal, user);
    const raiz = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : Number(mesa.id_mesa);
    await this.cerrarSesionesMesa(raiz, user.idUsuario);
    return { ok: true };
  }

  async llamados(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const idSucursal = this.alcanceService.forzarSucursal(query.id_sucursal, alcance) || alcance.idSucursal;
    const params: any[] = [];
    let where = `WHERE l.estado_registro = 'ACTIVO' AND l.estado = 'PENDIENTE'`;
    if (idSucursal) {
      where += ` AND m.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND m.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    return this.dataSource.query(
      `SELECT l.id_llamado, l.motivo, l.detalle, l.fecha_llamado, m.id_mesa, m.numero AS mesa, s.nombre AS sucursal
       FROM llamado_mozo l
       INNER JOIN mesa m ON m.id_mesa = l.id_mesa
       INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
       ${where}
       ORDER BY l.fecha_llamado ASC`,
      params,
    );
  }

  async atenderLlamado(id: number, user: RequestUser) {
    const [row] = await this.dataSource.query(
      `SELECT l.*, m.id_sucursal FROM llamado_mozo l
       INNER JOIN mesa m ON m.id_mesa = l.id_mesa
       WHERE l.id_llamado = ? AND l.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Llamado no encontrado');
    await this.alcanceService.assertAccesoSucursal(row.id_sucursal, user);
    if (row.estado !== 'PENDIENTE') throw new ConflictException('El llamado ya fue atendido');
    await this.dataSource.query(
      `UPDATE llamado_mozo SET estado = 'ATENDIDO', fecha_atiende = NOW(), id_usuario_atiende = ?
       WHERE id_llamado = ?`,
      [user.idUsuario, id],
    );
    return { ok: true };
  }

  async cerrarSesionesMesa(idMesa: number, userId: number) {
    const mesas = await this.dataSource.query(
      `SELECT id_mesa FROM mesa WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
      [idMesa, idMesa],
    );
    const ids = mesas.map((m: any) => Number(m.id_mesa));
    if (!ids.length) return;
    const ph = ids.map(() => '?').join(',');
    await this.dataSource.query(
      `UPDATE mesa_sesion SET estado = 'CERRADA', fecha_cierre = NOW(), id_usuario_mod = ?
       WHERE id_mesa IN (${ph}) AND estado = 'ACTIVA' AND estado_registro = 'ACTIVO'`,
      [userId, ...ids],
    );
    await this.dataSource.query(
      `UPDATE llamado_mozo SET estado = 'ATENDIDO', fecha_atiende = NOW(), id_usuario_atiende = ?
       WHERE id_mesa IN (${ph}) AND estado = 'PENDIENTE' AND estado_registro = 'ACTIVO'`,
      [userId, ...ids],
    );
  }

  private async resolverToken(token: string, tocar = false) {
    const raw = String(token || '').trim();
    if (!raw || raw.length < 16) throw new NotFoundException('QR no válido');

    let sesion = await this.buscarSesionPorToken(raw);
    if (!sesion) {
      const [mesa] = await this.dataSource.query(
        `SELECT m.*, s.nombre AS sucursal_nombre
         FROM mesa m INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
         WHERE m.token_qr = ? AND m.estado_registro = 'ACTIVO'`,
        [raw],
      );
      if (!mesa) throw new NotFoundException('QR no válido');
      const idRaiz = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : Number(mesa.id_mesa);
      const raiz = idRaiz === Number(mesa.id_mesa) ? mesa : await this.obtenerMesa(idRaiz);
      if (raiz.estado === 'LIMPIEZA') {
        throw new ConflictException('La mesa está en limpieza. Espere al personal.');
      }
      const userId = await this.usuarioSistema();
      sesion = await this.asegurarSesion(raiz, userId, false);
    }

    if (sesion.estado !== 'ACTIVA') {
      throw new ConflictException('La sesión de esta mesa ya cerró. Pida un QR nuevo al mozo.');
    }
    if (new Date(sesion.expira_en).getTime() < Date.now()) {
      await this.dataSource.query(
        `UPDATE mesa_sesion SET estado = 'EXPIRADA', fecha_cierre = NOW() WHERE id_sesion = ?`,
        [sesion.id_sesion],
      );
      throw new ConflictException('La sesión expiró. Pida un QR nuevo al mozo.');
    }
    const inactivoMs = Date.now() - new Date(sesion.ultimo_acceso).getTime();
    if (inactivoMs > INACTIVIDAD_MIN * 60 * 1000) {
      await this.dataSource.query(
        `UPDATE mesa_sesion SET estado = 'EXPIRADA', fecha_cierre = NOW() WHERE id_sesion = ?`,
        [sesion.id_sesion],
      );
      throw new ConflictException('La sesión caducó por inactividad. Pida un QR nuevo al mozo.');
    }

    const mesa = await this.obtenerMesa(Number(sesion.id_mesa));
    if (mesa.estado === 'LIMPIEZA') {
      throw new ConflictException('La mesa está en limpieza. Espere al personal.');
    }
    const [suc] = await this.dataSource.query(
      `SELECT id_sucursal, nombre FROM sucursal WHERE id_sucursal = ?`,
      [mesa.id_sucursal],
    );
    if (tocar) {
      await this.dataSource.query(
        `UPDATE mesa_sesion SET ultimo_acceso = NOW() WHERE id_sesion = ?`,
        [sesion.id_sesion],
      );
    }
    return { sesion, mesa, sucursal: suc };
  }

  private async buscarSesionPorToken(token: string) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM mesa_sesion WHERE token = ? AND estado_registro = 'ACTIVO' LIMIT 1`,
      [token],
    );
    return row || null;
  }

  private async asegurarSesion(mesa: any, userId: number, forzarNueva: boolean) {
    const idMesa = Number(mesa.id_mesa);
    const [actual] = await this.dataSource.query(
      `SELECT * FROM mesa_sesion
       WHERE id_mesa = ? AND estado = 'ACTIVA' AND estado_registro = 'ACTIVO'
       ORDER BY id_sesion DESC LIMIT 1`,
      [idMesa],
    );
    const vigente = actual
      && new Date(actual.expira_en).getTime() > Date.now()
      && Date.now() - new Date(actual.ultimo_acceso).getTime() <= INACTIVIDAD_MIN * 60 * 1000;
    if (vigente && !forzarNueva) return actual;
    if (actual && forzarNueva) {
      await this.dataSource.query(
        `UPDATE mesa_sesion SET estado = 'CERRADA', fecha_cierre = NOW(), id_usuario_mod = ?
         WHERE id_sesion = ?`,
        [userId, actual.id_sesion],
      );
    } else if (actual && !vigente) {
      await this.dataSource.query(
        `UPDATE mesa_sesion SET estado = 'EXPIRADA', fecha_cierre = NOW() WHERE id_sesion = ?`,
        [actual.id_sesion],
      );
    }
    if (mesa.estado === 'LIMPIEZA') {
      throw new ConflictException('No se abre QR mientras la mesa está en limpieza');
    }
    const token = randomBytes(24).toString('hex');
    const ins = await this.dataSource.query(
      `INSERT INTO mesa_sesion (id_mesa, token, expira_en, ultimo_acceso, id_usuario_crea)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${SESION_HORAS} HOUR), NOW(), ?)`,
      [idMesa, token, userId],
    );
    const [row] = await this.dataSource.query(`SELECT * FROM mesa_sesion WHERE id_sesion = ?`, [ins.insertId]);
    return row;
  }

  private urlPublica(token: string) {
    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:4203').replace(/\/$/, '');
    return `${base}/m/${token}`;
  }

  private async usuarioSistema() {
    const [row] = await this.dataSource.query(
      `SELECT id_usuario FROM sis_usuario WHERE correo = 'admin' AND estado_registro = 'ACTIVO' LIMIT 1`,
    );
    return Number(row?.id_usuario || 1);
  }

  private async obtenerMesa(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM mesa WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }

  private assertQueryScalars(query: any, keys: string[]) {
    for (const key of keys) {
      if (Array.isArray(query?.[key])) throw new BadRequestException('Param inválido');
    }
  }
}
