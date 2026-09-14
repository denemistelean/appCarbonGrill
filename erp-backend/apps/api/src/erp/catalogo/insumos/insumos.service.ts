import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import { CreateInsumoDto, UpdateInsumoDto } from './insumos.dto';

@Injectable()
export class InsumosService {
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
    let where = `WHERE i.estado_registro = 'ACTIVO'`;

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (i.nombre LIKE ? OR um.codigo LIKE ? OR um.nombre LIKE ?)`;
      params.push(search, search, search);
    }

    const from = `
      FROM insumo i
      INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT i.id_insumo, i.nombre, i.id_unidad_medida, i.costo_unitario, i.precio_venta, i.estado_registro,
                um.codigo AS unidad_codigo, um.nombre AS unidad
         ${from}
         ORDER BY i.nombre ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async lista() {
    return this.dataSource.query(
      `SELECT i.id_insumo, i.nombre, i.id_unidad_medida, i.costo_unitario, i.precio_venta,
              um.codigo AS unidad_codigo, um.nombre AS unidad,
              CONCAT(i.nombre, ' (', um.codigo, ')') AS etiqueta
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE i.estado_registro = 'ACTIVO'
       ORDER BY i.nombre ASC
       LIMIT 500`,
    );
  }

  async listaUnidades() {
    return this.dataSource.query(
      `SELECT id_unidad_medida, codigo, nombre
       FROM unidad_medida
       WHERE estado_registro = 'ACTIVO'
       ORDER BY codigo ASC
       LIMIT 500`,
    );
  }

  async findOne(id: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT i.id_insumo, i.nombre, i.id_unidad_medida, i.costo_unitario, i.precio_venta, i.estado_registro,
              um.codigo AS unidad_codigo, um.nombre AS unidad
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE i.id_insumo = ? AND i.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Insumo no encontrado');
    return row;
  }

  async create(dto: CreateInsumoDto, userId: number) {
    const payload = await this.normalize(dto);
    const result = await this.dataSource.query(
      `INSERT INTO insumo (nombre, id_unidad_medida, costo_unitario, precio_venta, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.nombre, payload.id_unidad_medida, payload.costo_unitario, payload.precio_venta, userId],
    );
    const id = Number(result.insertId);
    await this.dataSource.query(
      `INSERT INTO insumo_stock (id_insumo, id_sucursal, stock_actual, stock_minimo, costo_promedio, id_usuario_crea)
       SELECT ?, s.id_sucursal, 0, 0, ?, ?
       FROM sucursal s
       WHERE s.estado_registro = 'ACTIVO'`,
      [id, payload.costo_unitario, userId],
    );
    const created = await this.findOne(id);
    await this.auditoriaService.registrar('insumo', id, 'CREAR', userId, null, created);
    return created;
  }

  async update(id: number, dto: UpdateInsumoDto, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const payload = await this.normalize({ ...oldValues, ...dto });
    const result = await this.dataSource.query(
      `UPDATE insumo
       SET nombre = ?, id_unidad_medida = ?, costo_unitario = ?, precio_venta = ?, id_usuario_mod = ?
       WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
      [payload.nombre, payload.id_unidad_medida, payload.costo_unitario, payload.precio_venta, userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Insumo no encontrado');
    const updated = await this.findOne(id);
    await this.auditoriaService.registrar('insumo', id, 'ACTUALIZAR', userId, oldValues, updated);
    return updated;
  }

  async remove(id: number, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const [deps] = await this.dataSource.query(
      `SELECT COUNT(*) AS total
       FROM receta
       WHERE id_insumo = ? AND estado_registro = 'ACTIVO' AND vigente_hasta IS NULL`,
      [id],
    );
    if (Number(deps?.total || 0) > 0) {
      throw new ConflictException('No se puede eliminar: está en una receta vigente');
    }
    const result = await this.dataSource.query(
      `UPDATE insumo SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Insumo no encontrado');
    await this.auditoriaService.registrar('insumo', id, 'ELIMINAR', userId, oldValues, null);
    return { id_insumo: id };
  }

  private async normalize(dto: CreateInsumoDto | UpdateInsumoDto) {
    const idUnidad = Number(dto.id_unidad_medida);
    if (!idUnidad || Number.isNaN(idUnidad)) throw new BadRequestException('Unidad de medida inválida');
    const [um] = await this.dataSource.query(
      `SELECT id_unidad_medida FROM unidad_medida WHERE id_unidad_medida = ? AND estado_registro = 'ACTIVO'`,
      [idUnidad],
    );
    if (!um) throw new BadRequestException('Unidad de medida no encontrada');
    return {
      nombre: String(dto.nombre || '').trim().toUpperCase(),
      id_unidad_medida: idUnidad,
      costo_unitario: Math.round(Number(dto.costo_unitario || 0) * 100) / 100,
      precio_venta: Math.round(Number(dto.precio_venta ?? 0) * 100) / 100,
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
