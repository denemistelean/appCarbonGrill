import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';

type MaestroKey = 'unidades-medida' | 'categorias' | 'porciones';

const MAESTROS = {
  'unidades-medida': {
    table: 'unidad_medida',
    pk: 'id_unidad_medida',
    columns: ['codigo', 'nombre'],
    select: 'id_unidad_medida, codigo, nombre, estado_registro',
    search: ['codigo', 'nombre'],
    order: 'codigo ASC',
    dependiente: { tabla: 'insumo', fk: 'id_unidad_medida' },
  },
  categorias: {
    table: 'producto_categoria',
    pk: 'id_categoria',
    columns: ['nombre', 'orden'],
    select: 'id_categoria, nombre, orden, estado_registro',
    search: ['nombre'],
    order: 'orden ASC, nombre ASC',
    dependiente: { tabla: 'producto', fk: 'id_categoria' },
  },
  porciones: {
    table: 'producto_porcion',
    pk: 'id_porcion',
    columns: ['nombre', 'precio', 'aplica_estacion', 'orden'],
    select: 'id_porcion, nombre, precio, aplica_estacion, orden, estado_registro',
    search: ['nombre'],
    order: 'orden ASC, nombre ASC',
    dependiente: { tabla: 'pedido_item', fk: 'id_porcion' },
  },
} as const;

@Injectable()
export class MaestrosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async findAll(key: MaestroKey, query: any) {
    this.guardQuery(query);
    const cfg = MAESTROS[key];
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE estado_registro = 'ACTIVO'`;

    if (query.search) {
      const term = `%${String(query.search).trim()}%`;
      where += ` AND (${cfg.search.map((col) => `${col} LIKE ?`).join(' OR ')})`;
      params.push(...cfg.search.map(() => term));
    }

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT ${cfg.select} FROM ${cfg.table} ${where} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total FROM ${cfg.table} ${where}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async lista(key: MaestroKey) {
    const cfg = MAESTROS[key];
    return this.dataSource.query(
      `SELECT ${cfg.select} FROM ${cfg.table} WHERE estado_registro = 'ACTIVO' ORDER BY ${cfg.order} LIMIT 500`,
    );
  }

  async findOne(key: MaestroKey, id: number) {
    this.assertId(id);
    const cfg = MAESTROS[key];
    const [row] = await this.dataSource.query(
      `SELECT ${cfg.select} FROM ${cfg.table} WHERE ${cfg.pk} = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Registro no encontrado');
    return row;
  }

  async create(key: MaestroKey, dto: any, userId: number) {
    const cfg = MAESTROS[key];
    const payload = this.normalize(key, dto);
    const columns = [...cfg.columns, 'id_usuario_crea'];
    const values = [...cfg.columns.map((col) => payload[col]), userId];
    const result = await this.dataSource.query(
      `INSERT INTO ${cfg.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values,
    );
    const id = Number(result.insertId);
    const created = await this.findOne(key, id);
    await this.auditoriaService.registrar(cfg.table, id, 'CREAR', userId, null, created);
    return created;
  }

  async update(key: MaestroKey, id: number, dto: any, userId: number) {
    this.assertId(id);
    const cfg = MAESTROS[key];
    const oldValues = await this.findOne(key, id);
    const payload = this.normalize(key, { ...oldValues, ...dto });
    const sets = cfg.columns.map((col) => `${col} = ?`).join(', ');
    const result = await this.dataSource.query(
      `UPDATE ${cfg.table} SET ${sets}, id_usuario_mod = ? WHERE ${cfg.pk} = ? AND estado_registro = 'ACTIVO'`,
      [...cfg.columns.map((col) => payload[col]), userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Registro no encontrado');
    const updated = await this.findOne(key, id);
    await this.auditoriaService.registrar(cfg.table, id, 'ACTUALIZAR', userId, oldValues, updated);
    return updated;
  }

  async remove(key: MaestroKey, id: number, userId: number) {
    this.assertId(id);
    const cfg = MAESTROS[key];
    const oldValues = await this.findOne(key, id);
    const [deps] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM ${cfg.dependiente.tabla} WHERE ${cfg.dependiente.fk} = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (Number(deps?.total || 0) > 0) {
      throw new ConflictException('No se puede eliminar: tiene registros relacionados');
    }
    const result = await this.dataSource.query(
      `UPDATE ${cfg.table} SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE ${cfg.pk} = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Registro no encontrado');
    await this.auditoriaService.registrar(cfg.table, id, 'ELIMINAR', userId, oldValues, null);
    return { [cfg.pk]: id };
  }

  private normalize(key: MaestroKey, dto: any) {
    if (key === 'unidades-medida') {
      return {
        codigo: String(dto.codigo || '').trim().toUpperCase(),
        nombre: String(dto.nombre || '').trim().toUpperCase(),
      };
    }
    if (key === 'porciones') {
      const precio = Math.round(Number(dto.precio || 0) * 100) / 100;
      const orden = Number(dto.orden);
      const est = String(dto.aplica_estacion || 'TODAS').toUpperCase();
      return {
        nombre: String(dto.nombre || '').trim().toUpperCase(),
        precio: Number.isNaN(precio) || precio < 0 ? 0 : precio,
        aplica_estacion: ['TODAS', 'PARRILLA', 'COCINA', 'BAR'].includes(est) ? est : 'TODAS',
        orden: Number.isNaN(orden) || orden < 0 ? 0 : Math.trunc(orden),
      };
    }
    const orden = Number(dto.orden);
    return {
      nombre: String(dto.nombre || '').trim().toUpperCase(),
      orden: Number.isNaN(orden) || orden < 0 ? 0 : Math.trunc(orden),
    };
  }

  private guardQuery(query: any) {
    if (Array.isArray(query?.page) || Array.isArray(query?.limit) || Array.isArray(query?.search)) {
      throw new BadRequestException('Param inválido');
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
