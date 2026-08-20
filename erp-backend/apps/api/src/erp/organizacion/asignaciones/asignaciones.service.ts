import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import { CreateAsignacionDto } from './asignaciones.dto';

const ROLES_OPERATIVOS = ['ADMIN_SUCURSAL', 'MOZO', 'CAJA', 'COCINA', 'BAR'];

@Injectable()
export class AsignacionesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async findAll(query: any) {
    if (Array.isArray(query?.page) || Array.isArray(query?.limit) || Array.isArray(query?.search)) {
      throw new BadRequestException('Param inválido');
    }

    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE u.estado_registro = 'ACTIVO'`;

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (u.nombres LIKE ? OR u.apellidos LIKE ? OR u.correo LIKE ? OR s.nombre LIKE ? OR r.nombre LIKE ?)`;
      params.push(search, search, search, search, search);
    }

    const from = `
      FROM sis_usuario u
      INNER JOIN sis_rol r ON r.id_rol = u.id_rol
      LEFT JOIN sucursal_asignacion a
        ON a.id_asignacion = (
          SELECT a2.id_asignacion
          FROM sucursal_asignacion a2
          WHERE a2.id_usuario = u.id_usuario
            AND a2.estado_registro = 'ACTIVO'
            AND a2.vigente_hasta IS NULL
          ORDER BY a2.id_asignacion DESC
          LIMIT 1
        )
      LEFT JOIN sucursal s
        ON s.id_sucursal = a.id_sucursal
       AND s.estado_registro = 'ACTIVO'
      ${where}
    `;

    const dataSql = `
      SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.estado_registro,
             u.id_rol, r.nombre AS rol,
             a.id_asignacion, a.id_sucursal, a.vigente_desde,
             s.codigo AS sucursal_codigo, s.nombre AS sucursal
      ${from}
      ORDER BY u.apellidos ASC, u.nombres ASC
      LIMIT ? OFFSET ?
    `;
    const countSql = `SELECT COUNT(*) AS total ${from}`;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(dataSql, [...params, limit, offset]),
      this.dataSource.query(countSql, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async rolesOperativos() {
    const placeholders = ROLES_OPERATIVOS.map(() => '?').join(', ');
    const roles = await this.dataSource.query(
      `SELECT id_rol, nombre, descripcion
       FROM sis_rol
       WHERE estado_registro = 'ACTIVO' AND nombre IN (${placeholders})
       ORDER BY nombre ASC`,
      ROLES_OPERATIVOS,
    );
    return roles;
  }

  async historial(idUsuario: number) {
    this.assertId(idUsuario);
    const [user] = await this.dataSource.query(
      `SELECT id_usuario FROM sis_usuario WHERE id_usuario = ? AND estado_registro != 'ELIMINADO'`,
      [idUsuario],
    );
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.dataSource.query(
      `SELECT a.id_asignacion, a.id_usuario, a.id_sucursal, a.id_rol,
              a.vigente_desde, a.vigente_hasta, a.estado_registro,
              s.codigo AS sucursal_codigo, s.nombre AS sucursal,
              r.nombre AS rol,
              CONCAT_WS(' ', uc.nombres, uc.apellidos) AS asignado_por
       FROM sucursal_asignacion a
       INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
       INNER JOIN sis_rol r ON r.id_rol = a.id_rol
       INNER JOIN sis_usuario uc ON uc.id_usuario = a.id_usuario_crea
       WHERE a.id_usuario = ? AND a.estado_registro = 'ACTIVO'
       ORDER BY a.vigente_desde DESC, a.id_asignacion DESC`,
      [idUsuario],
    );
  }

  async asignar(dto: CreateAsignacionDto, userId: number) {
    const idUsuario = Number(dto.id_usuario);
    const idSucursal = Number(dto.id_sucursal);
    const idRol = Number(dto.id_rol);
    this.assertId(idUsuario);
    this.assertId(idSucursal);
    this.assertId(idRol);

    if (idUsuario === 1) {
      throw new ConflictException('No se puede reasignar al administrador principal del sistema');
    }

    const [trabajador] = await this.dataSource.query(
      `SELECT u.id_usuario, u.id_rol, u.nombres, u.apellidos, r.nombre AS rol
       FROM sis_usuario u
       INNER JOIN sis_rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = ? AND u.estado_registro = 'ACTIVO'`,
      [idUsuario],
    );
    if (!trabajador) throw new NotFoundException('Usuario no encontrado o inactivo');
    if (String(trabajador.rol) === 'SUPERADMIN') {
      throw new ConflictException('El admin corporativo no se reasigna por sucursal');
    }

    const [sucursal] = await this.dataSource.query(
      `SELECT id_sucursal, codigo, nombre FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');

    const [rol] = await this.dataSource.query(
      `SELECT id_rol, nombre FROM sis_rol WHERE id_rol = ? AND estado_registro = 'ACTIVO'`,
      [idRol],
    );
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (!ROLES_OPERATIVOS.includes(String(rol.nombre))) {
      throw new BadRequestException('Solo se pueden asignar roles operativos (MOZO, CAJA, COCINA, BAR, ADMIN_SUCURSAL)');
    }

    const [vigente] = await this.dataSource.query(
      `SELECT id_asignacion, id_sucursal, id_rol
       FROM sucursal_asignacion
       WHERE id_usuario = ? AND estado_registro = 'ACTIVO' AND vigente_hasta IS NULL
       ORDER BY id_asignacion DESC
       LIMIT 1`,
      [idUsuario],
    );
    if (vigente && Number(vigente.id_sucursal) === idSucursal && Number(vigente.id_rol) === idRol) {
      throw new ConflictException('El trabajador ya tiene esa sucursal y función vigentes');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (vigente) {
        const closeRes = await qr.query(
          `UPDATE sucursal_asignacion
           SET vigente_hasta = NOW(), id_usuario_mod = ?
           WHERE id_asignacion = ? AND vigente_hasta IS NULL AND estado_registro = 'ACTIVO'`,
          [userId, vigente.id_asignacion],
        );
        if (closeRes.affectedRows === 0) {
          throw new NotFoundException('No se pudo cerrar la asignación anterior');
        }
      }

      const insertRes = await qr.query(
        `INSERT INTO sucursal_asignacion (id_usuario, id_sucursal, id_rol, id_usuario_crea)
         VALUES (?, ?, ?, ?)`,
        [idUsuario, idSucursal, idRol, userId],
      );
      const idAsignacion = Number(insertRes.insertId);

      const rolRes = await qr.query(
        `UPDATE sis_usuario SET id_rol = ? WHERE id_usuario = ? AND estado_registro = 'ACTIVO'`,
        [idRol, idUsuario],
      );
      if (rolRes.affectedRows === 0) {
        throw new NotFoundException('Usuario no encontrado o ya eliminado');
      }

      const nuevos = {
        id_asignacion: idAsignacion,
        id_usuario: idUsuario,
        id_sucursal: idSucursal,
        sucursal: sucursal.nombre,
        id_rol: idRol,
        rol: rol.nombre,
      };

      await this.auditoriaService.registrarConTransaccion(
        qr,
        'sucursal_asignacion',
        idAsignacion,
        'CREAR',
        userId,
        vigente
          ? { id_asignacion: vigente.id_asignacion, id_sucursal: vigente.id_sucursal, id_rol: vigente.id_rol }
          : null,
        nuevos,
      );

      await qr.commitTransaction();
      return nuevos;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
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
