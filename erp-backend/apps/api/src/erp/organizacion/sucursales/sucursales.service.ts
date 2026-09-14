import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService, UploadService } from '@app/common';
import { DataSource } from 'typeorm';
import { CreateSucursalDto, UpdateSucursalDto } from './sucursales.dto';

@Injectable()
export class SucursalesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly uploadService: UploadService,
  ) {}

  async findAll(query: any) {
    if (Array.isArray(query?.page) || Array.isArray(query?.limit) || Array.isArray(query?.search)) {
      throw new BadRequestException('Param inválido');
    }

    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE estado_registro = 'ACTIVO'`;

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (codigo LIKE ? OR nombre LIKE ? OR direccion LIKE ?)`;
      params.push(search, search, search);
    }

    const tipo = String(query.tipo || '').trim().toUpperCase();
    if (tipo === 'LOCAL' || tipo === 'ALMACEN') {
      where += ` AND tipo = ?`;
      params.push(tipo);
    }

    const dataSql = `
      SELECT id_sucursal, codigo, nombre, direccion, telefono, tipo, ruc, razon_social, nombre_comercial, logo_path,
             ubigeo, departamento, provincia, distrito, direccion_fiscal,
             codigo_establecimiento_sunat, nubefact_url,
             CASE WHEN nubefact_token IS NULL OR nubefact_token = '' THEN 0 ELSE 1 END AS tiene_nubefact,
             estado_registro
      FROM sucursal
      ${where}
      ORDER BY id_sucursal DESC
      LIMIT ? OFFSET ?
    `;
    const countSql = `SELECT COUNT(*) AS total FROM sucursal ${where}`;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(dataSql, [...params, limit, offset]),
      this.dataSource.query(countSql, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async findOne(id: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT id_sucursal, codigo, nombre, direccion, telefono, tipo, ruc, razon_social, nombre_comercial, logo_path,
              ubigeo, departamento, provincia, distrito, direccion_fiscal,
              codigo_establecimiento_sunat, nubefact_url, nubefact_token, estado_registro
       FROM sucursal
       WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return row;
  }

  async create(dto: CreateSucursalDto, userId: number) {
    const payload = this.normalize(dto);
    const result = await this.dataSource.query(
      `INSERT INTO sucursal
       (codigo, nombre, direccion, telefono, tipo, ruc, razon_social, nombre_comercial,
        ubigeo, departamento, provincia, distrito, direccion_fiscal,
        codigo_establecimiento_sunat, nubefact_url, nubefact_token, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.codigo, payload.nombre, payload.direccion, payload.telefono, payload.tipo,
        payload.ruc, payload.razon_social, payload.nombre_comercial,
        payload.ubigeo, payload.departamento, payload.provincia, payload.distrito, payload.direccion_fiscal,
        payload.codigo_establecimiento_sunat, payload.nubefact_url, payload.nubefact_token, userId,
      ],
    );
    const id = Number(result.insertId);
    await this.dataSource.query(
      `INSERT INTO insumo_stock (id_insumo, id_sucursal, stock_actual, stock_minimo, costo_promedio, id_usuario_crea)
       SELECT i.id_insumo, ?, 0, 0, i.costo_unitario, ?
       FROM insumo i
       WHERE i.estado_registro = 'ACTIVO'`,
      [id, userId],
    );
    if (payload.tipo === 'LOCAL') {
      await this.seedOperacionLocal(id, userId);
    }
    const created = await this.findOne(id);
    await this.auditoriaService.registrar('sucursal', id, 'CREAR', userId, null, created);
    return created;
  }

  async update(id: number, dto: UpdateSucursalDto, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const payload = this.normalize({ ...oldValues, ...dto });
    if (!dto.nubefact_token?.trim()) {
      payload.nubefact_token = oldValues.nubefact_token;
    }

    const result = await this.dataSource.query(
      `UPDATE sucursal
       SET codigo = ?, nombre = ?, direccion = ?, telefono = ?, tipo = ?,
           ruc = ?, razon_social = ?, nombre_comercial = ?,
           ubigeo = ?, departamento = ?, provincia = ?, distrito = ?, direccion_fiscal = ?,
           codigo_establecimiento_sunat = ?, nubefact_url = ?, nubefact_token = ?, id_usuario_mod = ?
       WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [
        payload.codigo, payload.nombre, payload.direccion, payload.telefono, payload.tipo,
        payload.ruc, payload.razon_social, payload.nombre_comercial,
        payload.ubigeo, payload.departamento, payload.provincia, payload.distrito, payload.direccion_fiscal,
        payload.codigo_establecimiento_sunat, payload.nubefact_url, payload.nubefact_token, userId, id,
      ],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Sucursal no encontrada');

    const updated = await this.findOne(id);
    await this.auditoriaService.registrar('sucursal', id, 'ACTUALIZAR', userId, oldValues, updated);
    return updated;
  }

  async remove(id: number, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);

    const [activas] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sucursal WHERE estado_registro = 'ACTIVO'`,
    );
    if (Number(activas?.total || 0) <= 1) {
      throw new ConflictException('No se puede eliminar la única sucursal activa');
    }

    const [asignados] = await this.dataSource.query(
      `SELECT COUNT(*) AS total
       FROM sucursal_asignacion
       WHERE id_sucursal = ? AND estado_registro = 'ACTIVO' AND vigente_hasta IS NULL`,
      [id],
    );
    if (Number(asignados?.total || 0) > 0) {
      throw new ConflictException('No se puede eliminar: tiene personal asignado. Reasigne primero.');
    }

    const result = await this.dataSource.query(
      `UPDATE sucursal
       SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Sucursal no encontrada');

    await this.auditoriaService.registrar('sucursal', id, 'ELIMINAR', userId, oldValues, null);
    return { id_sucursal: id };
  }

  async uploadLogo(id: number, file: Express.Multer.File, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const logoPath = this.uploadService.saveSucursalLogo(id, file);
    if (oldValues.logo_path && oldValues.logo_path !== logoPath) {
      this.uploadService.deleteIfExists(oldValues.logo_path);
    }
    await this.dataSource.query(
      `UPDATE sucursal SET logo_path = ?, id_usuario_mod = ? WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [logoPath, userId, id],
    );
    const updated = await this.findOne(id);
    await this.auditoriaService.registrar('sucursal', id, 'ACTUALIZAR', userId, oldValues, updated);
    return {
      id_sucursal: id,
      logo_path: logoPath,
      logo_url: `/uploads/${logoPath}`,
    };
  }

  async removeLogo(id: number, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    if (oldValues.logo_path) {
      this.uploadService.deleteIfExists(oldValues.logo_path);
    }
    await this.dataSource.query(
      `UPDATE sucursal SET logo_path = NULL, id_usuario_mod = ? WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    const updated = await this.findOne(id);
    await this.auditoriaService.registrar('sucursal', id, 'ACTUALIZAR', userId, oldValues, updated);
    return { id_sucursal: id, logo_path: null, logo_url: null };
  }

  private async seedOperacionLocal(idSucursal: number, userId: number) {
    await this.dataSource.query(
      `INSERT INTO mesa (id_sucursal, numero, nombre, capacidad, zona, estado, pos_x, pos_y, id_usuario_crea)
       SELECT ?, 'POS', 'MOSTRADOR', 1, 'BAR', 'LIBRE', 0, 0, ?
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM mesa m WHERE m.id_sucursal = ? AND m.numero = 'POS')`,
      [idSucursal, userId, idSucursal],
    );
    await this.dataSource.query(
      `INSERT INTO comprobante_serie (id_sucursal, tipo, serie, correlativo_actual, id_usuario_crea)
       SELECT ?, v.tipo, v.serie, 0, ?
       FROM (
         SELECT '03' AS tipo, 'B001' AS serie UNION ALL
         SELECT '01', 'F001' UNION ALL
         SELECT '07', 'BC01' UNION ALL
         SELECT '07', 'FC01'
       ) v
       WHERE NOT EXISTS (
         SELECT 1 FROM comprobante_serie x
         WHERE x.id_sucursal = ? AND x.tipo = v.tipo AND x.serie = v.serie AND x.estado_registro = 'ACTIVO'
       )`,
      [idSucursal, userId, idSucursal],
    );
  }

  private normalize(dto: CreateSucursalDto | UpdateSucursalDto) {
    const sunat = dto.codigo_establecimiento_sunat != null
      ? String(dto.codigo_establecimiento_sunat).trim()
      : '';
    const ruc = String(dto.ruc || '').replace(/\D/g, '');
    return {
      codigo: String(dto.codigo || '').trim().toUpperCase(),
      nombre: String(dto.nombre || '').trim().toUpperCase(),
      direccion: dto.direccion?.trim() || null,
      telefono: dto.telefono?.trim() || null,
      tipo: dto.tipo === 'ALMACEN' ? 'ALMACEN' : 'LOCAL',
      ruc: ruc || null,
      razon_social: dto.razon_social?.trim().toUpperCase() || null,
      nombre_comercial: dto.nombre_comercial?.trim().toUpperCase() || null,
      ubigeo: dto.ubigeo?.trim() || null,
      departamento: dto.departamento?.trim().toUpperCase() || null,
      provincia: dto.provincia?.trim().toUpperCase() || null,
      distrito: dto.distrito?.trim().toUpperCase() || null,
      direccion_fiscal: dto.direccion_fiscal?.trim() || dto.direccion?.trim() || null,
      codigo_establecimiento_sunat: sunat || null,
      nubefact_url: dto.nubefact_url?.trim() || null,
      nubefact_token: dto.nubefact_token?.trim() || null,
    };
  }

  private toPositiveNumber(value: any, fallback: number) {
    const n = Number(value);
    return n > 0 && !Number.isNaN(n) ? n : fallback;
  }

  private assertId(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('ID inválido');
  }
}
