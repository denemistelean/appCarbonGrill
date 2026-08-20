import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource, QueryRunner } from 'typeorm';
import { ComboItemDto, CreateProductoDto, ProductoSucursalItemDto, RecetaItemDto, UpdateProductoDto } from './productos.dto';

const ESTACIONES = ['COCINA', 'PARRILLA', 'BAR', 'NINGUNA'] as const;

@Injectable()
export class ProductosService {
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
    let where = `WHERE p.estado_registro = 'ACTIVO'`;

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (p.codigo LIKE ? OR p.nombre LIKE ? OR c.nombre LIKE ?)`;
      params.push(search, search, search);
    }
    if (query.id_categoria) {
      const idCat = Number(query.id_categoria);
      if (!idCat || Number.isNaN(idCat) || Array.isArray(query.id_categoria)) {
        throw new BadRequestException('Param inválido');
      }
      where += ` AND p.id_categoria = ?`;
      params.push(idCat);
    }

    const from = `
      FROM producto p
      INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT p.id_producto, p.codigo, p.nombre, p.id_categoria, p.precio, p.es_combo,
                p.estacion, p.descripcion, p.estado_registro, c.nombre AS categoria
         ${from}
         ORDER BY p.nombre ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async lista(query: any = {}) {
    const params: any[] = [];
    let where = `WHERE p.estado_registro = 'ACTIVO'`;
    if (query.es_combo === '0' || query.es_combo === 0) {
      where += ` AND p.es_combo = 0`;
    }
    return this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.precio, p.es_combo, p.estacion,
              CONCAT(p.codigo, ' — ', p.nombre) AS etiqueta
       FROM producto p
       ${where}
       ORDER BY p.nombre ASC
       LIMIT 500`,
      params,
    );
  }

  async findOne(id: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.id_categoria, p.precio, p.es_combo,
              p.estacion, p.descripcion, p.estado_registro, c.nombre AS categoria
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       WHERE p.id_producto = ? AND p.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Producto no encontrado');

    const receta = await this.dataSource.query(
      `SELECT r.id_receta, r.id_insumo, r.cantidad, i.nombre AS insumo, um.codigo AS unidad_codigo
       FROM receta r
       INNER JOIN insumo i ON i.id_insumo = r.id_insumo
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE r.id_producto = ? AND r.estado_registro = 'ACTIVO' AND r.vigente_hasta IS NULL
       ORDER BY i.nombre ASC`,
      [id],
    );

    const comboItems = await this.dataSource.query(
      `SELECT ci.id_combo_item, ci.id_producto, ci.cantidad, p.codigo, p.nombre
       FROM combo_item ci
       INNER JOIN producto p ON p.id_producto = ci.id_producto
       WHERE ci.id_combo = ? AND ci.estado_registro = 'ACTIVO'
       ORDER BY p.nombre ASC`,
      [id],
    );

    const sucursales = await this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre,
              COALESCE(ps.disponible, 1) AS disponible,
              ps.precio_override, ps.id_producto_sucursal
       FROM sucursal s
       LEFT JOIN producto_sucursal ps
         ON ps.id_sucursal = s.id_sucursal AND ps.id_producto = ? AND ps.estado_registro = 'ACTIVO'
       WHERE s.estado_registro = 'ACTIVO'
       ORDER BY s.nombre ASC`,
      [id],
    );

