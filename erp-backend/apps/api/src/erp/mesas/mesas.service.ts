import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource, QueryRunner } from 'typeorm';
import { randomBytes } from 'crypto';
import { RequestUser } from '../../common/auth/request-user.interface';
import { CartaService } from '../carta/carta.service';
import {
  ActualizarPosicionesDto,
  CambiarEstadoMesaDto,
  CreateMesaDto,
  ESTADOS_MESA,
  SepararMesasDto,
  UnirMesasDto,
  UpdateMesaDto,
  ZONAS_MESA,
} from './mesas.dto';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null };

@Injectable()
export class MesasService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly cartaService: CartaService,
  ) {}

  catalogos() {
    return {
      estados: ESTADOS_MESA.map((e) => ({ codigo: e, etiqueta: this.etiquetaEstado(e) })),
      zonas: ZONAS_MESA.map((z) => ({ codigo: z, etiqueta: this.etiquetaZona(z) })),
    };
  }

  async listaSucursales(user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    const params: any[] = [];
    let where = `WHERE s.estado_registro = 'ACTIVO' AND s.tipo = 'LOCAL'`;
    if (!alcance.esSuperadmin) {
      where += ` AND s.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    return this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre FROM sucursal s ${where} ORDER BY s.nombre ASC`,
      params,
    );
  }

  async mapa(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal', 'zona']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    const params: any[] = [idSucursal];
    let where = `WHERE m.id_sucursal = ? AND m.estado_registro = 'ACTIVO' AND m.mesa_padre_id IS NULL AND m.numero <> 'POS'`;

    if (query.zona) {
      where += ` AND m.zona = ?`;
      params.push(String(query.zona).toUpperCase());
    }

    const mesas = await this.dataSource.query(
      `SELECT m.id_mesa, m.id_sucursal, s.nombre AS sucursal, m.numero, m.nombre, m.capacidad, m.zona,
              m.estado, m.mesa_padre_id, m.pos_x, m.pos_y, m.token_qr,
              (SELECT COUNT(*) FROM mesa h WHERE h.mesa_padre_id = m.id_mesa AND h.estado_registro = 'ACTIVO') AS hijas,
              (SELECT COALESCE(SUM(h.capacidad), 0) FROM mesa h WHERE h.mesa_padre_id = m.id_mesa AND h.estado_registro = 'ACTIVO') AS capacidad_unida,
              (SELECT COUNT(*) FROM llamado_mozo l WHERE l.id_mesa = m.id_mesa AND l.estado = 'PENDIENTE' AND l.estado_registro = 'ACTIVO') AS llamados_pendientes,
              (SELECT COUNT(*) FROM mesa_sesion ms WHERE ms.id_mesa = m.id_mesa AND ms.estado = 'ACTIVA' AND ms.estado_registro = 'ACTIVO') AS sesion_qr,
              (SELECT COUNT(*) FROM pedido p WHERE p.id_mesa = m.id_mesa AND p.origen = 'QR' AND p.estado = 'PENDIENTE_CONFIRMACION' AND p.estado_registro = 'ACTIVO') AS prepedido_qr
       FROM mesa m
       INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
       ${where}
       ORDER BY m.numero ASC`,
      params,
    );

    const hijas = await this.dataSource.query(
      `SELECT m.id_mesa, m.numero, m.capacidad, m.estado, m.mesa_padre_id
       FROM mesa m
       WHERE m.id_sucursal = ? AND m.estado_registro = 'ACTIVO' AND m.mesa_padre_id IS NOT NULL
       ORDER BY m.numero ASC`,
      [idSucursal],
    );

    const hijasPorPadre = hijas.reduce((acc: Record<number, any[]>, row: any) => {
      const padre = Number(row.mesa_padre_id);
      if (!acc[padre]) acc[padre] = [];
      acc[padre].push(row);
      return acc;
    }, {});

    return mesas.map((m: any) => ({
      ...m,
      capacidad_total: Number(m.capacidad) + Number(m.capacidad_unida || 0),
      mesas_unidas: hijasPorPadre[Number(m.id_mesa)] || [],
    }));
  }

  async lista(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    return this.dataSource.query(
      `SELECT m.id_mesa, m.numero, m.nombre, m.capacidad, m.zona, m.estado, m.mesa_padre_id,
              CASE WHEN m.mesa_padre_id IS NULL THEN m.numero ELSE CONCAT(mp.numero, '+', m.numero) END AS etiqueta
       FROM mesa m
       LEFT JOIN mesa mp ON mp.id_mesa = m.mesa_padre_id
       WHERE m.id_sucursal = ? AND m.estado_registro = 'ACTIVO'
       ORDER BY m.numero ASC`,
      [idSucursal],
    );
  }

  async findAll(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'search', 'id_sucursal', 'estado', 'zona']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE m.estado_registro = 'ACTIVO'`;

    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND m.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND m.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (m.numero LIKE ? OR m.nombre LIKE ? OR s.nombre LIKE ?)`;
      params.push(search, search, search);
    }
    if (query.estado) {
      where += ` AND m.estado = ?`;
      params.push(String(query.estado).toUpperCase());
    }
    if (query.zona) {
      where += ` AND m.zona = ?`;
      params.push(String(query.zona).toUpperCase());
    }

    const from = `
      FROM mesa m
      INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
      LEFT JOIN mesa mp ON mp.id_mesa = m.mesa_padre_id
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT m.id_mesa, m.id_sucursal, s.nombre AS sucursal, m.numero, m.nombre, m.capacidad, m.zona,
                m.estado, m.mesa_padre_id, mp.numero AS mesa_padre_numero, m.pos_x, m.pos_y
         ${from}
         ORDER BY s.nombre ASC, m.numero ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async findOne(id: number, user: RequestUser) {
    this.assertId(id);
    const mesa = await this.obtenerMesaActiva(id);
    await this.assertAccesoSucursal(mesa.id_sucursal, user);
    const hijas = await this.dataSource.query(
      `SELECT id_mesa, numero, capacidad, estado FROM mesa
       WHERE mesa_padre_id = ? AND estado_registro = 'ACTIVO' ORDER BY numero ASC`,
      [id],
    );
    return { ...mesa, mesas_unidas: hijas };
  }

  async create(dto: CreateMesaDto, user: RequestUser) {
    await this.assertAccesoSucursal(dto.id_sucursal, user);
    await this.validateSucursalActiva(dto.id_sucursal);
    const payload = this.normalizeMesa(dto);
    await this.assertNumeroUnico(payload.id_sucursal, payload.numero);

    const result = await this.dataSource.query(
      `INSERT INTO mesa (id_sucursal, numero, nombre, capacidad, zona, pos_x, pos_y, token_qr, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.id_sucursal,
        payload.numero,
        payload.nombre,
        payload.capacidad,
        payload.zona,
        payload.pos_x,
        payload.pos_y,
        randomBytes(16).toString('hex'),
        user.idUsuario,
      ],
    );
    const id = Number(result.insertId);
    const created = await this.findOne(id, user);
    await this.auditoriaService.registrar('mesa', id, 'CREAR', user.idUsuario, null, created);
    return created;
  }

  async update(id: number, dto: UpdateMesaDto, user: RequestUser) {
    this.assertId(id);
    const old = await this.obtenerMesaActiva(id);
    await this.assertAccesoSucursal(old.id_sucursal, user);
    const payload = this.normalizeMesa({ ...old, ...dto });
    const idSucursal = dto.id_sucursal ?? old.id_sucursal;
    if (Number(idSucursal) !== Number(old.id_sucursal)) {
      throw new BadRequestException('No se puede mover una mesa a otra sucursal');
    }
    if (payload.numero !== old.numero) {
      await this.assertNumeroUnico(idSucursal, payload.numero, id);
    }

    const result = await this.dataSource.query(
      `UPDATE mesa
       SET numero = ?, nombre = ?, capacidad = ?, zona = ?, pos_x = ?, pos_y = ?, id_usuario_mod = ?
       WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
      [payload.numero, payload.nombre, payload.capacidad, payload.zona, payload.pos_x, payload.pos_y, user.idUsuario, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Mesa no encontrada');
    const updated = await this.findOne(id, user);
    await this.auditoriaService.registrar('mesa', id, 'ACTUALIZAR', user.idUsuario, old, updated);
    return updated;
  }

  async cambiarEstado(id: number, dto: CambiarEstadoMesaDto, user: RequestUser) {
    this.assertId(id);
    const mesa = await this.obtenerMesaActiva(id);
    await this.assertAccesoSucursal(mesa.id_sucursal, user);
    const raiz = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : id;

    await this.dataSource.query(
      `UPDATE mesa SET estado = ?, id_usuario_mod = ?
       WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
      [dto.estado, user.idUsuario, raiz, raiz],
    );
    if (dto.estado === 'LIBRE' || dto.estado === 'LIMPIEZA') {
      await this.cartaService.cerrarSesionesMesa(raiz, user.idUsuario);
    }

    await this.auditoriaService.registrar('mesa', id, 'ACTUALIZAR', user.idUsuario, { estado: mesa.estado }, { estado: dto.estado });
    return this.findOne(raiz, user);
  }

  async actualizarPosiciones(dto: ActualizarPosicionesDto, user: RequestUser) {
    await this.assertAccesoSucursal(dto.id_sucursal, user);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const item of dto.items) {
        const mesa = await this.obtenerMesaActiva(item.id_mesa, qr);
        if (Number(mesa.id_sucursal) !== Number(dto.id_sucursal)) {
          throw new ForbiddenException('La mesa no pertenece a la sucursal indicada');
        }
        if (mesa.mesa_padre_id) {
          throw new BadRequestException(`La mesa ${mesa.numero} está unida y no se puede mover sola`);
        }
        await qr.query(
          `UPDATE mesa SET pos_x = ?, pos_y = ?, id_usuario_mod = ? WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
          [item.pos_x, item.pos_y, user.idUsuario, item.id_mesa],
        );
      }
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
    return this.mapa({ id_sucursal: dto.id_sucursal }, user);
  }

  async unir(dto: UnirMesasDto, user: RequestUser) {
    const principal = await this.obtenerMesaActiva(dto.id_mesa_principal);
    await this.assertAccesoSucursal(principal.id_sucursal, user);
    if (principal.mesa_padre_id) throw new BadRequestException('La mesa principal no puede ser secundaria de otra');

    const secundarias: any[] = [];
    for (const idSec of dto.id_mesas_secundarias) {
      if (Number(idSec) === Number(dto.id_mesa_principal)) {
        throw new BadRequestException('No puede unir una mesa consigo misma');
      }
      const sec = await this.obtenerMesaActiva(idSec);
      if (Number(sec.id_sucursal) !== Number(principal.id_sucursal)) {
        throw new BadRequestException('Todas las mesas deben ser de la misma sucursal');
      }
      if (sec.mesa_padre_id) throw new ConflictException(`La mesa ${sec.numero} ya está unida`);
      const [hijas] = await this.dataSource.query(
        `SELECT COUNT(*) AS total FROM mesa WHERE mesa_padre_id = ? AND estado_registro = 'ACTIVO'`,
        [idSec],
      );
      if (Number(hijas?.total || 0) > 0) {
        throw new ConflictException(`La mesa ${sec.numero} ya tiene mesas unidas; use esa como principal`);
      }
      secundarias.push(sec);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const sec of secundarias) {
        await qr.query(
          `UPDATE mesa SET mesa_padre_id = ?, estado = ?, id_usuario_mod = ? WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
          [dto.id_mesa_principal, principal.estado, user.idUsuario, sec.id_mesa],
        );
        await qr.query(
          `INSERT INTO mesa_union (id_mesa_principal, id_mesa_secundaria, accion, id_usuario_crea)
           VALUES (?, ?, 'UNIR', ?)`,
          [dto.id_mesa_principal, sec.id_mesa, user.idUsuario],
        );
      }
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('mesa', dto.id_mesa_principal, 'ACTUALIZAR', user.idUsuario, null, {
      accion: 'UNIR',
      secundarias: dto.id_mesas_secundarias,
    });
    return this.findOne(dto.id_mesa_principal, user);
  }

  async separar(dto: SepararMesasDto, user: RequestUser) {
    const mesa = await this.obtenerMesaActiva(dto.id_mesa);
    await this.assertAccesoSucursal(mesa.id_sucursal, user);

    let principalId = dto.id_mesa;
    let hijas: any[] = [];

    if (mesa.mesa_padre_id) {
      principalId = Number(mesa.mesa_padre_id);
      hijas = [mesa];
    } else {
      hijas = await this.dataSource.query(
        `SELECT id_mesa, numero FROM mesa WHERE mesa_padre_id = ? AND estado_registro = 'ACTIVO'`,
        [dto.id_mesa],
      );
      if (!hijas.length) throw new BadRequestException('La mesa no tiene mesas unidas');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const h of hijas) {
        await qr.query(
          `UPDATE mesa SET mesa_padre_id = NULL, estado = 'LIBRE', id_usuario_mod = ? WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
          [user.idUsuario, h.id_mesa],
        );
        await qr.query(
          `INSERT INTO mesa_union (id_mesa_principal, id_mesa_secundaria, accion, id_usuario_crea)
           VALUES (?, ?, 'SEPARAR', ?)`,
          [principalId, h.id_mesa, user.idUsuario],
        );
      }
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('mesa', principalId, 'ACTUALIZAR', user.idUsuario, null, {
      accion: 'SEPARAR',
      mesas: hijas.map((h) => h.id_mesa),
    });
    return this.findOne(principalId, user);
  }

  async historialUniones(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 50);
    const offset = (page - 1) * limit;
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    const params: any[] = [];
    let where = `WHERE u.estado_registro = 'ACTIVO'`;
    if (idSucursal) {
      where += ` AND p.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND p.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }

    const from = `
      FROM mesa_union u
      INNER JOIN mesa p ON p.id_mesa = u.id_mesa_principal
      INNER JOIN mesa s ON s.id_mesa = u.id_mesa_secundaria
      INNER JOIN sis_usuario usr ON usr.id_usuario = u.id_usuario_crea
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT u.id_union, u.accion, u.fecha_registro,
                p.numero AS mesa_principal, s.numero AS mesa_secundaria,
                CONCAT(usr.nombres, ' ', usr.apellidos) AS usuario
         ${from}
         ORDER BY u.fecha_registro DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async remove(id: number, user: RequestUser) {
    this.assertId(id);
    const old = await this.obtenerMesaActiva(id);
    await this.assertAccesoSucursal(old.id_sucursal, user);

    const [hijas] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM mesa WHERE mesa_padre_id = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (Number(hijas?.total || 0) > 0) {
      throw new ConflictException('Separe las mesas unidas antes de eliminar');
    }
    if (old.mesa_padre_id) {
      throw new ConflictException('Separe la mesa del grupo antes de eliminarla');
    }

    const result = await this.dataSource.query(
      `UPDATE mesa SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Mesa no encontrada');
    await this.auditoriaService.registrar('mesa', id, 'ELIMINAR', user.idUsuario, old, null);
    return { id_mesa: id };
  }

  private async obtenerMesaActiva(id: number, qr?: QueryRunner) {
    const runner = qr ?? this.dataSource;
    const [row] = await runner.query(
      `SELECT m.id_mesa, m.id_sucursal, s.nombre AS sucursal, m.numero, m.nombre, m.capacidad, m.zona,
              m.estado, m.mesa_padre_id, m.pos_x, m.pos_y, m.estado_registro
       FROM mesa m
       INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
       WHERE m.id_mesa = ? AND m.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }

  private async assertNumeroUnico(idSucursal: number, numero: string, excludeId?: number) {
    const params: any[] = [idSucursal, numero];
    let sql = `SELECT id_mesa FROM mesa WHERE id_sucursal = ? AND numero = ? AND estado_registro = 'ACTIVO'`;
    if (excludeId) {
      sql += ` AND id_mesa <> ?`;
      params.push(excludeId);
    }
    const [row] = await this.dataSource.query(sql, params);
    if (row) throw new ConflictException('Ya existe una mesa con ese número en la sucursal');
  }

  private async validateSucursalActiva(idSucursal: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    if (!row) throw new NotFoundException('Sucursal no encontrada');
  }

  private normalizeMesa(dto: Partial<CreateMesaDto> & { numero?: string }) {
    return {
      id_sucursal: Number(dto.id_sucursal),
      numero: String(dto.numero || '').trim().toUpperCase(),
      nombre: dto.nombre ? String(dto.nombre).trim().toUpperCase() : null,
      capacidad: Number(dto.capacidad ?? 4),
      zona: String(dto.zona || 'SALON').toUpperCase(),
      pos_x: Math.min(100, Math.max(0, Number(dto.pos_x ?? 0))),
      pos_y: Math.min(100, Math.max(0, Number(dto.pos_y ?? 0))),
    };
  }

  private etiquetaEstado(estado: string) {
    const map: Record<string, string> = {
      LIBRE: 'Libre',
      OCUPADA: 'Ocupada',
      ESPERANDO_CONFIRMACION: 'Esperando confirmación',
      COMIENDO: 'Comiendo',
      PIDIENDO_CUENTA: 'Pidiendo cuenta',
      LIMPIEZA: 'Limpieza',
    };
    return map[estado] || estado;
  }

  private etiquetaZona(zona: string) {
    const map: Record<string, string> = { SALON: 'Salón', TERRAZA: 'Terraza', BAR: 'Bar' };
    return map[zona] || zona;
  }

  private async assertAccesoSucursal(idSucursal: number, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    this.assertSucursalPermitida(idSucursal, alcance);
  }

  private async resolverAlcance(user: RequestUser): Promise<AlcanceSucursal> {
    const [rol] = await this.dataSource.query(`SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`, [user.idRol]);
    const esSuperadmin = String(rol?.nombre || '') === 'SUPERADMIN';
    if (esSuperadmin) return { esSuperadmin: true, idSucursal: null };

    const [asig] = await this.dataSource.query(
      `SELECT a.id_sucursal FROM sucursal_asignacion a
       INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
       WHERE a.id_usuario = ? AND a.estado_registro = 'ACTIVO' AND a.vigente_hasta IS NULL AND s.estado_registro = 'ACTIVO'
       ORDER BY a.id_asignacion DESC LIMIT 1`,
      [user.idUsuario],
    );
    const idSucursal = Number(asig?.id_sucursal || 0);
    if (!idSucursal) throw new ForbiddenException('Usuario sin sucursal asignada');
    return { esSuperadmin: false, idSucursal };
  }

  private exigirSucursal(raw: any, alcance: AlcanceSucursal): number {
    const id = this.forzarSucursal(raw, alcance);
    if (!id) throw new BadRequestException('Debe indicar la sucursal');
    return id;
  }

  private forzarSucursal(raw: any, alcance: AlcanceSucursal): number | null {
    if (!alcance.esSuperadmin) {
      if (raw != null && raw !== '' && Number(raw) !== alcance.idSucursal) {
        throw new ForbiddenException('No puede consultar otra sucursal');
      }
      return alcance.idSucursal;
    }
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!n || Number.isNaN(n)) throw new BadRequestException('Sucursal inválida');
    return n;
  }

  private assertSucursalPermitida(idSucursal: number, alcance: AlcanceSucursal) {
    if (!alcance.esSuperadmin && Number(idSucursal) !== alcance.idSucursal) {
      throw new ForbiddenException('No puede operar otra sucursal');
    }
  }

  private assertQueryScalars(query: any, keys: string[]) {
    for (const key of keys) {
      if (Array.isArray(query?.[key])) throw new BadRequestException('Param inválido');
    }
  }

  private toPositiveNumber(value: any, fallback: number) {
    const n = Number(value);
    return n > 0 && !Number.isNaN(n) ? n : fallback;
  }

  private assertId(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('ID inválido');
  }
}
