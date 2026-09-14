import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService, UploadService } from '@app/common';
import { DataSource } from 'typeorm';
import { AlcanceService } from '../../common/auth/alcance.service';
import { RequestUser } from '../../common/auth/request-user.interface';
import { ActualizarVitrinaDto, CrearTagDto, GuardarProductoVitrinaDto } from './carta-vitrina.dto';

@Injectable()
export class CartaVitrinaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly uploadService: UploadService,
    private readonly alcanceService: AlcanceService,
  ) {}

  async publica(query: any) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const idSucursal = await this.resolverSucursalPublica(query.id_sucursal);
    const config = await this.obtenerConfig(idSucursal);
    const tema = String(config?.tema || 'carbon_grill');
    const [sucursal] = await this.dataSource.query(
      `SELECT id_sucursal, codigo, nombre, nombre_comercial, logo_path
       FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    const categorias = await this.dataSource.query(
      `SELECT c.id_categoria, c.codigo, c.nombre, c.icono, c.orden
       FROM producto_categoria c
       WHERE c.estado_registro = 'ACTIVO' AND c.codigo IS NOT NULL AND c.codigo <> ''
         AND (
           (? = 'don_papas' AND LEFT(c.codigo, 3) = 'dp_')
           OR (? <> 'don_papas' AND LEFT(c.codigo, 3) <> 'dp_')
         )
       ORDER BY c.orden ASC, c.nombre ASC`,
      [tema, tema],
    );
    const tags = await this.dataSource.query(
      `SELECT tipo, nombre, orden FROM carta_vitrina_tag
       WHERE estado_registro = 'ACTIVO' AND id_sucursal = ?
       ORDER BY tipo ASC, orden ASC, id_tag ASC`,
      [idSucursal],
    );
    const items = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.descripcion, p.imagen,
              COALESCE(NULLIF(ps.orden_carta, 0), p.orden_carta, 0) AS orden_carta,
              c.codigo AS categoria, c.nombre AS categoria_nombre, c.icono,
              COALESCE(ps.precio_override, p.precio) AS precio,
              p.precio_junior,
              COALESCE(ps.disponible, 1) AS disponible
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       INNER JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO' AND ps.visible_carta = 1
       ORDER BY c.orden ASC, orden_carta ASC, p.nombre ASC`,
      [idSucursal],
    );
    return {
      id_sucursal: idSucursal,
      sucursal: sucursal
        ? {
            id_sucursal: Number(sucursal.id_sucursal),
            codigo: sucursal.codigo,
            nombre: sucursal.nombre,
            nombre_comercial: sucursal.nombre_comercial || sucursal.nombre,
            logo_path: sucursal.logo_path || null,
            logo_url: sucursal.logo_path ? `/uploads/${String(sucursal.logo_path).replace(/^\/+/, '')}` : null,
          }
        : null,
      config: {
        nombre: config?.nombre || sucursal?.nombre_comercial || sucursal?.nombre || 'Carta',
        tagline: config?.tagline || '',
        promo: config?.promo || '',
        moneda: config?.moneda || 'S/',
        tema,
      },
      categorias,
      sabores: tags.filter((t: any) => t.tipo === 'SABOR').map((t: any) => t.nombre),
      chorizos: tags.filter((t: any) => t.tipo === 'CHORIZO').map((t: any) => t.nombre),
      productos: items,
    };
  }

  async adminResumen(user: RequestUser, query: any) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const idSucursal = await this.resolverSucursalAdmin(user, query.id_sucursal);
    await this.ensureCartaConfig(idSucursal, user.idUsuario);
    const publica = await this.publica({ id_sucursal: idSucursal });
    const tema = String(publica?.config?.tema || 'carbon_grill');
    const tags = await this.dataSource.query(
      `SELECT id_tag, tipo, nombre, orden FROM carta_vitrina_tag
       WHERE estado_registro = 'ACTIVO' AND id_sucursal = ?
       ORDER BY tipo ASC, orden ASC`,
      [idSucursal],
    );
    const productos = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.precio, p.precio_junior, p.descripcion, p.imagen,
              COALESCE(ps.visible_carta, 0) AS visible_carta,
              COALESCE(NULLIF(ps.orden_carta, 0), p.orden_carta, 0) AS orden_carta,
              p.estacion, p.id_categoria,
              c.codigo AS categoria, c.nombre AS categoria_nombre,
              COALESCE(ps.disponible, 1) AS disponible,
              COALESCE(ps.precio_override, p.precio) AS precio_local
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO'
         AND (
           COALESCE(ps.visible_carta, 0) = 1
           OR (? = 'don_papas' AND p.codigo LIKE 'DP-%')
           OR (? <> 'don_papas' AND p.codigo LIKE 'CARTA-%')
         )
         AND (
           (? = 'don_papas' AND LEFT(c.codigo, 3) = 'dp_')
           OR (? <> 'don_papas' AND LEFT(c.codigo, 3) <> 'dp_')
         )
       ORDER BY COALESCE(ps.visible_carta, 0) DESC, c.orden ASC, orden_carta ASC`,
      [idSucursal, tema, tema, tema, tema],
    );
    const sucursales = await this.listarLocalesAdmin(user);
    return {
      ...publica,
      tags,
      productos: productos.map((p: any) => ({ ...p, precio: p.precio_local ?? p.precio })),
      sucursales,
      id_sucursal: idSucursal,
      usuario: user.idUsuario,
    };
  }

  async guardarConfig(dto: ActualizarVitrinaDto, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal ?? dto.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const row = await this.ensureCartaConfig(idSucursal, user.idUsuario);
    await this.dataSource.query(
      `UPDATE carta_vitrina SET nombre = ?, tagline = ?, promo = ?, moneda = ?, tema = ?, id_usuario_mod = ?
       WHERE id_carta_vitrina = ?`,
      [
        dto.nombre.trim(),
        dto.tagline?.trim() || null,
        dto.promo?.trim() || null,
        dto.moneda?.trim() || 'S/',
        dto.tema || row.tema || 'carbon_grill',
        user.idUsuario,
        row.id_carta_vitrina,
      ],
    );
    await this.auditoriaService.registrar('carta_vitrina', row.id_carta_vitrina, 'ACTUALIZAR', user.idUsuario, row, dto);
    return this.publica({ id_sucursal: idSucursal });
  }

  async crearTag(dto: CrearTagDto, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal ?? dto.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    await this.ensureCartaConfig(idSucursal, user.idUsuario);
    const ins = await this.dataSource.query(
      `INSERT INTO carta_vitrina_tag (id_sucursal, tipo, nombre, orden, id_usuario_crea) VALUES (?, ?, ?, ?, ?)`,
      [idSucursal, dto.tipo, dto.nombre.trim(), dto.orden ?? 0, user.idUsuario],
    );
    const id = Number(ins.insertId);
    await this.auditoriaService.registrar('carta_vitrina_tag', id, 'CREAR', user.idUsuario, null, { ...dto, id_sucursal: idSucursal });
    return this.findTag(id, idSucursal);
  }

  async eliminarTag(id: number, user: RequestUser, query: any) {
    this.assertId(id);
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const old = await this.findTag(id, idSucursal);
    await this.dataSource.query(
      `UPDATE carta_vitrina_tag SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_tag = ? AND id_sucursal = ?`,
      [user.idUsuario, id, idSucursal],
    );
    await this.auditoriaService.registrar('carta_vitrina_tag', id, 'ELIMINAR', user.idUsuario, old, null);
    return { id_tag: id };
  }

  async guardarProducto(dto: GuardarProductoVitrinaDto, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal ?? dto.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    await this.ensureCartaConfig(idSucursal, user.idUsuario);

    const [cat] = await this.dataSource.query(
      `SELECT id_categoria FROM producto_categoria WHERE id_categoria = ? AND estado_registro = 'ACTIVO'`,
      [dto.id_categoria],
    );
    if (!cat) throw new BadRequestException('Categoría no encontrada');
    const nombre = dto.nombre.trim();
    const desc = dto.descripcion?.trim() || null;
    const estacion = dto.estacion || 'PARRILLA';
    const visible = dto.visible_carta == null ? 1 : Number(dto.visible_carta);
    const disponible = dto.disponible == null ? 1 : Number(dto.disponible);
    const imagen = dto.imagen_url?.trim() || null;
    const ordenCarta = dto.orden_carta ?? 999;
    const precioJunior =
      dto.precio_junior == null || dto.precio_junior === ('' as any)
        ? null
        : this.round2(Number(dto.precio_junior));
    let id = Number(dto.id_producto || 0);

    if (id) {
      const [old] = await this.dataSource.query(
        `SELECT * FROM producto WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
        [id],
      );
      if (!old) throw new NotFoundException('Producto no encontrado');
      await this.dataSource.query(
        `UPDATE producto
         SET nombre = ?, id_categoria = ?, precio = ?, precio_junior = ?, descripcion = ?,
             imagen = COALESCE(?, imagen), estacion = ?, id_usuario_mod = ?
         WHERE id_producto = ?`,
        [nombre, dto.id_categoria, this.round2(dto.precio), precioJunior, desc, imagen, estacion, user.idUsuario, id],
      );
      await this.auditoriaService.registrar('producto', id, 'ACTUALIZAR', user.idUsuario, old, dto);
    } else {
      const codigo = await this.siguienteCodigo(idSucursal);
      const ins = await this.dataSource.query(
        `INSERT INTO producto
           (codigo, nombre, id_categoria, precio, precio_junior, es_combo, estacion, descripcion, imagen, visible_carta, orden_carta, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?)`,
        [codigo, nombre, dto.id_categoria, this.round2(dto.precio), precioJunior, estacion, desc, imagen, ordenCarta, user.idUsuario],
      );
      id = Number(ins.insertId);
      const sucursales = await this.dataSource.query(`SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO'`);
      for (const s of sucursales) {
        await this.dataSource.query(
          `INSERT INTO producto_sucursal (id_producto, id_sucursal, disponible, visible_carta, orden_carta, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, s.id_sucursal, s.id_sucursal === idSucursal && disponible ? 1 : 0, s.id_sucursal === idSucursal && visible ? 1 : 0, ordenCarta, user.idUsuario],
        );
      }
      await this.auditoriaService.registrar('producto', id, 'CREAR', user.idUsuario, null, { codigo, ...dto });
    }

    await this.upsertProductoSucursal(id, idSucursal, {
      visible_carta: visible,
      disponible,
      orden_carta: ordenCarta,
      precio: this.round2(dto.precio),
    }, user.idUsuario);
    return this.findProducto(id, idSucursal);
  }

  async toggleDisponible(id: number, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const p = await this.findProducto(id, idSucursal);
    const next = Number(p.disponible) ? 0 : 1;
    await this.setDisponibleSucursal(id, idSucursal, next, user.idUsuario);
    return this.findProducto(id, idSucursal);
  }

  async quitarDeCarta(id: number, user: RequestUser, query: any) {
    return this.setVisibleCarta(id, 0, user, query);
  }

  async restaurarEnCarta(id: number, user: RequestUser, query: any) {
    return this.setVisibleCarta(id, 1, user, query);
  }

  private async setVisibleCarta(id: number, visible: number, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const old = await this.findProducto(id, idSucursal);
    await this.upsertProductoSucursal(id, idSucursal, { visible_carta: visible ? 1 : 0, disponible: old.disponible ?? 1 }, user.idUsuario);
    await this.auditoriaService.registrar('producto_sucursal', id, 'ACTUALIZAR', user.idUsuario, old, { visible_carta: visible ? 1 : 0, id_sucursal: idSucursal });
    return this.findProducto(id, idSucursal);
  }

  async subirImagen(id: number, file: Express.Multer.File, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const old = await this.findProducto(id, idSucursal);
    const rel = this.uploadService.saveImage('carta', file, `prod_${id}`);
    if (old.imagen && !String(old.imagen).startsWith('http')) {
      this.uploadService.deleteIfExists(old.imagen);
    }
    await this.dataSource.query(
      `UPDATE producto SET imagen = ?, id_usuario_mod = ? WHERE id_producto = ?`,
      [rel, user.idUsuario, id],
    );
    await this.auditoriaService.registrar('producto', id, 'ACTUALIZAR', user.idUsuario, { imagen: old.imagen }, { imagen: rel });
    return this.findProducto(id, idSucursal);
  }

  async quitarImagen(id: number, user: RequestUser, query: any) {
    const idSucursal = await this.resolverSucursalAdmin(user, query?.id_sucursal);
    await this.alcanceService.assertAccesoSucursal(idSucursal, user);
    const old = await this.findProducto(id, idSucursal);
    if (old.imagen && !String(old.imagen).startsWith('http')) {
      this.uploadService.deleteIfExists(old.imagen);
    }
    await this.dataSource.query(
      `UPDATE producto SET imagen = NULL, id_usuario_mod = ? WHERE id_producto = ?`,
      [user.idUsuario, id],
    );
    return this.findProducto(id, idSucursal);
  }

  private async listarLocalesAdmin(user: RequestUser) {
    const alcance = await this.alcanceService.resolverAlcance(user);
    if (!alcance.esSuperadmin) {
      const [s] = await this.dataSource.query(
        `SELECT id_sucursal, codigo, nombre, nombre_comercial FROM sucursal
         WHERE id_sucursal = ? AND estado_registro = 'ACTIVO' AND tipo = 'LOCAL'`,
        [alcance.idSucursal],
      );
      return s ? [s] : [];
    }
    return this.dataSource.query(
      `SELECT id_sucursal, codigo, nombre, nombre_comercial FROM sucursal
       WHERE estado_registro = 'ACTIVO' AND tipo = 'LOCAL'
       ORDER BY nombre ASC`,
    );
  }

  private async resolverSucursalAdmin(user: RequestUser, raw: any): Promise<number> {
    const alcance = await this.alcanceService.resolverAlcance(user);
    const id = this.alcanceService.forzarSucursal(raw, alcance);
    if (id) return id;
    if (alcance.idSucursal) return alcance.idSucursal;
    const [s] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO' AND tipo = 'LOCAL'
       ORDER BY CASE WHEN codigo = 'PRINCIPAL' THEN 0 ELSE id_sucursal END LIMIT 1`,
    );
    if (!s) throw new BadRequestException('No hay locales activos');
    return Number(s.id_sucursal);
  }

  private async obtenerConfig(idSucursal: number) {
    const [row] = await this.dataSource.query(
      `SELECT nombre, tagline, promo, moneda, tema FROM carta_vitrina
       WHERE estado_registro = 'ACTIVO' AND id_sucursal = ? LIMIT 1`,
      [idSucursal],
    );
    return row || null;
  }

  private async ensureCartaConfig(idSucursal: number, userId: number) {
    const existing = await this.obtenerConfig(idSucursal);
    if (existing) {
      const [full] = await this.dataSource.query(
        `SELECT * FROM carta_vitrina WHERE estado_registro = 'ACTIVO' AND id_sucursal = ? LIMIT 1`,
        [idSucursal],
      );
      return full;
    }
    const [suc] = await this.dataSource.query(
      `SELECT nombre, nombre_comercial FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    const nombre = `${suc?.nombre_comercial || suc?.nombre || 'Local'} — Carta`;
    const ins = await this.dataSource.query(
      `INSERT INTO carta_vitrina (id_sucursal, nombre, tagline, promo, moneda, id_usuario_crea) VALUES (?, ?, NULL, NULL, 'S/', ?)`,
      [idSucursal, nombre, userId],
    );
    const [row] = await this.dataSource.query(
      `SELECT * FROM carta_vitrina WHERE id_carta_vitrina = ?`,
      [Number(ins.insertId)],
    );
    return row;
  }

  private async findTag(id: number, idSucursal: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_tag, tipo, nombre, orden FROM carta_vitrina_tag
       WHERE id_tag = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [id, idSucursal],
    );
    if (!row) throw new NotFoundException('Etiqueta no encontrada');
    return row;
  }

  private async findProducto(id: number, idSucursal: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.precio, p.precio_junior, p.descripcion, p.imagen,
              COALESCE(ps.visible_carta, 0) AS visible_carta,
              COALESCE(NULLIF(ps.orden_carta, 0), p.orden_carta, 0) AS orden_carta,
              p.estacion, p.id_categoria,
              c.codigo AS categoria, c.nombre AS categoria_nombre,
              COALESCE(ps.disponible, 1) AS disponible,
              COALESCE(ps.precio_override, p.precio) AS precio
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO'
       WHERE p.id_producto = ? AND p.estado_registro = 'ACTIVO'`,
      [idSucursal, id],
    );
    if (!row) throw new NotFoundException('Producto no encontrado');
    return row;
  }

  private async upsertProductoSucursal(
    idProducto: number,
    idSucursal: number,
    data: { visible_carta?: number; disponible?: number; orden_carta?: number; precio?: number },
    userId: number,
  ) {
    const [existe] = await this.dataSource.query(
      `SELECT id_producto_sucursal FROM producto_sucursal WHERE id_producto = ? AND id_sucursal = ?`,
      [idProducto, idSucursal],
    );
    if (existe) {
      await this.dataSource.query(
        `UPDATE producto_sucursal
         SET visible_carta = COALESCE(?, visible_carta),
             disponible = COALESCE(?, disponible),
             orden_carta = COALESCE(?, orden_carta),
             precio_override = COALESCE(?, precio_override),
             estado_registro = 'ACTIVO', id_usuario_mod = ?
         WHERE id_producto_sucursal = ?`,
        [data.visible_carta, data.disponible, data.orden_carta, data.precio, userId, existe.id_producto_sucursal],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO producto_sucursal (id_producto, id_sucursal, disponible, visible_carta, orden_carta, precio_override, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          idProducto,
          idSucursal,
          data.disponible ?? 1,
          data.visible_carta ?? 0,
          data.orden_carta ?? 0,
          data.precio ?? null,
          userId,
        ],
      );
    }
  }

  private async setDisponibleSucursal(idProducto: number, idSucursal: number, disponible: number, userId: number) {
    await this.upsertProductoSucursal(idProducto, idSucursal, { disponible: disponible ? 1 : 0 }, userId);
  }

  private async siguienteCodigo(idSucursal?: number) {
    let prefijo = 'CARTA';
    if (idSucursal) {
      const cfg = await this.obtenerConfig(idSucursal);
      if (String(cfg?.tema || '') === 'don_papas') prefijo = 'DP';
    }
    const like = `${prefijo}-%`;
    const start = prefijo.length + 2;
    const [row] = await this.dataSource.query(
      `SELECT MAX(CAST(SUBSTRING(codigo, ?) AS UNSIGNED)) AS n
       FROM producto WHERE codigo LIKE ?`,
      [start, like],
    );
    const next = Number(row?.n || 0) + 1;
    return `${prefijo}-${String(next).padStart(3, '0')}`;
  }

  private async resolverSucursalPublica(raw: any) {
    if (raw) {
      const n = Number(raw);
      if (!n || Number.isNaN(n)) throw new BadRequestException('Sucursal inválida');
      const [s] = await this.dataSource.query(
        `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO' AND tipo = 'LOCAL'`,
        [n],
      );
      if (!s) throw new NotFoundException('Sucursal no encontrada');
      return n;
    }
    const [s] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE codigo = 'PRINCIPAL' AND estado_registro = 'ACTIVO' AND tipo = 'LOCAL' LIMIT 1`,
    );
    if (s) return Number(s.id_sucursal);
    const [any] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO' AND tipo = 'LOCAL' ORDER BY id_sucursal LIMIT 1`,
    );
    return Number(any?.id_sucursal || 0) || 1;
  }

  private assertQueryScalars(query: any, keys: string[]) {
    for (const key of keys) {
      if (Array.isArray(query?.[key])) throw new BadRequestException('Param inválido');
    }
  }

  private assertId(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('ID inválido');
  }

  private round2(n: any) {
    return Math.round(Number(n || 0) * 100) / 100;
  }
}
