import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AlcanceService } from '../../common/auth/alcance.service';
import { RequestUser } from '../../common/auth/request-user.interface';
import { InventarioService } from '../inventario/inventario.service';
import { KDS_TICKET_EVENT } from './kds.gateway';
import {
  CambiarPreparacionDto,
  ConfirmarPedidoDto,
  ESTADOS_PEDIDO,
  ESTADOS_PREPARACION,
  PedidoItemDto,
  PedidoModDto,
  UpsertPedidoDto,
} from './pedidos.dto';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

@Injectable()
export class PedidosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly inventarioService: InventarioService,
    private readonly events: EventEmitter2,
    private readonly alcanceService: AlcanceService,
  ) {}

  catalogos() {
    return {
      estados: ESTADOS_PEDIDO.map((e) => ({ codigo: e, etiqueta: this.etiquetaPedido(e) })),
      preparacion: ESTADOS_PREPARACION.map((e) => ({ codigo: e, etiqueta: this.etiquetaPrep(e) })),
      estaciones: [
        { codigo: 'PARRILLA', etiqueta: 'Parrilla' },
        { codigo: 'COCINA', etiqueta: 'Cocina' },
        { codigo: 'BAR', etiqueta: 'Bar' },
      ],
    };
  }

  async listaSucursales(user: RequestUser) {
    const alcance = await this.alcanceService.resolverAlcance(user);
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

  async listaMesas(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    return this.dataSource.query(
      `SELECT m.id_mesa, m.numero, m.nombre, m.estado, m.capacidad, m.mesa_padre_id,
              COALESCE(mp.numero, m.numero) AS mesa_cuenta
       FROM mesa m
       LEFT JOIN mesa mp ON mp.id_mesa = m.mesa_padre_id
       WHERE m.id_sucursal = ? AND m.estado_registro = 'ACTIVO' AND m.numero <> 'POS'
       ORDER BY m.numero ASC`,
      [idSucursal],
    );
  }

  async carta(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    return this.cartaPorSucursal(idSucursal);
  }

  async insumosMod(_user: RequestUser) {
    return this.dataSource.query(
      `SELECT i.id_insumo, i.nombre, i.costo_unitario, um.codigo AS unidad_codigo,
              CONCAT(i.nombre, ' (', um.codigo, ')') AS etiqueta
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE i.estado_registro = 'ACTIVO'
       ORDER BY i.nombre ASC
       LIMIT 500`,
    );
  }

  async porciones(query: any, _user: RequestUser) {
    this.assertQueryScalars(query, ['estacion']);
    const est = query.estacion ? String(query.estacion).toUpperCase() : '';
    const params: any[] = [];
    let where = `WHERE estado_registro = 'ACTIVO'`;
    if (est && ['PARRILLA', 'COCINA', 'BAR'].includes(est)) {
      where += ` AND (aplica_estacion = 'TODAS' OR aplica_estacion = ?)`;
      params.push(est);
    }
    return this.dataSource.query(
      `SELECT id_porcion, nombre, precio, aplica_estacion, orden
       FROM producto_porcion ${where}
       ORDER BY orden ASC, nombre ASC`,
      params,
    );
  }

  async activo(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_mesa']);
    const idMesa = Number(query.id_mesa);
    if (!idMesa || Number.isNaN(idMesa)) throw new BadRequestException('Mesa inválida');
    const mesa = await this.obtenerMesa(idMesa);
    await this.alcanceService.assertAccesoSucursal(mesa.id_sucursal, user);
    const mesaCuenta = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : idMesa;
    const [row] = await this.dataSource.query(
      `SELECT id_pedido FROM pedido
       WHERE id_mesa = ? AND estado_registro = 'ACTIVO'
         AND estado NOT IN ('PAGADO', 'ANULADO')
       ORDER BY id_pedido DESC LIMIT 1`,
      [mesaCuenta],
    );
    if (!row) return null;
    return this.findOne(Number(row.id_pedido), user);
  }

  async findAll(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_sucursal', 'id_mesa', 'estado']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE p.estado_registro = 'ACTIVO'`;

    const idSucursal = this.alcanceService.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND p.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND p.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    if (query.id_mesa) {
      const idMesa = Number(query.id_mesa);
      if (!idMesa || Number.isNaN(idMesa)) throw new BadRequestException('Mesa inválida');
      where += ` AND p.id_mesa = ?`;
      params.push(idMesa);
    }
    if (query.estado) {
      where += ` AND p.estado = ?`;
      params.push(String(query.estado).toUpperCase());
    }

    const from = `
      FROM pedido p
      INNER JOIN mesa m ON m.id_mesa = p.id_mesa
      INNER JOIN sucursal s ON s.id_sucursal = p.id_sucursal
      INNER JOIN sis_usuario u ON u.id_usuario = p.id_mozo
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT p.id_pedido, p.id_sucursal, s.nombre AS sucursal, p.id_mesa, m.numero AS mesa,
                p.id_mozo, CONCAT(u.nombres, ' ', u.apellidos) AS mozo,
                p.estado, p.subtotal, p.total, p.notas, p.origen, p.fecha_pedido, p.fecha_confirma
         ${from}
         ORDER BY p.fecha_pedido DESC, p.id_pedido DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);
    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async findOne(id: number, user?: RequestUser | null) {
    this.assertId(id);
    const [cab] = await this.dataSource.query(
      `SELECT p.id_pedido, p.id_sucursal, s.nombre AS sucursal, p.id_mesa, m.numero AS mesa,
              p.id_mozo, CONCAT(u.nombres, ' ', u.apellidos) AS mozo,
              p.estado, p.subtotal, p.total, p.notas, p.origen, p.id_sesion, p.fecha_pedido, p.fecha_confirma
       FROM pedido p
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sucursal s ON s.id_sucursal = p.id_sucursal
       INNER JOIN sis_usuario u ON u.id_usuario = p.id_mozo
       WHERE p.id_pedido = ? AND p.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!cab) throw new NotFoundException('Pedido no encontrado');
    if (user) await this.alcanceService.assertAccesoSucursal(cab.id_sucursal, user);

    const items = await this.dataSource.query(
      `SELECT i.id_pedido_item, i.id_producto, pr.codigo, pr.nombre AS producto, pr.es_combo,
              i.id_item_padre, i.cantidad, i.precio_unitario, i.costo_receta_snapshot,
              i.estacion, i.notas, i.persona_asociada, i.estado_preparacion, i.stock_descontado
       FROM pedido_item i
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE i.id_pedido = ? AND i.estado_registro = 'ACTIVO'
       ORDER BY i.id_pedido_item ASC`,
      [id],
    );
    const mods = items.length
      ? await this.dataSource.query(
          `SELECT m.id_pedido_mod, m.id_pedido_item, m.id_insumo, ins.nombre AS insumo,
                  m.accion, m.cantidad, m.costo_adicional
           FROM pedido_mod m
           INNER JOIN insumo ins ON ins.id_insumo = m.id_insumo
           WHERE m.id_pedido_item IN (${items.map(() => '?').join(',')}) AND m.estado_registro = 'ACTIVO'`,
          items.map((i: any) => i.id_pedido_item),
        )
      : [];
    const modsPorItem = mods.reduce((acc: Record<number, any[]>, row: any) => {
      const k = Number(row.id_pedido_item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(row);
      return acc;
    }, {});

    const porciones = items.length
      ? await this.dataSource.query(
          `SELECT pp.id_pedido_porcion, pp.id_pedido_item, pp.id_porcion, po.nombre, pp.precio, pp.cantidad
           FROM pedido_porcion pp
           INNER JOIN producto_porcion po ON po.id_porcion = pp.id_porcion
           WHERE pp.id_pedido_item IN (${items.map(() => '?').join(',')}) AND pp.estado_registro = 'ACTIVO'`,
          items.map((i: any) => i.id_pedido_item),
        )
      : [];
    const porcPorItem = porciones.reduce((acc: Record<number, any[]>, row: any) => {
      const k = Number(row.id_pedido_item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(row);
      return acc;
    }, {});

    return {
      ...cab,
      items: items.map((i: any) => ({
        ...i,
        mods: modsPorItem[Number(i.id_pedido_item)] || [],
        porciones: porcPorItem[Number(i.id_pedido_item)] || [],
      })),
    };
  }

  async cocina(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal', 'estacion']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const idSucursal = this.alcanceService.forzarSucursal(query.id_sucursal, alcance) || alcance.idSucursal;
    if (!idSucursal) throw new BadRequestException('Debe indicar la sucursal');

    const estaciones = this.estacionesPermitidas(alcance.rol, query.estacion);
    const params: any[] = [idSucursal, ...estaciones];
    const data = await this.dataSource.query(
      `SELECT i.id_pedido_item, i.id_pedido, i.id_producto, pr.nombre AS producto, pr.codigo,
              i.cantidad, i.estacion, i.notas, i.estado_preparacion, i.id_item_padre,
              p.estado AS estado_pedido, p.fecha_confirma, p.fecha_pedido,
              m.numero AS mesa, CONCAT(u.nombres, ' ', u.apellidos) AS mozo
       FROM pedido_item i
       INNER JOIN pedido p ON p.id_pedido = i.id_pedido
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sis_usuario u ON u.id_usuario = p.id_mozo
       WHERE p.id_sucursal = ?
         AND p.estado_registro = 'ACTIVO' AND i.estado_registro = 'ACTIVO'
         AND p.estado IN ('CONFIRMADO', 'EN_PREPARACION', 'LISTO')
         AND i.estado_preparacion IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO')
         AND i.estacion IN (${estaciones.map(() => '?').join(',')})
         AND (i.id_item_padre IS NOT NULL OR i.estacion <> 'NINGUNA')
       ORDER BY p.fecha_confirma ASC, i.id_pedido_item ASC`,
      params,
    );

    const ids = data.map((r: any) => r.id_pedido_item);
    const mods = ids.length
      ? await this.dataSource.query(
          `SELECT m.id_pedido_item, m.accion, ins.nombre AS insumo, m.cantidad
           FROM pedido_mod m
           INNER JOIN insumo ins ON ins.id_insumo = m.id_insumo
           WHERE m.estado_registro = 'ACTIVO' AND m.id_pedido_item IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : [];
    const modsPorItem = mods.reduce((acc: Record<number, any[]>, row: any) => {
      const k = Number(row.id_pedido_item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(row);
      return acc;
    }, {});

    const porciones = ids.length
      ? await this.dataSource.query(
          `SELECT pp.id_pedido_item, po.nombre, pp.precio
           FROM pedido_porcion pp
           INNER JOIN producto_porcion po ON po.id_porcion = pp.id_porcion
           WHERE pp.estado_registro = 'ACTIVO' AND pp.id_pedido_item IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : [];
    const porcPorItem = porciones.reduce((acc: Record<number, any[]>, row: any) => {
      const k = Number(row.id_pedido_item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(row);
      return acc;
    }, {});

    return data.map((r: any) => ({
      ...r,
      mods: modsPorItem[Number(r.id_pedido_item)] || [],
      porciones: porcPorItem[Number(r.id_pedido_item)] || [],
    }));
  }

  async upsert(id: number | null, dto: UpsertPedidoDto, user: RequestUser) {
    await this.alcanceService.assertAccesoSucursal(dto.id_sucursal, user);
    const mesa = await this.obtenerMesa(dto.id_mesa);
    if (Number(mesa.id_sucursal) !== Number(dto.id_sucursal)) {
      throw new BadRequestException('La mesa no pertenece a la sucursal');
    }
    const idMesa = mesa.mesa_padre_id ? Number(mesa.mesa_padre_id) : Number(dto.id_mesa);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idPedido = id;
    try {
      const calculado = await this.calcularItems(qr, dto.id_sucursal, dto.items);
      this.assertTotal(dto.total_esperado, calculado.total);

      if (idPedido) {
        const actual = await this.obtenerPedidoTx(qr, idPedido);
        if (Number(actual.id_sucursal) !== Number(dto.id_sucursal)) {
          throw new ForbiddenException('No puede mover el pedido a otra sucursal');
        }
        if (actual.estado !== 'PENDIENTE_CONFIRMACION') {
          throw new ConflictException('Solo se puede editar una comanda pendiente de confirmación');
        }
        await qr.query(
          `UPDATE pedido SET id_mesa = ?, notas = ?, subtotal = ?, total = ?, id_usuario_mod = ?
           WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
          [idMesa, dto.notas?.trim() || null, calculado.subtotal, calculado.total, user.idUsuario, idPedido],
        );
        await this.reemplazarItems(qr, idPedido, calculado.items, user.idUsuario);
      } else {
        const [abierto] = await qr.query(
          `SELECT id_pedido FROM pedido
           WHERE id_mesa = ? AND estado_registro = 'ACTIVO' AND estado NOT IN ('ENTREGADO', 'PAGADO', 'ANULADO')
           LIMIT 1`,
          [idMesa],
        );
        if (abierto) throw new ConflictException('La mesa ya tiene una comanda abierta');

        const ins = await qr.query(
          `INSERT INTO pedido (id_sucursal, id_mesa, id_mozo, estado, subtotal, total, notas, origen, id_usuario_crea)
           VALUES (?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?)`,
          [dto.id_sucursal, idMesa, user.idUsuario, calculado.subtotal, calculado.total, dto.notas?.trim() || null, dto.origen === 'POS' ? 'POS' : 'MOZO', user.idUsuario],
        );
        idPedido = Number(ins.insertId);
        await this.reemplazarItems(qr, idPedido, calculado.items, user.idUsuario);
        await this.actualizarMesaSiLibre(qr, idMesa, 'ESPERANDO_CONFIRMACION', user.idUsuario);
      }

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    const created = await this.findOne(idPedido!, user);
    await this.auditoriaService.registrar('pedido', idPedido!, id ? 'ACTUALIZAR' : 'CREAR', user.idUsuario, null, {
      total: created.total,
    });
    return created;
  }

  async confirmar(id: number, dto: ConfirmarPedidoDto, user: RequestUser) {
    this.assertId(id);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const pedido = await this.obtenerPedidoTx(qr, id);
      await this.alcanceService.assertAccesoSucursal(pedido.id_sucursal, user);
      if (pedido.estado !== 'PENDIENTE_CONFIRMACION') {
        throw new ConflictException('El pedido ya fue confirmado o anulado');
      }

      const itemsDb = await qr.query(
        `SELECT i.id_pedido_item, i.id_producto, i.cantidad, i.notas, i.persona_asociada, i.id_item_padre
         FROM pedido_item i
         WHERE i.id_pedido = ? AND i.estado_registro = 'ACTIVO' AND i.id_item_padre IS NULL`,
        [id],
      );
      if (!itemsDb.length) throw new BadRequestException('El pedido no tiene ítems');

      const dtoItems: PedidoItemDto[] = [];
      for (const it of itemsDb) {
        const mods = await qr.query(
          `SELECT id_insumo, accion, cantidad FROM pedido_mod
           WHERE id_pedido_item = ? AND estado_registro = 'ACTIVO'`,
          [it.id_pedido_item],
        );
        dtoItems.push({
          id_producto: Number(it.id_producto),
          cantidad: Number(it.cantidad),
          notas: it.notas,
          persona_asociada: it.persona_asociada,
          mods,
          porciones: (await qr.query(
            `SELECT id_porcion FROM pedido_porcion WHERE id_pedido_item = ? AND estado_registro = 'ACTIVO'`,
            [it.id_pedido_item],
          )).map((r: any) => Number(r.id_porcion)),
        });
      }

      const calculado = await this.calcularItems(qr, pedido.id_sucursal, dtoItems, true);
      this.assertTotal(dto.total_esperado, calculado.total);
      await this.reemplazarItems(qr, id, calculado.items, user.idUsuario, true);

      await qr.query(
        `UPDATE pedido
         SET estado = 'CONFIRMADO', subtotal = ?, total = ?, fecha_confirma = NOW(),
             id_mozo = ?, id_usuario_mod = ?
         WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
        [calculado.subtotal, calculado.total, user.idUsuario, user.idUsuario, id],
      );
      await this.actualizarMesaSiLibre(qr, pedido.id_mesa, 'OCUPADA', user.idUsuario);

      await qr.commitTransaction();
      this.emitirKds(Number(pedido.id_sucursal), id);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    const updated = await this.findOne(id, user);
    await this.auditoriaService.registrar('pedido', id, 'ACTUALIZAR', user.idUsuario, { estado: 'PENDIENTE_CONFIRMACION' }, {
      estado: 'CONFIRMADO',
      total: updated.total,
    });
    return updated;
  }

  async cartaPorSucursal(idSucursal: number) {
    return this.dataSource.query(
      `SELECT p.id_producto, p.codigo, p.nombre, p.es_combo, p.estacion, p.descripcion,
              c.id_categoria, c.nombre AS categoria, c.orden AS categoria_orden,
              COALESCE(ps.precio_override, p.precio) AS precio
       FROM producto p
       INNER JOIN producto_categoria c ON c.id_categoria = p.id_categoria AND c.estado_registro = 'ACTIVO'
       INNER JOIN producto_sucursal ps ON ps.id_producto = p.id_producto AND ps.id_sucursal = ?
         AND ps.disponible = 1 AND ps.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO'
       ORDER BY c.orden ASC, p.nombre ASC`,
      [idSucursal],
    );
  }

  async upsertDesdeCarta(opts: {
    idSucursal: number;
    idMesa: number;
    idSesion: number;
    idUsuario: number;
    dto: { total_esperado: number; notas?: string; items: PedidoItemDto[] };
  }) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idPedido = 0;
    try {
      const calculado = await this.calcularItems(qr, opts.idSucursal, opts.dto.items);
      this.assertTotal(opts.dto.total_esperado, calculado.total);

      const [abierto] = await qr.query(
        `SELECT id_pedido, estado, origen, id_sesion FROM pedido
         WHERE id_mesa = ? AND estado_registro = 'ACTIVO' AND estado NOT IN ('ENTREGADO', 'PAGADO', 'ANULADO')
         ORDER BY id_pedido DESC LIMIT 1 FOR UPDATE`,
        [opts.idMesa],
      );

      if (abierto) {
        if (Number(abierto.id_sesion) !== Number(opts.idSesion) || abierto.estado !== 'PENDIENTE_CONFIRMACION') {
          throw new ConflictException('La mesa ya tiene una comanda. Espere al mozo para agregar más.');
        }
        idPedido = Number(abierto.id_pedido);
        await qr.query(
          `UPDATE pedido SET notas = ?, subtotal = ?, total = ?, id_usuario_mod = ?
           WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
          [opts.dto.notas?.trim() || null, calculado.subtotal, calculado.total, opts.idUsuario, idPedido],
        );
        await this.reemplazarItems(qr, idPedido, calculado.items, opts.idUsuario);
      } else {
        const ins = await qr.query(
          `INSERT INTO pedido
           (id_sucursal, id_mesa, id_mozo, estado, subtotal, total, notas, origen, id_sesion, id_usuario_crea)
           VALUES (?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, 'QR', ?, ?)`,
          [
            opts.idSucursal,
            opts.idMesa,
            opts.idUsuario,
            calculado.subtotal,
            calculado.total,
            opts.dto.notas?.trim() || null,
            opts.idSesion,
            opts.idUsuario,
          ],
        );
        idPedido = Number(ins.insertId);
        await this.reemplazarItems(qr, idPedido, calculado.items, opts.idUsuario);
        await this.actualizarMesaSiLibre(qr, opts.idMesa, 'ESPERANDO_CONFIRMACION', opts.idUsuario);
        await qr.query(
          `UPDATE mesa_sesion SET id_pedido = ?, id_usuario_mod = ? WHERE id_sesion = ?`,
          [idPedido, opts.idUsuario, opts.idSesion],
        );
      }

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('pedido', idPedido, 'CREAR', opts.idUsuario, null, {
      origen: 'QR',
      total: opts.dto.total_esperado,
    });
    return this.findOne(idPedido, null);
  }

  async anular(id: number, user: RequestUser) {
    this.assertId(id);
    const pedido = await this.findOne(id, user);
    if (['ENTREGADO', 'PAGADO', 'ANULADO'].includes(pedido.estado)) {
      throw new ConflictException('El pedido ya no se puede anular');
    }
    if (pedido.estado !== 'PENDIENTE_CONFIRMACION' && pedido.estado !== 'CONFIRMADO') {
      throw new ConflictException('Solo se anulan comandas pendientes o recién confirmadas (sin preparación)');
    }
    const [enPrep] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM pedido_item
       WHERE id_pedido = ? AND estado_registro = 'ACTIVO' AND estado_preparacion IN ('EN_PREPARACION', 'LISTO', 'ENTREGADO')`,
      [id],
    );
    if (Number(enPrep?.total || 0) > 0) {
      throw new ConflictException('Hay ítems en preparación; no se puede anular');
    }

    await this.dataSource.query(
      `UPDATE pedido SET estado = 'ANULADO', id_usuario_mod = ? WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, id],
    );
    await this.dataSource.query(
      `UPDATE pedido_item SET estado_preparacion = 'ANULADO', id_usuario_mod = ?
       WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, id],
    );
    await this.liberarMesaSiSinPedidos(pedido.id_mesa, user.idUsuario);
    await this.auditoriaService.registrar('pedido', id, 'ANULAR', user.idUsuario, { estado: pedido.estado }, { estado: 'ANULADO' });
    this.emitirKds(Number(pedido.id_sucursal), id);
    return this.findOne(id, user);
  }

  async cambiarPreparacion(idPedido: number, idItem: number, dto: CambiarPreparacionDto, user: RequestUser) {
    this.assertId(idPedido);
    this.assertId(idItem);
    const alcance = await this.alcanceService.resolverAlcance(user);
    if (alcance.rol === 'MOZO' && dto.estado_preparacion !== 'ENTREGADO') {
      throw new ForbiddenException('El mozo solo puede marcar ítems como entregados');
    }

    let lastError: any;
    for (let intento = 1; intento <= 3; intento++) {
      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      let committed = false;
      let idSucursal = 0;
      try {
        const pedido = await this.obtenerPedidoTx(qr, idPedido);
        await this.alcanceService.assertAccesoSucursal(pedido.id_sucursal, user);
        if (!['CONFIRMADO', 'EN_PREPARACION', 'LISTO'].includes(pedido.estado)) {
          throw new ConflictException('El pedido no está en cocina');
        }
        idSucursal = Number(pedido.id_sucursal);

        const [itemPeek] = await qr.query(
          `SELECT id_pedido_item, id_item_padre FROM pedido_item
           WHERE id_pedido_item = ? AND id_pedido = ? AND estado_registro = 'ACTIVO'`,
          [idItem, idPedido],
        );
        if (!itemPeek) throw new NotFoundException('Ítem no encontrado');
        const lockIds = [idItem, Number(itemPeek.id_item_padre || 0)].filter((n) => n > 0).sort((a, b) => a - b);
        for (const lockId of lockIds) {
          await qr.query(`SELECT id_pedido_item FROM pedido_item WHERE id_pedido_item = ? FOR UPDATE`, [lockId]);
        }

        const [item] = await qr.query(
          `SELECT id_pedido_item, id_producto, id_item_padre, cantidad, estacion,
                  estado_preparacion, stock_descontado
           FROM pedido_item
           WHERE id_pedido_item = ? AND id_pedido = ? AND estado_registro = 'ACTIVO'`,
          [idItem, idPedido],
        );
        if (!item) throw new NotFoundException('Ítem no encontrado');
        this.assertEstacionRol(alcance.rol, item.estacion);

        const siguiente = dto.estado_preparacion;
        const actual = item.estado_preparacion;
        if (actual !== siguiente) {
          const transiciones: Record<string, string[]> = {
            PENDIENTE: ['EN_PREPARACION', 'ANULADO'],
            EN_PREPARACION: ['LISTO'],
            LISTO: ['ENTREGADO'],
            ENTREGADO: [],
            ANULADO: [],
          };
          if (!(transiciones[actual] || []).includes(siguiente)) {
            throw new BadRequestException(`No se puede pasar de ${actual} a ${siguiente}`);
          }
          if (siguiente === 'EN_PREPARACION') {
            await this.descontarStockItem(qr, item, idSucursal, user.idUsuario);
          }
          await qr.query(
            `UPDATE pedido_item SET estado_preparacion = ?, id_usuario_mod = ?
             WHERE id_pedido_item = ? AND estado_registro = 'ACTIVO'`,
            [siguiente, user.idUsuario, idItem],
          );
          await this.sincronizarEstadoPedido(qr, idPedido, pedido.id_mesa, user.idUsuario);
        }

        await qr.commitTransaction();
        committed = true;
        if (actual !== siguiente) this.emitirKds(idSucursal, idPedido, idItem);
      } catch (e) {
        if (!committed) {
          try { await qr.rollbackTransaction(); } catch { /* ya cerrada */ }
        }
        lastError = e;
        if (this.esDeadlock(e) && intento < 3) {
          await new Promise((r) => setTimeout(r, 50 * intento));
          continue;
        }
        throw e;
      } finally {
        await qr.release();
      }
      if (committed) return this.findOne(idPedido, user);
    }
    throw lastError;
  }

  private async descontarStockItem(qr: QueryRunner, item: any, idSucursal: number, userId: number) {
    if (Number(item.stock_descontado) === 1) return;

    const consumos = new Map<number, number>();
    await this.acumularBom(qr, consumos, Number(item.id_producto), Number(item.cantidad), Number(item.id_pedido_item));

    const idPadre = Number(item.id_item_padre || 0);
    if (idPadre) {
      const [padre] = await qr.query(
        `SELECT id_pedido_item, id_producto, cantidad, stock_descontado
         FROM pedido_item WHERE id_pedido_item = ? AND estado_registro = 'ACTIVO'`,
        [idPadre],
      );
      if (padre && Number(padre.stock_descontado) !== 1) {
        await this.acumularBom(qr, consumos, Number(padre.id_producto), Number(padre.cantidad), Number(padre.id_pedido_item));
        await qr.query(
          `UPDATE pedido_item SET stock_descontado = 1, id_usuario_mod = ? WHERE id_pedido_item = ?`,
          [userId, idPadre],
        );
      }
    }

    const tocados: number[] = [];
    const ids = [...consumos.keys()].sort((a, b) => a - b);
    for (const idInsumo of ids) {
      const cantidad = this.round4(consumos.get(idInsumo) || 0);
      if (!(cantidad > 0)) continue;
      await this.inventarioService.salidaEnTransaccion(qr, {
        idInsumo,
        idSucursal,
        cantidad,
        userId,
        motivo: 'PEDIDO_KDS',
        detalle: `pedido_item:${item.id_pedido_item}`,
      });
      tocados.push(idInsumo);
    }

    await this.inventarioService.marcarAgotadosPorInsumos(qr, idSucursal, tocados, userId);
    await qr.query(
      `UPDATE pedido_item SET stock_descontado = 1, id_usuario_mod = ? WHERE id_pedido_item = ?`,
      [userId, item.id_pedido_item],
    );
  }

  private async acumularBom(
    qr: QueryRunner,
    map: Map<number, number>,
    idProducto: number,
    cantidadItem: number,
    idPedidoItem: number,
  ) {
    const receta = await qr.query(
      `SELECT id_insumo, cantidad FROM receta
       WHERE id_producto = ? AND estado_registro = 'ACTIVO' AND vigente_hasta IS NULL`,
      [idProducto],
    );
    const recetaPorInsumo = new Map<number, number>();
    for (const r of receta) {
      const idInsumo = Number(r.id_insumo);
      const qty = this.round4(Number(r.cantidad) * cantidadItem);
      recetaPorInsumo.set(idInsumo, qty);
      map.set(idInsumo, this.round4((map.get(idInsumo) || 0) + qty));
    }

    const mods = await qr.query(
      `SELECT id_insumo, accion, cantidad FROM pedido_mod
       WHERE id_pedido_item = ? AND estado_registro = 'ACTIVO'`,
      [idPedidoItem],
    );
    for (const m of mods) {
      const idInsumo = Number(m.id_insumo);
      if (String(m.accion).toUpperCase() === 'QUITAR') {
        const recetaQty = recetaPorInsumo.get(idInsumo) || 0;
        map.set(idInsumo, this.round4(Math.max(0, (map.get(idInsumo) || 0) - recetaQty)));
      } else if (String(m.accion).toUpperCase() === 'AGREGAR') {
        map.set(idInsumo, this.round4((map.get(idInsumo) || 0) + Number(m.cantidad) * cantidadItem));
      }
    }
  }

  private emitirKds(idSucursal: number, idPedido: number, idItem?: number) {
    this.events.emit(KDS_TICKET_EVENT, { id_sucursal: idSucursal, id_pedido: idPedido, id_item: idItem });
  }

  private esDeadlock(e: any) {
    const code = e?.code ?? e?.driverError?.code ?? e?.errno ?? e?.driverError?.errno;
    const msg = String(e?.message || e?.driverError?.message || '');
    return code === 'ER_LOCK_DEADLOCK' || code === 1213 || msg.includes('Deadlock');
  }

  private async sincronizarEstadoPedido(qr: QueryRunner, idPedido: number, idMesa: number, userId: number) {
    const items = await qr.query(
      `SELECT estado_preparacion, estacion, id_item_padre FROM pedido_item
       WHERE id_pedido = ? AND estado_registro = 'ACTIVO' AND estado_preparacion <> 'ANULADO'
         AND (id_item_padre IS NOT NULL OR estacion <> 'NINGUNA')`,
      [idPedido],
    );
    if (!items.length) return;
    const estados = items.map((i: any) => i.estado_preparacion);
    let estadoPedido = 'CONFIRMADO';
    if (estados.every((e: string) => e === 'ENTREGADO')) estadoPedido = 'ENTREGADO';
    else if (estados.every((e: string) => e === 'LISTO' || e === 'ENTREGADO')) estadoPedido = 'LISTO';
    else if (estados.some((e: string) => e === 'EN_PREPARACION' || e === 'LISTO' || e === 'ENTREGADO')) {
      estadoPedido = 'EN_PREPARACION';
    }
    await qr.query(
      `UPDATE pedido SET estado = ?, id_usuario_mod = ? WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
      [estadoPedido, userId, idPedido],
    );
    if (estadoPedido === 'ENTREGADO') {
      await qr.query(
        `UPDATE mesa SET estado = 'COMIENDO', id_usuario_mod = ?
         WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
        [userId, idMesa, idMesa],
      );
    }
  }

  private async calcularItems(qr: QueryRunner, idSucursal: number, items: PedidoItemDto[], snapshotCosto = false) {
    const result: any[] = [];
    let subtotal = 0;
    for (const raw of items) {
      const producto = await this.obtenerProductoCarta(qr, raw.id_producto, idSucursal);
      const cantidad = this.round3(raw.cantidad);
      const esBar = String(producto.estacion).toUpperCase() === 'BAR';
      const mods = esBar ? [] : await this.normalizarMods(qr, raw.mods || []);
      const extraMods = mods.reduce((s, m) => s + (m.accion === 'AGREGAR' ? Number(m.costo_adicional) : 0), 0);
      const porciones = esBar ? [] : await this.normalizarPorciones(qr, raw.porciones || [], producto.estacion);
      const extraPorciones = porciones.reduce((s, p) => s + Number(p.precio), 0);
      const precioUnit = this.round2(Number(producto.precio) + extraMods + extraPorciones);
      const costo = snapshotCosto ? await this.costoReceta(qr, raw.id_producto, idSucursal, mods) : 0;
      const linea = this.round2(precioUnit * cantidad);
      subtotal = this.round2(subtotal + linea);
      result.push({
        id_producto: raw.id_producto,
        cantidad,
        precio_unitario: precioUnit,
        costo_receta_snapshot: costo,
        estacion: producto.estacion,
        es_combo: Number(producto.es_combo) === 1,
        notas: raw.notas?.trim() || null,
        persona_asociada: raw.persona_asociada?.trim() || null,
        mods,
        porciones,
        hijos: [] as any[],
      });
    }

    if (snapshotCosto) {
      for (const item of result) {
        if (!item.es_combo) continue;
        const hijos = await qr.query(
          `SELECT ci.id_producto, ci.cantidad, p.estacion
           FROM combo_item ci
           INNER JOIN producto p ON p.id_producto = ci.id_producto AND p.estado_registro = 'ACTIVO'
           WHERE ci.id_combo = ? AND ci.estado_registro = 'ACTIVO'`,
          [item.id_producto],
        );
        for (const h of hijos) {
          const costoHijo = await this.costoReceta(qr, Number(h.id_producto), idSucursal, []);
          item.hijos.push({
            id_producto: Number(h.id_producto),
            cantidad: this.round3(Number(h.cantidad) * item.cantidad),
            precio_unitario: 0,
            costo_receta_snapshot: costoHijo,
            estacion: h.estacion,
            notas: item.notas,
            persona_asociada: item.persona_asociada,
            mods: [],
          });
        }
      }
    }

    return { items: result, subtotal, total: subtotal };
  }

  private async reemplazarItems(qr: QueryRunner, idPedido: number, items: any[], userId: number, _confirmar = false) {
    const existentes = await qr.query(
      `SELECT id_pedido_item FROM pedido_item WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
      [idPedido],
    );
    if (existentes.length) {
      await qr.query(
        `UPDATE pedido_mod SET estado_registro = 'ELIMINADO'
         WHERE id_pedido_item IN (${existentes.map(() => '?').join(',')})`,
        existentes.map((e: any) => e.id_pedido_item),
      );
      await qr.query(
        `UPDATE pedido_porcion SET estado_registro = 'ELIMINADO'
         WHERE id_pedido_item IN (${existentes.map(() => '?').join(',')})`,
        existentes.map((e: any) => e.id_pedido_item),
      );
    }
    await qr.query(
      `UPDATE pedido_item SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
      [userId, idPedido],
    );

    for (const item of items) {
      const ins = await qr.query(
        `INSERT INTO pedido_item
         (id_pedido, id_producto, id_item_padre, cantidad, precio_unitario, costo_receta_snapshot,
          estacion, notas, persona_asociada, estado_preparacion, id_usuario_crea)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`,
        [
          idPedido,
          item.id_producto,
          item.cantidad,
          item.precio_unitario,
          item.costo_receta_snapshot,
          item.estacion,
          item.notas,
          item.persona_asociada,
          userId,
        ],
      );
      const idItem = Number(ins.insertId);
      for (const mod of item.mods || []) {
        await qr.query(
          `INSERT INTO pedido_mod (id_pedido_item, id_insumo, accion, cantidad, costo_adicional, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [idItem, mod.id_insumo, mod.accion, mod.cantidad, mod.costo_adicional, userId],
        );
      }
      for (const porc of item.porciones || []) {
        await qr.query(
          `INSERT INTO pedido_porcion (id_pedido_item, id_porcion, precio, cantidad, id_usuario_crea)
           VALUES (?, ?, ?, 1, ?)`,
          [idItem, porc.id_porcion, porc.precio, userId],
        );
      }
      for (const hijo of item.hijos || []) {
        await qr.query(
          `INSERT INTO pedido_item
           (id_pedido, id_producto, id_item_padre, cantidad, precio_unitario, costo_receta_snapshot,
            estacion, notas, persona_asociada, estado_preparacion, id_usuario_crea)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'PENDIENTE', ?)`,
          [
            idPedido,
            hijo.id_producto,
            idItem,
            hijo.cantidad,
            hijo.costo_receta_snapshot,
            hijo.estacion,
            hijo.notas,
            hijo.persona_asociada,
            userId,
          ],
        );
      }
    }
  }

  private async obtenerProductoCarta(qr: QueryRunner, idProducto: number, idSucursal: number) {
    const [row] = await qr.query(
      `SELECT p.id_producto, p.es_combo, p.estacion, COALESCE(ps.precio_override, p.precio) AS precio
       FROM producto p
       INNER JOIN producto_sucursal ps ON ps.id_producto = p.id_producto AND ps.id_sucursal = ?
         AND ps.disponible = 1 AND ps.estado_registro = 'ACTIVO'
       WHERE p.id_producto = ? AND p.estado_registro = 'ACTIVO'`,
      [idSucursal, idProducto],
    );
    if (!row) throw new BadRequestException('Producto no disponible en la sucursal');
    return row;
  }

  private async normalizarPorciones(qr: QueryRunner, ids: number[], estacion: string) {
    const clean: any[] = [];
    const seen = new Set<number>();
    const est = String(estacion || '').toUpperCase();
    for (const raw of ids || []) {
      const id = Number(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const [row] = await qr.query(
        `SELECT id_porcion, nombre, precio, aplica_estacion
         FROM producto_porcion WHERE id_porcion = ? AND estado_registro = 'ACTIVO'`,
        [id],
      );
      if (!row) throw new BadRequestException('Porción no encontrada');
      const aplica = String(row.aplica_estacion || 'TODAS').toUpperCase();
      if (aplica !== 'TODAS' && aplica !== est) {
        throw new BadRequestException(`La porción ${row.nombre} no aplica a ${est}`);
      }
      clean.push({
        id_porcion: Number(row.id_porcion),
        nombre: row.nombre,
        precio: this.round2(row.precio),
      });
    }
    return clean;
  }

  private async normalizarMods(qr: QueryRunner, mods: PedidoModDto[]) {
    const clean: any[] = [];
    const seen = new Set<string>();
    for (const raw of mods) {
      const idInsumo = Number(raw.id_insumo);
      const accion = String(raw.accion).toUpperCase();
      const key = `${idInsumo}:${accion}`;
      if (seen.has(key)) throw new BadRequestException('Modificador duplicado');
      seen.add(key);
      const [insumo] = await qr.query(
        `SELECT id_insumo, costo_unitario FROM insumo WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
        [idInsumo],
      );
      if (!insumo) throw new BadRequestException('Insumo de modificador no encontrado');
      const cantidad = this.round4(raw.cantidad ?? 1);
      const costo = accion === 'AGREGAR' ? this.round4(Number(insumo.costo_unitario) * cantidad) : 0;
      clean.push({ id_insumo: idInsumo, accion, cantidad, costo_adicional: costo });
    }
    return clean;
  }

  private async costoReceta(qr: QueryRunner, idProducto: number, idSucursal: number, mods: any[]) {
    const [row] = await qr.query(
      `SELECT COALESCE(SUM(r.cantidad * COALESCE(st.costo_promedio, i.costo_unitario)), 0) AS costo
       FROM receta r
       INNER JOIN insumo i ON i.id_insumo = r.id_insumo
       LEFT JOIN insumo_stock st ON st.id_insumo = r.id_insumo AND st.id_sucursal = ? AND st.estado_registro = 'ACTIVO'
       WHERE r.id_producto = ? AND r.estado_registro = 'ACTIVO' AND r.vigente_hasta IS NULL`,
      [idSucursal, idProducto],
    );
    let costo = Number(row?.costo || 0);
    for (const m of mods || []) {
      if (m.accion === 'AGREGAR') costo += Number(m.costo_adicional || 0);
    }
    return this.round4(costo);
  }

  private async obtenerPedidoTx(qr: QueryRunner, id: number) {
    const [row] = await qr.query(
      `SELECT id_pedido, id_sucursal, id_mesa, estado FROM pedido WHERE id_pedido = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('Pedido no encontrado');
    return row;
  }

  private async obtenerMesa(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_mesa, id_sucursal, numero, estado, mesa_padre_id FROM mesa WHERE id_mesa = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }

  private async actualizarMesaSiLibre(qr: QueryRunner, idMesa: number, estado: string, userId: number) {
    await qr.query(
      `UPDATE mesa SET estado = ?, id_usuario_mod = ?
       WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'
         AND estado IN ('LIBRE', 'ESPERANDO_CONFIRMACION', 'LIMPIEZA')`,
      [estado, userId, idMesa, idMesa],
    );
  }

  private async liberarMesaSiSinPedidos(idMesa: number, userId: number) {
    const [abiertos] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM pedido
       WHERE id_mesa = ? AND estado_registro = 'ACTIVO' AND estado NOT IN ('ENTREGADO', 'PAGADO', 'ANULADO')`,
      [idMesa],
    );
    if (Number(abiertos?.total || 0) > 0) return;
    await this.dataSource.query(
      `UPDATE mesa SET estado = 'LIBRE', id_usuario_mod = ?
       WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
      [userId, idMesa, idMesa],
    );
  }

  private assertTotal(esperado: number, calculado: number) {
    if (this.round2(esperado) !== this.round2(calculado)) {
      throw new BadRequestException('Alerta de seguridad: totales no coinciden');
    }
  }

  private estacionesPermitidas(rol: string, raw: any): string[] {
    if (rol === 'BAR') {
      if (raw && String(raw).toUpperCase() !== 'BAR') throw new ForbiddenException('Bar solo ve estación BAR');
      return ['BAR'];
    }
    if (rol === 'COCINA') {
      if (raw) {
        const e = String(raw).toUpperCase();
        if (e === 'BAR') throw new ForbiddenException('Cocina no ve estación BAR');
        if (!['COCINA', 'PARRILLA'].includes(e)) throw new BadRequestException('Estación inválida');
        return [e];
      }
      return ['COCINA', 'PARRILLA'];
    }
    if (raw) {
      const e = String(raw).toUpperCase();
      if (!['COCINA', 'PARRILLA', 'BAR'].includes(e)) throw new BadRequestException('Estación inválida');
      return [e];
    }
    return ['COCINA', 'PARRILLA', 'BAR'];
  }

  private assertEstacionRol(rol: string, estacion: string) {
    if (rol === 'MOZO') return;
    if (rol === 'BAR' && estacion !== 'BAR') throw new ForbiddenException('Bar solo opera estación BAR');
    if (rol === 'COCINA' && !['COCINA', 'PARRILLA'].includes(estacion)) {
      throw new ForbiddenException('Cocina no opera estación BAR');
    }
  }

  private etiquetaPedido(e: string) {
    const map: Record<string, string> = {
      PENDIENTE_CONFIRMACION: 'Pendiente de confirmación',
      CONFIRMADO: 'Confirmado',
      EN_PREPARACION: 'En preparación',
      LISTO: 'Listo',
      ENTREGADO: 'Entregado',
      PAGADO: 'Pagado',
      ANULADO: 'Anulado',
    };
    return map[e] || e;
  }

  private etiquetaPrep(e: string) {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_PREPARACION: 'En preparación',
      LISTO: 'Listo',
      ENTREGADO: 'Entregado',
      ANULADO: 'Anulado',
    };
    return map[e] || e;
  }

  private exigirSucursal(raw: any, alcance: AlcanceSucursal): number {
    const id = this.alcanceService.forzarSucursal(raw, alcance);
    if (!id) throw new BadRequestException('Debe indicar la sucursal');
    return id;
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

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private round3(n: number) {
    return Math.round(Number(n || 0) * 1000) / 1000;
  }

  private round4(n: number) {
    return Math.round(Number(n || 0) * 10000) / 10000;
  }
}
