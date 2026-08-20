import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import { RequestUser } from '../../common/auth/request-user.interface';
import { InventarioService } from '../inventario/inventario.service';
import { CreateTrasladoDto, RecibirTrasladoDto, RechazarTrasladoDto } from './traslados.dto';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null };

@Injectable()
export class TrasladosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly inventarioService: InventarioService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async catalogos(user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    const params: any[] = [];
    let where = `WHERE s.estado_registro = 'ACTIVO'`;
    if (!alcance.esSuperadmin) {
      where += ` AND s.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }

    const sucursalesAsignadas = await this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre, s.tipo
       FROM sucursal s ${where}
       ORDER BY s.tipo ASC, s.nombre ASC`,
      params,
    );

    const insumos = await this.dataSource.query(
      `SELECT i.id_insumo, i.nombre, um.codigo AS unidad_codigo,
              CONCAT(i.nombre, ' (', um.codigo, ')') AS etiqueta
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE i.estado_registro = 'ACTIVO'
       ORDER BY i.nombre ASC
       LIMIT 500`,
    );

    const todasSucursales = alcance.esSuperadmin
      ? await this.dataSource.query(
          `SELECT s.id_sucursal, s.codigo, s.nombre, s.tipo
           FROM sucursal s
           WHERE s.estado_registro = 'ACTIVO'
           ORDER BY s.tipo ASC, s.nombre ASC`,
        )
      : await this.dataSource.query(
          `SELECT s.id_sucursal, s.codigo, s.nombre, s.tipo
           FROM sucursal s
           WHERE s.estado_registro = 'ACTIVO'
           ORDER BY s.tipo ASC, s.nombre ASC`,
        );

    return {
      sucursales: todasSucursales,
      almacenes: todasSucursales.filter((s: any) => s.tipo === 'ALMACEN'),
      locales: todasSucursales.filter((s: any) => s.tipo === 'LOCAL'),
      insumos,
      estados: ['SOLICITADO', 'APROBADO', 'EN_TRANSITO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'],
      tipos: [
        { codigo: 'DISTRIBUCION', etiqueta: 'Distribución (almacén → local)' },
        { codigo: 'TRANSFERENCIA', etiqueta: 'Transferencia (local ↔ local)' },
      ],
    };
  }

  async findAll(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'estado', 'tipo', 'id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 50);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE t.estado_registro = 'ACTIVO'`;

    if (!alcance.esSuperadmin) {
      where += ` AND (t.id_origen = ? OR t.id_destino = ?)`;
      params.push(alcance.idSucursal, alcance.idSucursal);
    } else if (query.id_sucursal) {
      const id = Number(query.id_sucursal);
      if (!id || Number.isNaN(id)) throw new BadRequestException('Sucursal inválida');
      where += ` AND (t.id_origen = ? OR t.id_destino = ?)`;
      params.push(id, id);
    }

    if (query.estado) {
      where += ` AND t.estado = ?`;
      params.push(String(query.estado).toUpperCase());
    }
    if (query.tipo) {
      where += ` AND t.tipo = ?`;
      params.push(String(query.tipo).toUpperCase());
    }

    const from = `
      FROM traslado t
      INNER JOIN sucursal so ON so.id_sucursal = t.id_origen
      INNER JOIN sucursal sd ON sd.id_sucursal = t.id_destino
      INNER JOIN sis_usuario us ON us.id_usuario = t.id_usuario_solicita
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT t.id_traslado, t.tipo, t.estado, t.motivo,
                t.fecha_solicitud, t.fecha_aprobacion, t.fecha_despacho, t.fecha_recepcion,
                t.id_origen, so.nombre AS origen, so.tipo AS tipo_origen,
                t.id_destino, sd.nombre AS destino, sd.tipo AS tipo_destino,
                CONCAT(us.nombres, ' ', us.apellidos) AS solicitante,
                (SELECT COUNT(*) FROM traslado_item ti WHERE ti.id_traslado = t.id_traslado AND ti.estado_registro = 'ACTIVO') AS items
         ${from}
         ORDER BY t.fecha_solicitud DESC, t.id_traslado DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async findOne(id: number, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    await this.assertAccesoTraslado(cab, user);
    const items = await this.loadItems(id, cab.id_origen);
    const stockResumen = this.buildStockResumen(items);
    return { ...cab, items, stock_resumen: stockResumen };
  }

  async crear(dto: CreateTrasladoDto, user: RequestUser) {
    if (dto.id_origen === dto.id_destino) {
      throw new BadRequestException('Origen y destino deben ser distintos');
    }

    const [origen, destino] = await Promise.all([
      this.loadSucursal(dto.id_origen),
      this.loadSucursal(dto.id_destino),
    ]);
    this.validarTipoTraslado(dto.tipo, origen, destino);
    await this.assertParticipante(dto.id_origen, dto.id_destino, user);

    for (const item of dto.items) {
      await this.assertInsumoActivo(item.id_insumo);
      if (item.id_lote_origen) {
        await this.assertLoteEnSucursal(item.id_lote_origen, item.id_insumo, dto.id_origen);
      }
    }
    await this.assertStockSuficienteOrigen(
      dto.id_origen,
      dto.items.map((it) => ({ id_insumo: it.id_insumo, cantidad_enviada: it.cantidad_enviada })),
    );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idTraslado = 0;

    try {
      const ins = await qr.query(
        `INSERT INTO traslado
         (tipo, id_origen, id_destino, estado, motivo, id_usuario_solicita, id_usuario_crea)
         VALUES (?, ?, ?, 'SOLICITADO', ?, ?, ?)`,
        [dto.tipo, dto.id_origen, dto.id_destino, dto.motivo?.trim() || null, user.idUsuario, user.idUsuario],
      );
      idTraslado = Number(ins.insertId);

      for (const item of dto.items) {
        await qr.query(
          `INSERT INTO traslado_item
           (id_traslado, id_insumo, id_lote_origen, cantidad_enviada, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?)`,
          [
            idTraslado,
            item.id_insumo,
            item.id_lote_origen ?? null,
            this.round4(item.cantidad_enviada),
            user.idUsuario,
          ],
        );
      }
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('traslado', idTraslado, 'CREAR', user.idUsuario, null, dto);
    return this.findOne(idTraslado, user);
  }

  async aprobar(id: number, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    if (cab.estado !== 'SOLICITADO') throw new ConflictException('Solo se aprueban traslados solicitados');
    await this.assertStockSuficienteTraslado(id, cab.id_origen);

    const result = await this.dataSource.query(
      `UPDATE traslado SET estado = 'APROBADO', fecha_aprobacion = NOW(),
              id_usuario_aprueba = ?, id_usuario_mod = ?
       WHERE id_traslado = ? AND estado = 'SOLICITADO' AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, user.idUsuario, id],
    );
    if (result.affectedRows === 0) throw new ConflictException('No se pudo aprobar el traslado');

    await this.auditoriaService.registrar('traslado', id, 'ACTUALIZAR', user.idUsuario, { estado: 'SOLICITADO' }, { estado: 'APROBADO' });
    return this.findOne(id, user);
  }

  async rechazar(id: number, dto: RechazarTrasladoDto, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    if (cab.estado !== 'SOLICITADO') throw new ConflictException('Solo se rechazan traslados solicitados');

    const result = await this.dataSource.query(
      `UPDATE traslado SET estado = 'RECHAZADO', fecha_aprobacion = NOW(),
              id_usuario_aprueba = ?, motivo = COALESCE(?, motivo), id_usuario_mod = ?
       WHERE id_traslado = ? AND estado = 'SOLICITADO' AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, dto.motivo?.trim() || null, user.idUsuario, id],
    );
    if (result.affectedRows === 0) throw new ConflictException('No se pudo rechazar el traslado');

    await this.auditoriaService.registrar('traslado', id, 'ACTUALIZAR', user.idUsuario, null, dto);
    return this.findOne(id, user);
  }

  async despachar(id: number, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    if (cab.estado !== 'APROBADO') throw new ConflictException('Solo se despachan traslados aprobados');
    await this.assertAccesoSucursal(cab.id_origen, user);
    await this.assertStockSuficienteTraslado(id, cab.id_origen);

    const items = await this.loadItems(id, cab.id_origen);
    const motivoKardex = cab.tipo === 'DISTRIBUCION' ? 'DISTRIBUCION' : 'TRANSFERENCIA';
    const detalle = `Traslado #${id}`;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      for (const item of items) {
        const salida = await this.inventarioService.salidaEnTransaccion(qr, {
          idInsumo: item.id_insumo,
          idSucursal: cab.id_origen,
          cantidad: Number(item.cantidad_enviada),
          userId: user.idUsuario,
          motivo: motivoKardex,
          detalle,
          idLote: item.id_lote_origen ?? null,
        });
        await qr.query(
          `UPDATE traslado_item SET id_kardex_salida = ?, id_usuario_mod = ?
           WHERE id_traslado_item = ?`,
          [salida.id_kardex, user.idUsuario, item.id_traslado_item],
        );
      }

      const upd = await qr.query(
        `UPDATE traslado SET estado = 'EN_TRANSITO', fecha_despacho = NOW(),
                id_usuario_despacha = ?, id_usuario_mod = ?
         WHERE id_traslado = ? AND estado = 'APROBADO'`,
        [user.idUsuario, user.idUsuario, id],
      );
      if (upd.affectedRows === 0) throw new ConflictException('No se pudo despachar el traslado');

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('traslado', id, 'ACTUALIZAR', user.idUsuario, null, { estado: 'EN_TRANSITO' });
    return this.findOne(id, user);
  }

  async recibir(id: number, dto: RecibirTrasladoDto, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    if (cab.estado !== 'EN_TRANSITO') throw new ConflictException('Solo se reciben traslados en tránsito');
    await this.assertAccesoSucursal(cab.id_destino, user);

    const items = await this.loadItems(id, cab.id_origen);
    const byId = new Map(items.map((i: any) => [Number(i.id_traslado_item), i]));
    if (dto.items.length !== items.length) {
      throw new BadRequestException('Debe indicar la recepción de todos los ítems');
    }

    const motivoKardex = cab.tipo === 'DISTRIBUCION' ? 'DISTRIBUCION' : 'TRANSFERENCIA';
    const detalle = `Traslado #${id}`;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      for (const rec of dto.items) {
        const item = byId.get(rec.id_traslado_item) as any;
        if (!item) throw new BadRequestException(`Ítem ${rec.id_traslado_item} no pertenece al traslado`);

        const enviada = this.round4(item.cantidad_enviada);
        const recibida = this.round4(rec.cantidad_recibida);
        if (recibida > enviada) {
          throw new BadRequestException(`La cantidad recibida no puede superar la enviada (${item.insumo})`);
        }

        const costoUnitario = await this.costoDesdeKardexSalida(qr, item.id_kardex_salida, item.id_insumo);

        let loteCodigo: string | null = null;
        let fechaVencimiento: string | null = null;
        if (item.id_lote_origen) {
          const [lote] = await qr.query(
            `SELECT codigo_lote, fecha_vencimiento FROM insumo_lote WHERE id_lote = ?`,
            [item.id_lote_origen],
          );
          loteCodigo = lote?.codigo_lote || null;
          fechaVencimiento = lote?.fecha_vencimiento || null;
        }

        const ingreso = await this.inventarioService.ingresoEnTransaccion(qr, {
          idInsumo: item.id_insumo,
          idSucursal: cab.id_destino,
          cantidad: enviada,
          costoUnitario,
          userId: user.idUsuario,
          motivo: motivoKardex,
          detalle,
          loteCodigo,
          fechaVencimiento,
        });

        let idMerma: number | null = null;
        const diferencia = this.round4(enviada - recibida);
        if (diferencia > 0) {
          const motivoMerma = rec.motivo_diferencia || 'MERMA_TRANSPORTE';
          const merma = await this.inventarioService.mermaEnTransaccion(qr, {
            idInsumo: item.id_insumo,
            idSucursal: cab.id_destino,
            cantidad: diferencia,
            userId: user.idUsuario,
            motivo: motivoMerma as any,
            detalle: rec.detalle_diferencia?.trim() || `Diferencia traslado #${id}`,
            idLote: ingreso.id_lote,
          });
          idMerma = merma.id_merma;
        }

        await qr.query(
          `UPDATE traslado_item
           SET cantidad_recibida = ?, id_kardex_entrada = ?, id_lote_destino = ?, id_merma = ?,
               motivo_diferencia = ?, detalle_diferencia = ?, id_usuario_mod = ?
           WHERE id_traslado_item = ?`,
          [
            recibida,
            ingreso.id_kardex,
            ingreso.id_lote,
            idMerma,
            diferencia > 0 ? (rec.motivo_diferencia || 'MERMA_TRANSPORTE') : null,
            rec.detalle_diferencia?.trim() || null,
            user.idUsuario,
            rec.id_traslado_item,
          ],
        );
      }

      const upd = await qr.query(
        `UPDATE traslado SET estado = 'RECIBIDO', fecha_recepcion = NOW(),
                id_usuario_recibe = ?, id_usuario_mod = ?
         WHERE id_traslado = ? AND estado = 'EN_TRANSITO'`,
        [user.idUsuario, user.idUsuario, id],
      );
      if (upd.affectedRows === 0) throw new ConflictException('No se pudo confirmar la recepción');

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('traslado', id, 'ACTUALIZAR', user.idUsuario, null, dto);
    return this.findOne(id, user);
  }

  async cancelar(id: number, user: RequestUser) {
    const cab = await this.loadCabecera(id);
    if (!['SOLICITADO', 'APROBADO'].includes(cab.estado)) {
      throw new ConflictException('Solo se cancelan traslados solicitados o aprobados');
    }
    await this.assertAccesoTraslado(cab, user);

    const result = await this.dataSource.query(
      `UPDATE traslado SET estado = 'CANCELADO', id_usuario_mod = ?
       WHERE id_traslado = ? AND estado IN ('SOLICITADO','APROBADO') AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, id],
    );
    if (result.affectedRows === 0) throw new ConflictException('No se pudo cancelar el traslado');

    await this.auditoriaService.registrar('traslado', id, 'ANULAR', user.idUsuario, null, { estado: 'CANCELADO' });
    return this.findOne(id, user);
  }

  async stockOrigen(idInsumo: number, idSucursal: number, _user: RequestUser) {
    await this.validateSucursalExiste(idSucursal);
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(st.stock_actual, 0) AS stock_actual, um.codigo AS unidad_codigo
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       LEFT JOIN insumo_stock st ON st.id_insumo = i.id_insumo AND st.id_sucursal = ? AND st.estado_registro = 'ACTIVO'
       WHERE i.id_insumo = ? AND i.estado_registro = 'ACTIVO'`,
      [idSucursal, idInsumo],
    );
    if (!row) throw new NotFoundException('Insumo no encontrado');
    return row;
  }

  private async loadCabecera(id: number) {
    const [cab] = await this.dataSource.query(
      `SELECT t.*, so.nombre AS origen, so.tipo AS tipo_origen,
              sd.nombre AS destino, sd.tipo AS tipo_destino,
              CONCAT(us.nombres, ' ', us.apellidos) AS solicitante
       FROM traslado t
       INNER JOIN sucursal so ON so.id_sucursal = t.id_origen
       INNER JOIN sucursal sd ON sd.id_sucursal = t.id_destino
       INNER JOIN sis_usuario us ON us.id_usuario = t.id_usuario_solicita
       WHERE t.id_traslado = ? AND t.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!cab) throw new NotFoundException('Traslado no encontrado');
    return cab;
  }

  private async loadItems(idTraslado: number, idOrigen?: number) {
    if (idOrigen) {
      return this.dataSource.query(
        `SELECT ti.*, i.nombre AS insumo, um.codigo AS unidad_codigo,
                lo.codigo_lote AS lote_origen, ld.codigo_lote AS lote_destino,
                COALESCE(st.stock_actual, 0) AS stock_origen,
                CASE WHEN COALESCE(st.stock_actual, 0) >= ti.cantidad_enviada THEN 1 ELSE 0 END AS stock_suficiente
         FROM traslado_item ti
         INNER JOIN insumo i ON i.id_insumo = ti.id_insumo
         INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
         LEFT JOIN insumo_lote lo ON lo.id_lote = ti.id_lote_origen
         LEFT JOIN insumo_lote ld ON ld.id_lote = ti.id_lote_destino
         LEFT JOIN insumo_stock st ON st.id_insumo = ti.id_insumo
           AND st.id_sucursal = ? AND st.estado_registro = 'ACTIVO'
         WHERE ti.id_traslado = ? AND ti.estado_registro = 'ACTIVO'
         ORDER BY ti.id_traslado_item ASC`,
        [idOrigen, idTraslado],
      );
    }
    return this.dataSource.query(
      `SELECT ti.*, i.nombre AS insumo, um.codigo AS unidad_codigo,
              lo.codigo_lote AS lote_origen, ld.codigo_lote AS lote_destino,
              COALESCE(st.stock_actual, 0) AS stock_origen,
              CASE WHEN COALESCE(st.stock_actual, 0) >= ti.cantidad_enviada THEN 1 ELSE 0 END AS stock_suficiente
       FROM traslado_item ti
       INNER JOIN traslado t ON t.id_traslado = ti.id_traslado
       INNER JOIN insumo i ON i.id_insumo = ti.id_insumo
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       LEFT JOIN insumo_lote lo ON lo.id_lote = ti.id_lote_origen
       LEFT JOIN insumo_lote ld ON ld.id_lote = ti.id_lote_destino
       LEFT JOIN insumo_stock st ON st.id_insumo = ti.id_insumo
         AND st.id_sucursal = t.id_origen AND st.estado_registro = 'ACTIVO'
       WHERE ti.id_traslado = ? AND ti.estado_registro = 'ACTIVO'
       ORDER BY ti.id_traslado_item ASC`,
      [idTraslado],
    );
  }

  private buildStockResumen(items: any[]) {
    const faltantes = items
      .filter((it) => Number(it.stock_origen) < Number(it.cantidad_enviada))
      .map((it) => ({
        id_insumo: it.id_insumo,
        insumo: it.insumo,
        unidad_codigo: it.unidad_codigo,
        stock_origen: Number(it.stock_origen),
        cantidad_enviada: Number(it.cantidad_enviada),
        faltante: this.round4(Number(it.cantidad_enviada) - Number(it.stock_origen)),
      }));
    return { ok: faltantes.length === 0, faltantes };
  }

  private async assertStockSuficienteTraslado(idTraslado: number, idOrigen: number) {
    const items = await this.loadItems(idTraslado, idOrigen);
    this.lanzarSiFaltaStock(idOrigen, items);
  }

  private async assertStockSuficienteOrigen(
    idOrigen: number,
    items: { id_insumo: number; cantidad_enviada: number }[],
  ) {
    const faltantes: any[] = [];
    for (const item of items) {
      const [row] = await this.dataSource.query(
        `SELECT i.nombre AS insumo, um.codigo AS unidad_codigo, COALESCE(st.stock_actual, 0) AS stock_origen
         FROM insumo i
         INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
         LEFT JOIN insumo_stock st ON st.id_insumo = i.id_insumo AND st.id_sucursal = ? AND st.estado_registro = 'ACTIVO'
         WHERE i.id_insumo = ? AND i.estado_registro = 'ACTIVO'`,
        [idOrigen, item.id_insumo],
      );
      const stock = Number(row?.stock_origen || 0);
      const pide = this.round4(item.cantidad_enviada);
      if (stock < pide) {
        faltantes.push({
          id_insumo: item.id_insumo,
          insumo: row?.insumo || 'Insumo',
          unidad_codigo: row?.unidad_codigo,
          stock_origen: stock,
          cantidad_enviada: pide,
          faltante: this.round4(pide - stock),
        });
      }
    }
    if (faltantes.length) {
      throw new BadRequestException(this.mensajeStockInsuficiente(faltantes));
    }
  }

  private lanzarSiFaltaStock(_idOrigen: number, items: any[]) {
    const resumen = this.buildStockResumen(items);
    if (!resumen.ok) {
      throw new BadRequestException(this.mensajeStockInsuficiente(resumen.faltantes));
    }
  }

  private mensajeStockInsuficiente(faltantes: any[]) {
    const detalle = faltantes
      .map(
        (f) =>
          `${f.insumo}: hay ${f.stock_origen}, se pide ${f.cantidad_enviada} (faltan ${f.faltante})`,
      )
      .join('; ');
    return {
      message: `Stock insuficiente en origen. ${detalle}`,
      faltantes,
    };
  }

  private async validateSucursalExiste(idSucursal: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    if (!row) throw new NotFoundException('Sucursal no encontrada');
  }

  private async loadSucursal(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_sucursal, codigo, nombre, tipo FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return row;
  }

  private validarTipoTraslado(tipo: string, origen: any, destino: any) {
    if (tipo === 'DISTRIBUCION') {
      if (origen.tipo !== 'ALMACEN' || destino.tipo !== 'LOCAL') {
        throw new BadRequestException('Distribución: origen debe ser ALMACÉN y destino LOCAL');
      }
    } else if (tipo === 'TRANSFERENCIA') {
      if (origen.tipo !== 'LOCAL' || destino.tipo !== 'LOCAL') {
        throw new BadRequestException('Transferencia: origen y destino deben ser LOCALES');
      }
    }
  }

  private async costoDesdeKardexSalida(qr: any, idKardex: number | null, idInsumo: number) {
    if (idKardex) {
      const [k] = await qr.query(`SELECT costo_unitario FROM kardex WHERE id_kardex = ?`, [idKardex]);
      if (k) return this.round4(Number(k.costo_unitario));
    }
    const [ins] = await qr.query(`SELECT costo_unitario FROM insumo WHERE id_insumo = ?`, [idInsumo]);
    return this.round4(Number(ins?.costo_unitario || 0));
  }

  private async assertInsumoActivo(idInsumo: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_insumo FROM insumo WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
      [idInsumo],
    );
    if (!row) throw new NotFoundException(`Insumo ${idInsumo} no encontrado o inactivo`);
  }

  private async assertLoteEnSucursal(idLote: number, idInsumo: number, idSucursal: number) {
    const [row] = await this.dataSource.query(
      `SELECT id_lote FROM insumo_lote
       WHERE id_lote = ? AND id_insumo = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO' AND cantidad_actual > 0`,
      [idLote, idInsumo, idSucursal],
    );
    if (!row) throw new BadRequestException('Lote inválido para el insumo y sucursal de origen');
  }

  private async assertAccesoTraslado(cab: any, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    if (alcance.esSuperadmin) return;
    const id = alcance.idSucursal;
    if (Number(cab.id_origen) !== id && Number(cab.id_destino) !== id) {
      throw new ForbiddenException('No tiene acceso a este traslado');
    }
  }

  private async assertParticipante(idOrigen: number, idDestino: number, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    if (alcance.esSuperadmin) return;
    const id = alcance.idSucursal;
    if (Number(idOrigen) !== id && Number(idDestino) !== id) {
      throw new ForbiddenException('Debe pertenecer al origen o destino del traslado');
    }
  }

  private async assertAccesoSucursal(idSucursal: number, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    if (alcance.esSuperadmin) return;
    if (Number(idSucursal) !== alcance.idSucursal) {
      throw new ForbiddenException('No puede operar en otra sucursal');
    }
  }

  private async resolverAlcance(user: RequestUser): Promise<AlcanceSucursal> {
    const [rol] = await this.dataSource.query(
      `SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`,
      [user.idRol],
    );
    const esSuperadmin = String(rol?.nombre || '') === 'SUPERADMIN';
    if (esSuperadmin) return { esSuperadmin: true, idSucursal: null };

    const [asig] = await this.dataSource.query(
      `SELECT a.id_sucursal
       FROM sucursal_asignacion a
       INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
       WHERE a.id_usuario = ?
         AND a.estado_registro = 'ACTIVO'
         AND a.vigente_hasta IS NULL
         AND s.estado_registro = 'ACTIVO'
       ORDER BY a.id_asignacion DESC
       LIMIT 1`,
      [user.idUsuario],
    );
    const idSucursal = Number(asig?.id_sucursal || 0);
    if (!idSucursal) throw new ForbiddenException('Usuario sin sucursal asignada');
    return { esSuperadmin: false, idSucursal };
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

  private round4(value: number) {
    return Math.round(Number(value || 0) * 10000) / 10000;
  }
}