    return { ...row, receta, combo_items: comboItems, sucursales };
  }

  async create(dto: CreateProductoDto, userId: number) {
    const payload = await this.normalizeCabecera(dto);
    const receta = Number(payload.es_combo) === 1 ? [] : await this.validarReceta(dto.receta || []);
    const comboItems = Number(payload.es_combo) === 1 ? await this.validarCombo(dto.combo_items || [], null) : [];
    const sucursales = await this.validarSucursales(dto.sucursales);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await qr.query(
        `INSERT INTO producto (codigo, nombre, id_categoria, precio, es_combo, estacion, descripcion, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.codigo, payload.nombre, payload.id_categoria, payload.precio, payload.es_combo, payload.estacion, payload.descripcion, userId],
      );
      const id = Number(result.insertId);
      await this.persistirReceta(qr, id, receta, userId);
      await this.persistirCombo(qr, id, comboItems, userId);
      await this.persistirSucursales(qr, id, sucursales, userId);
      await this.auditoriaService.registrarConTransaccion(qr, 'producto', id, 'CREAR', userId, null, { id, ...payload });
      await qr.commitTransaction();
      return this.findOne(id);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async update(id: number, dto: UpdateProductoDto, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const merged = { ...oldValues, ...dto };
    const payload = await this.normalizeCabecera(merged);
    const receta = Number(payload.es_combo) === 1 ? [] : await this.validarReceta(dto.receta ?? oldValues.receta ?? []);
    const comboItems = Number(payload.es_combo) === 1
      ? await this.validarCombo(dto.combo_items ?? oldValues.combo_items ?? [], id)
      : [];
    const sucursales = await this.validarSucursales(dto.sucursales ?? oldValues.sucursales);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await qr.query(
        `UPDATE producto
         SET codigo = ?, nombre = ?, id_categoria = ?, precio = ?, es_combo = ?, estacion = ?, descripcion = ?, id_usuario_mod = ?
         WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
        [payload.codigo, payload.nombre, payload.id_categoria, payload.precio, payload.es_combo, payload.estacion, payload.descripcion, userId, id],
      );
      if (result.affectedRows === 0) throw new NotFoundException('Producto no encontrado');
      await this.persistirReceta(qr, id, receta, userId);
      await this.persistirCombo(qr, id, comboItems, userId);
      await this.persistirSucursales(qr, id, sucursales, userId);
      await this.auditoriaService.registrarConTransaccion(qr, 'producto', id, 'ACTUALIZAR', userId, oldValues, { id, ...payload });
      await qr.commitTransaction();
      return this.findOne(id);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async remove(id: number, userId: number) {
    this.assertId(id);
    const oldValues = await this.findOne(id);
    const [enCombo] = await this.dataSource.query(
      `SELECT COUNT(*) AS total
       FROM combo_item ci
       INNER JOIN producto combo ON combo.id_producto = ci.id_combo
       WHERE ci.id_producto = ? AND ci.estado_registro = 'ACTIVO' AND combo.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (Number(enCombo?.total || 0) > 0) {
      throw new ConflictException('No se puede eliminar: forma parte de un combo activo');
    }
    const result = await this.dataSource.query(
      `UPDATE producto SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (result.affectedRows === 0) throw new NotFoundException('Producto no encontrado');
    await this.auditoriaService.registrar('producto', id, 'ELIMINAR', userId, oldValues, null);
    return { id_producto: id };
  }

  private async persistirReceta(qr: QueryRunner, idProducto: number, items: RecetaItemDto[], userId: number) {
    await qr.query(
      `UPDATE receta SET vigente_hasta = NOW(), id_usuario_mod = ?
       WHERE id_producto = ? AND estado_registro = 'ACTIVO' AND vigente_hasta IS NULL`,
      [userId, idProducto],
    );
    for (const item of items) {
      await qr.query(
        `INSERT INTO receta (id_producto, id_insumo, cantidad, id_usuario_crea) VALUES (?, ?, ?, ?)`,
        [idProducto, item.id_insumo, item.cantidad, userId],
      );
    }
  }

  private async persistirCombo(qr: QueryRunner, idCombo: number, items: ComboItemDto[], userId: number) {
    await qr.query(
      `UPDATE combo_item SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_combo = ? AND estado_registro = 'ACTIVO'`,
      [userId, idCombo],
    );
    for (const item of items) {
      const [existe] = await qr.query(
        `SELECT id_combo_item FROM combo_item WHERE id_combo = ? AND id_producto = ?`,
        [idCombo, item.id_producto],
      );
      if (existe) {
        await qr.query(
          `UPDATE combo_item SET cantidad = ?, estado_registro = 'ACTIVO', id_usuario_mod = ?
           WHERE id_combo_item = ?`,
          [item.cantidad, userId, existe.id_combo_item],
        );
      } else {
        await qr.query(
          `INSERT INTO combo_item (id_combo, id_producto, cantidad, id_usuario_crea) VALUES (?, ?, ?, ?)`,
          [idCombo, item.id_producto, item.cantidad, userId],
        );
      }
    }
  }

  private async persistirSucursales(qr: QueryRunner, idProducto: number, items: ProductoSucursalItemDto[], userId: number) {
    const sucursales = items.length
      ? items
      : (await qr.query(
          `SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO'`,
        )).map((s: any) => ({ id_sucursal: Number(s.id_sucursal), disponible: 1, precio_override: null }));

    for (const item of sucursales) {
      const [existe] = await qr.query(
        `SELECT id_producto_sucursal FROM producto_sucursal WHERE id_producto = ? AND id_sucursal = ?`,
        [idProducto, item.id_sucursal],
      );
      const override = item.precio_override === undefined || item.precio_override === null || item.precio_override === ('' as any)
        ? null
        : Number(item.precio_override);
      if (existe) {
        await qr.query(
          `UPDATE producto_sucursal
           SET disponible = ?, precio_override = ?, estado_registro = 'ACTIVO', id_usuario_mod = ?
           WHERE id_producto_sucursal = ?`,
          [Number(item.disponible) ? 1 : 0, override, userId, existe.id_producto_sucursal],
        );
      } else {
        await qr.query(
          `INSERT INTO producto_sucursal (id_producto, id_sucursal, disponible, precio_override, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?)`,
          [idProducto, item.id_sucursal, Number(item.disponible) ? 1 : 0, override, userId],
        );
      }
    }
  }

  private async normalizeCabecera(dto: CreateProductoDto | UpdateProductoDto) {
    const idCategoria = Number(dto.id_categoria);
    if (!idCategoria || Number.isNaN(idCategoria)) throw new BadRequestException('Categoría inválida');
    const [cat] = await this.dataSource.query(
      `SELECT id_categoria FROM producto_categoria WHERE id_categoria = ? AND estado_registro = 'ACTIVO'`,
      [idCategoria],
    );
    if (!cat) throw new BadRequestException('Categoría no encontrada');
    const estacion = String(dto.estacion || 'COCINA').toUpperCase();
    if (!ESTACIONES.includes(estacion as any)) throw new BadRequestException('Estación inválida');
    const esCombo = Number(dto.es_combo) ? 1 : 0;
    return {
      codigo: String(dto.codigo || '').trim().toUpperCase(),
      nombre: String(dto.nombre || '').trim().toUpperCase(),
      id_categoria: idCategoria,
      precio: Math.round(Number(dto.precio || 0) * 100) / 100,
      es_combo: esCombo,
      estacion,
      descripcion: dto.descripcion?.trim() || null,
    };
  }

  private async validarReceta(items: RecetaItemDto[]) {
    const seen = new Set<number>();
    const clean: RecetaItemDto[] = [];
    for (const raw of items || []) {
      const idInsumo = Number(raw.id_insumo);
      const cantidad = Number(raw.cantidad);
      if (!idInsumo || Number.isNaN(idInsumo) || !(cantidad > 0)) {
        throw new BadRequestException('Receta inválida: insumo y cantidad son obligatorios');
      }
      if (seen.has(idInsumo)) throw new BadRequestException('La receta no puede repetir el mismo insumo');
      seen.add(idInsumo);
      const [insumo] = await this.dataSource.query(
        `SELECT id_insumo FROM insumo WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
        [idInsumo],
      );
      if (!insumo) throw new BadRequestException('Insumo de receta no encontrado');
      clean.push({ id_insumo: idInsumo, cantidad: Math.round(cantidad * 10000) / 10000 });
    }
    return clean;
  }

  private async validarCombo(items: ComboItemDto[], idCombo: number | null) {
    if (!items.length) throw new BadRequestException('Un combo debe incluir al menos un producto');
    const seen = new Set<number>();
    const clean: ComboItemDto[] = [];
    for (const raw of items) {
      const idProducto = Number(raw.id_producto);
      const cantidad = Number(raw.cantidad);
      if (!idProducto || Number.isNaN(idProducto) || !(cantidad > 0)) {
        throw new BadRequestException('Combo inválido: producto y cantidad son obligatorios');
      }
      if (idCombo && idProducto === idCombo) throw new BadRequestException('Un combo no puede incluirse a sí mismo');
      if (seen.has(idProducto)) throw new BadRequestException('El combo no puede repetir el mismo producto');
      seen.add(idProducto);
      const [prod] = await this.dataSource.query(
        `SELECT id_producto, es_combo FROM producto WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
        [idProducto],
      );
      if (!prod) throw new BadRequestException('Producto del combo no encontrado');
      if (Number(prod.es_combo) === 1) throw new BadRequestException('Un combo solo puede incluir platos, no otros combos');
      clean.push({ id_producto: idProducto, cantidad: Math.round(cantidad * 1000) / 1000 });
    }
    return clean;
  }

  private async validarSucursales(items?: ProductoSucursalItemDto[]) {
    if (!items?.length) return [];
    const seen = new Set<number>();
    const clean: ProductoSucursalItemDto[] = [];
    for (const raw of items) {
      const idSucursal = Number(raw.id_sucursal);
      if (!idSucursal || Number.isNaN(idSucursal) || seen.has(idSucursal)) {
        throw new BadRequestException('Sucursal inválida en disponibilidad');
      }
      seen.add(idSucursal);
      const [suc] = await this.dataSource.query(
        `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
        [idSucursal],
      );
      if (!suc) throw new BadRequestException('Sucursal no encontrada');
      const overrideRaw = raw.precio_override as any;
      clean.push({
        id_sucursal: idSucursal,
        disponible: Number(raw.disponible) ? 1 : 0,
        precio_override: overrideRaw === null || overrideRaw === undefined || overrideRaw === ''
          ? null
          : Math.round(Number(overrideRaw) * 100) / 100,
      });
    }
    return clean;
  }

  private toPositiveNumber(value: any, fallback: number) {
    const n = Number(value);
    return n > 0 && !Number.isNaN(n) ? n : fallback;
  }

  private assertId(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('ID inválido');
  }
}
