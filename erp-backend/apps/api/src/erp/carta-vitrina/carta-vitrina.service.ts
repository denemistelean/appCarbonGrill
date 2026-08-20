import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService, UploadService } from '@app/common';
import { DataSource } from 'typeorm';
import { RequestUser } from '../../common/auth/request-user.interface';
import { ActualizarVitrinaDto, CrearTagDto, GuardarProductoVitrinaDto } from './carta-vitrina.dto';

@Injectable()
export class CartaVitrinaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly uploadService: UploadService,
  ) {}

  async publica(query: any) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const idSucursal = await this.resolverSucursalPublica(query.id_sucursal);
    const [config] = await this.dataSource.query(
      `SELECT nombre, tagline, promo, moneda FROM carta_vitrina WHERE estado_registro = 'ACTIVO' ORDER BY id_carta_vitrina LIMIT 1`,
    );
    const categorias = await this.dataSource.query(
      `SELECT c.id_categoria, c.codigo, c.nombre, c.icono, c.orden
       FROM producto_categoria c
       WHERE c.estado_registro = 'ACTIVO' AND c.codigo IS NOT NULL AND c.codigo <> ''
       ORDER BY c.orden ASC, c.nombre ASC`,
    );
    const tags = await this.dataSource.query(
      `SELECT tipo, nombre, orden FROM carta_vitrina_tag
       WHERE estado_registro = 'ACTIVO' ORDER BY tipo ASC, orden ASC, id_tag ASC`,
    );
    const items = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.descripcion, p.imagen, p.orden_carta,
              c.codigo AS categoria, c.nombre AS categoria_nombre, c.icono,
              COALESCE(ps.precio_override, p.precio) AS precio,
              COALESCE(ps.disponible, 1) AS disponible
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO' AND p.visible_carta = 1
       ORDER BY c.orden ASC, p.orden_carta ASC, p.nombre ASC`,
      [idSucursal],
    );
    return {
      config: config || {
        nombre: 'Carbón Grill & Burgers',
        tagline: 'Hamburguesas • Alitas • Parrillas • Tragos',
        promo: '',
        moneda: 'S/',
      },
      categorias,
      sabores: tags.filter((t: any) => t.tipo === 'SABOR').map((t: any) => t.nombre),
      chorizos: tags.filter((t: any) => t.tipo === 'CHORIZO').map((t: any) => t.nombre),
      productos: items,
    };
  }

  async adminResumen(user: RequestUser) {
    const publica = await this.publica({});
    const tags = await this.dataSource.query(
      `SELECT id_tag, tipo, nombre, orden FROM carta_vitrina_tag
       WHERE estado_registro = 'ACTIVO' ORDER BY tipo ASC, orden ASC`,
    );
    const productos = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.precio, p.descripcion, p.imagen,
              p.visible_carta, p.orden_carta, p.estacion, p.id_categoria,
              c.codigo AS categoria, c.nombre AS categoria_nombre,
              COALESCE(ps.disponible, 1) AS disponible
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN sucursal s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
       LEFT JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal AND ps.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO'
         AND (p.visible_carta = 1 OR p.codigo LIKE 'CARTA-%')
       ORDER BY p.visible_carta DESC, c.orden ASC, p.orden_carta ASC`,
    );
    return { ...publica, tags, productos, usuario: user.idUsuario };
  }

  async guardarConfig(dto: ActualizarVitrinaDto, user: RequestUser) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM carta_vitrina WHERE estado_registro = 'ACTIVO' ORDER BY id_carta_vitrina LIMIT 1`,
    );
    if (row) {
      await this.dataSource.query(
        `UPDATE carta_vitrina SET nombre = ?, tagline = ?, promo = ?, moneda = ?, id_usuario_mod = ?
         WHERE id_carta_vitrina = ?`,
        [dto.nombre.trim(), dto.tagline?.trim() || null, dto.promo?.trim() || null, dto.moneda?.trim() || 'S/', user.idUsuario, row.id_carta_vitrina],
      );
      await this.auditoriaService.registrar('carta_vitrina', row.id_carta_vitrina, 'ACTUALIZAR', user.idUsuario, row, dto);
    } else {
      const ins = await this.dataSource.query(
        `INSERT INTO carta_vitrina (nombre, tagline, promo, moneda, id_usuario_crea) VALUES (?, ?, ?, ?, ?)`,
        [dto.nombre.trim(), dto.tagline?.trim() || null, dto.promo?.trim() || null, dto.moneda?.trim() || 'S/', user.idUsuario],
      );
      await this.auditoriaService.registrar('carta_vitrina', Number(ins.insertId), 'CREAR', user.idUsuario, null, dto);
    }
    return this.publica({});
  }

  async crearTag(dto: CrearTagDto, user: RequestUser) {
    const ins = await this.dataSource.query(
      `INSERT INTO carta_vitrina_tag (tipo, nombre, orden, id_usuario_crea) VALUES (?, ?, ?, ?)`,
      [dto.tipo, dto.nombre.trim(), dto.orden ?? 0, user.idUsuario],
    );
    const id = Number(ins.insertId);
    await this.auditoriaService.registrar('carta_vitrina_tag', id, 'CREAR', user.idUsuario, null, dto);
    return this.findTag(id);
  }

  async eliminarTag(id: number, user: RequestUser) {
    this.assertId(id);
    const old = await this.findTag(id);
    await this.dataSource.query(
      `UPDATE carta_vitrina_tag SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_tag = ?`,
      [user.idUsuario, id],
    );
    await this.auditoriaService.registrar('carta_vitrina_tag', id, 'ELIMINAR', user.idUsuario, old, null);
    return { id_tag: id };
  }

  async guardarProducto(dto: GuardarProductoVitrinaDto, user: RequestUser) {
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
    let id = Number(dto.id_producto || 0);

    if (id) {
      const [old] = await this.dataSource.query(
        `SELECT * FROM producto WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
        [id],
      );
      if (!old) throw new NotFoundException('Producto no encontrado');
      await this.dataSource.query(
        `UPDATE producto
         SET nombre = ?, id_categoria = ?, precio = ?, descripcion = ?,
             imagen = COALESCE(?, imagen), visible_carta = ?, orden_carta = ?, estacion = ?, id_usuario_mod = ?
         WHERE id_producto = ?`,
        [nombre, dto.id_categoria, this.round2(dto.precio), desc, imagen, visible, dto.orden_carta ?? old.orden_carta, estacion, user.idUsuario, id],
      );
      await this.auditoriaService.registrar('producto', id, 'ACTUALIZAR', user.idUsuario, old, dto);
    } else {
      const codigo = await this.siguienteCodigo();
      const orden = dto.orden_carta ?? 999;
      const ins = await this.dataSource.query(
        `INSERT INTO producto
           (codigo, nombre, id_categoria, precio, es_combo, estacion, descripcion, imagen, visible_carta, orden_carta, id_usuario_crea)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [codigo, nombre, dto.id_categoria, this.round2(dto.precio), estacion, desc, imagen, visible, orden, user.idUsuario],
      );
      id = Number(ins.insertId);
      const sucursales = await this.dataSource.query(`SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO'`);
      for (const s of sucursales) {
        await this.dataSource.query(
          `INSERT INTO producto_sucursal (id_producto, id_sucursal, disponible, id_usuario_crea) VALUES (?, ?, ?, ?)`,
          [id, s.id_sucursal, disponible ? 1 : 0, user.idUsuario],
        );
      }
      await this.auditoriaService.registrar('producto', id, 'CREAR', user.idUsuario, null, { codigo, ...dto });
    }

    await this.setDisponiblePrincipal(id, disponible, user.idUsuario);
    return this.findProducto(id);
  }

  async toggleDisponible(id: number, user: RequestUser) {
    const p = await this.findProducto(id);
    const next = Number(p.disponible) ? 0 : 1;
    await this.setDisponiblePrincipal(id, next, user.idUsuario);
    return this.findProducto(id);
  }

  async quitarDeCarta(id: number, user: RequestUser) {
    return this.setVisibleCarta(id, 0, user);
  }

  async restaurarEnCarta(id: number, user: RequestUser) {
    return this.setVisibleCarta(id, 1, user);
  }

  private async setVisibleCarta(id: number, visible: number, user: RequestUser) {
    const old = await this.findProducto(id);
    await this.dataSource.query(
      `UPDATE producto SET visible_carta = ?, id_usuario_mod = ? WHERE id_producto = ? AND estado_registro = 'ACTIVO'`,
      [visible ? 1 : 0, user.idUsuario, id],
    );
    await this.auditoriaService.registrar('producto', id, 'ACTUALIZAR', user.idUsuario, old, { visible_carta: visible ? 1 : 0 });
    return this.findProducto(id);
  }

  async subirImagen(id: number, file: Express.Multer.File, user: RequestUser) {
    const old = await this.findProducto(id);
    const rel = this.uploadService.saveImage('carta', file, `prod_${id}`);
    if (old.imagen && !String(old.imagen).startsWith('http')) {
      this.uploadService.deleteIfExists(old.imagen);
    }
    await this.dataSource.query(
      `UPDATE producto SET imagen = ?, id_usuario_mod = ? WHERE id_producto = ?`,
      [rel, user.idUsuario, id],
    );
    await this.auditoriaService.registrar('producto', id, 'ACTUALIZAR', user.idUsuario, { imagen: old.imagen }, { imagen: rel });
    return this.findProducto(id);
  }

  async quitarImagen(id: number, user: RequestUser) {
    const old = await this.findProducto(id);
    if (old.imagen && !String(old.imagen).startsWith('http')) {
      this.uploadService.deleteIfExists(old.imagen);
    }
    await this.dataSource.query(
      `UPDATE producto SET imagen = NULL, id_usuario_mod = ? WHERE id_producto = ?`,
      [user.idUsuario, id],
    );
    return this.findProducto(id);
  }

  private async findTag(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_tag, tipo, nombre, orden FROM carta_vitrina_tag WHERE id_tag = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Etiqueta no encontrada');
    return row;
  }

  private async findProducto(id: number) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.precio, p.descripcion, p.imagen,
              p.visible_carta, p.orden_carta, p.estacion, p.id_categoria,
              c.codigo AS categoria, c.nombre AS categoria_nombre,
              COALESCE(ps.disponible, 1) AS disponible
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN sucursal s ON s.codigo = 'PRINCIPAL' AND s.estado_registro = 'ACTIVO'
       LEFT JOIN producto_sucursal ps
         ON ps.id_producto = p.id_producto AND ps.id_sucursal = s.id_sucursal AND ps.estado_registro = 'ACTIVO'
       WHERE p.id_producto = ? AND p.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Producto no encontrado');
    return row;
  }

  private async setDisponiblePrincipal(idProducto: number, disponible: number, userId: number) {
    const sucursales = await this.dataSource.query(`SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO'`);
    for (const s of sucursales) {
      const [existe] = await this.dataSource.query(
        `SELECT id_producto_sucursal FROM producto_sucursal WHERE id_producto = ? AND id_sucursal = ?`,
        [idProducto, s.id_sucursal],
      );
      if (existe) {
        await this.dataSource.query(
          `UPDATE producto_sucursal SET disponible = ?, estado_registro = 'ACTIVO', id_usuario_mod = ?
           WHERE id_producto_sucursal = ?`,
          [disponible ? 1 : 0, userId, existe.id_producto_sucursal],
        );
      } else {
        await this.dataSource.query(
          `INSERT INTO producto_sucursal (id_producto, id_sucursal, disponible, id_usuario_crea)
           VALUES (?, ?, ?, ?)`,
          [idProducto, s.id_sucursal, disponible ? 1 : 0, userId],
        );
      }
    }
  }

  private async siguienteCodigo() {
    const [row] = await this.dataSource.query(
      `SELECT MAX(CAST(SUBSTRING(codigo, 7) AS UNSIGNED)) AS n
       FROM producto WHERE codigo LIKE 'CARTA-%'`,
    );
    const next = Number(row?.n || 0) + 1;
    return `CARTA-${String(next).padStart(3, '0')}`;
  }

  private async resolverSucursalPublica(raw: any) {
    if (raw) {
      const n = Number(raw);
      if (!n || Number.isNaN(n)) throw new BadRequestException('Sucursal inválida');
      const [s] = await this.dataSource.query(
        `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
        [n],
      );
      if (!s) throw new NotFoundException('Sucursal no encontrada');
      return n;
    }
    const [s] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE codigo = 'PRINCIPAL' AND estado_registro = 'ACTIVO' LIMIT 1`,
    );
    if (s) return Number(s.id_sucursal);
    const [any] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE estado_registro = 'ACTIVO' ORDER BY id_sucursal LIMIT 1`,
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
