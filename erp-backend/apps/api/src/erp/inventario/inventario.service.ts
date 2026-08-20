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
import { RequestUser } from '../../common/auth/request-user.interface';
import {
  AjusteInventarioDto,
  CreateMermaDto,
  IngresoInventarioDto,
  IngresoLoteDto,
  MOTIVOS_MERMA_LISTA,
  MotivoMerma,
  SalidaInventarioDto,
  UpdateStockMinimoDto,
} from './inventario.dto';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null };

type StockBloqueado = {
  id_insumo_stock: number;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
};

@Injectable()
export class InventarioService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async listaInsumos() {
    return this.dataSource.query(
      `SELECT i.id_insumo, i.nombre, i.costo_unitario,
              um.codigo AS unidad_codigo, um.nombre AS unidad,
              CONCAT(i.nombre, ' (', um.codigo, ')') AS etiqueta
       FROM insumo i
       INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
       WHERE i.estado_registro = 'ACTIVO'
       ORDER BY i.nombre ASC
       LIMIT 500`,
    );
  }

  async listaSucursales(user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    const params: any[] = [];
    let where = `WHERE s.estado_registro = 'ACTIVO'`;
    if (!alcance.esSuperadmin) {
      where += ` AND s.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    return this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre, s.tipo
       FROM sucursal s
       ${where}
       ORDER BY s.tipo ASC, s.nombre ASC
       LIMIT 200`,
      params,
    );
  }

  motivosMerma() {
    return [
      { codigo: 'CARNE_QUEMADA', etiqueta: 'Carne quemada' },
      { codigo: 'INSUMO_VENCIDO', etiqueta: 'Insumo vencido' },
      { codigo: 'DESPERDICIO_CORTE', etiqueta: 'Desperdicio en corte' },
      { codigo: 'ERROR_COMANDA', etiqueta: 'Error de comanda' },
      { codigo: 'OTRO', etiqueta: 'Otro' },
      { codigo: 'MERMA_TRANSPORTE', etiqueta: 'Merma en transporte' },
      { codigo: 'PRODUCTO_DANADO', etiqueta: 'Producto dañado' },
      { codigo: 'ERROR_CONTEO', etiqueta: 'Error de conteo' },
    ];
  }

  async stock(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'search', 'id_insumo', 'id_sucursal', 'bajo_minimo']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE i.estado_registro = 'ACTIVO' AND s.estado_registro = 'ACTIVO'`;

    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND s.id_sucursal = ?`;
      params.push(idSucursal);
    }
    this.addNumberFilter(query, 'id_insumo', 'i.id_insumo', params, (sql) => (where += sql));

    if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      where += ` AND (i.nombre LIKE ? OR um.codigo LIKE ?)`;
      params.push(search, search);
    }
    if (this.isTruthy(query.bajo_minimo)) {
      where += ` AND st.stock_actual <= st.stock_minimo AND st.stock_minimo > 0`;
    }

    const from = `
      FROM insumo i
      INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
      INNER JOIN sucursal s ON s.estado_registro = 'ACTIVO'
      LEFT JOIN insumo_stock st ON st.id_insumo = i.id_insumo
        AND st.id_sucursal = s.id_sucursal
        AND st.estado_registro = 'ACTIVO'
      LEFT JOIN (
        SELECT id_insumo, id_sucursal, MIN(fecha_vencimiento) AS proximo_vto
        FROM insumo_lote
        WHERE estado_registro = 'ACTIVO' AND cantidad_actual > 0 AND fecha_vencimiento IS NOT NULL
        GROUP BY id_insumo, id_sucursal
      ) v ON v.id_insumo = i.id_insumo AND v.id_sucursal = s.id_sucursal
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT i.id_insumo, i.nombre AS insumo, um.codigo AS unidad_codigo, um.nombre AS unidad,
                s.id_sucursal, s.nombre AS sucursal,
                COALESCE(st.stock_actual, 0) AS stock_actual,
                COALESCE(st.stock_minimo, 0) AS stock_minimo,
                COALESCE(st.costo_promedio, i.costo_unitario) AS costo_promedio,
                CASE WHEN COALESCE(st.stock_actual, 0) <= COALESCE(st.stock_minimo, 0) AND COALESCE(st.stock_minimo, 0) > 0 THEN 1 ELSE 0 END AS bajo_minimo,
                v.proximo_vto,
                CASE WHEN v.proximo_vto IS NOT NULL AND v.proximo_vto <= CURDATE() THEN 1 ELSE 0 END AS vencido
         ${from}
         ORDER BY i.nombre ASC, s.nombre ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async lotes(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_insumo', 'id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idInsumo = Number(query.id_insumo);
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (!idInsumo || Number.isNaN(idInsumo)) throw new BadRequestException('Insumo inválido');
    if (!idSucursal) throw new BadRequestException('Sucursal requerida');

    return this.dataSource.query(
      `SELECT l.id_lote, l.id_insumo, l.id_sucursal, l.codigo_lote, l.fecha_vencimiento, l.cantidad_actual,
              CASE WHEN l.fecha_vencimiento IS NOT NULL AND l.fecha_vencimiento <= CURDATE() THEN 1 ELSE 0 END AS vencido
       FROM insumo_lote l
       WHERE l.id_insumo = ? AND l.id_sucursal = ?
         AND l.estado_registro = 'ACTIVO' AND l.cantidad_actual > 0
       ORDER BY COALESCE(l.fecha_vencimiento, '9999-12-31') ASC, l.id_lote ASC`,
      [idInsumo, idSucursal],
    );
  }

  async actualizarMinimo(dto: UpdateStockMinimoDto, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    this.assertSucursalPermitida(dto.id_sucursal, alcance);
    const minimo = this.round4(dto.stock_minimo);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.validateInsumoActivo(qr, dto.id_insumo);
      await this.validateSucursalActiva(qr, dto.id_sucursal);
      await this.ensureStockRow(qr, dto.id_insumo, dto.id_sucursal, user.idUsuario);
      const result = await qr.query(
        `UPDATE insumo_stock
         SET stock_minimo = ?, id_usuario_mod = ?
         WHERE id_insumo = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO'`,
        [minimo, user.idUsuario, dto.id_insumo, dto.id_sucursal],
      );
      if (result.affectedRows === 0) throw new NotFoundException('Stock no encontrado');
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('insumo_stock', dto.id_insumo, 'ACTUALIZAR', user.idUsuario, null, {
      id_sucursal: dto.id_sucursal,
      stock_minimo: minimo,
    });
    return { id_insumo: dto.id_insumo, id_sucursal: dto.id_sucursal, stock_minimo: minimo };
  }

  async ingreso(dto: IngresoInventarioDto, user: RequestUser) {
    return this.ejecutarMovimiento({
      tipo: 'INGRESO',
      idInsumo: dto.id_insumo,
      idSucursal: dto.id_sucursal,
      cantidad: this.round4(dto.cantidad),
      costoUnitario: this.round4(dto.costo_unitario),
      motivo: (dto.motivo || 'COMPRA').trim().toUpperCase(),
      detalle: dto.detalle?.trim() || null,
      loteCodigo: dto.lote?.trim().toUpperCase() || null,
      fechaVencimiento: dto.fecha_vencimiento || null,
      idLote: null,
      user,
    });
  }

  /** Varios insumos en un solo registro (misma sucursal, un kardex por ítem, TX atómica). */
  async ingresoLote(dto: IngresoLoteDto, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    this.assertSucursalPermitida(dto.id_sucursal, alcance);

    const motivo = (dto.motivo || 'COMPRA').trim().toUpperCase();
    const detalle = dto.detalle?.trim() || null;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const resultados: any[] = [];

    try {
      await this.validateSucursalActiva(qr, dto.id_sucursal);

      for (const item of dto.items) {
        const [ins] = await qr.query(
          `SELECT costo_unitario, nombre FROM insumo WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
          [item.id_insumo],
        );
        if (!ins) {
          throw new NotFoundException(`Insumo ${item.id_insumo} no encontrado o inactivo`);
        }

        const costo = item.costo_unitario != null
          ? this.round4(item.costo_unitario)
          : this.round4(Number(ins.costo_unitario || 0));

        const res = await this.ingresoEnTransaccion(qr, {
          idInsumo: item.id_insumo,
          idSucursal: dto.id_sucursal,
          cantidad: this.round4(item.cantidad),
          costoUnitario: costo,
          userId: user.idUsuario,
          motivo,
          detalle,
          loteCodigo: item.lote?.trim().toUpperCase() || null,
          fechaVencimiento: item.fecha_vencimiento || null,
        });

        resultados.push({
          id_kardex: res.id_kardex,
          id_insumo: item.id_insumo,
          insumo: ins.nombre,
          id_lote: res.id_lote,
          cantidad: this.round4(item.cantidad),
          costo_unitario: costo,
        });
      }

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('kardex', 0, 'CREAR', user.idUsuario, null, {
      tipo: 'INGRESO_LOTE',
      id_sucursal: dto.id_sucursal,
      items: resultados.length,
      id_kardex_list: resultados.map((r) => r.id_kardex),
    });

    return { registrados: resultados.length, items: resultados };
  }

  async salida(dto: SalidaInventarioDto, user: RequestUser) {
    return this.ejecutarMovimiento({
      tipo: 'SALIDA',
      idInsumo: dto.id_insumo,
      idSucursal: dto.id_sucursal,
      cantidad: this.round4(dto.cantidad),
      costoUnitario: null,
      motivo: (dto.motivo || 'SALIDA').trim().toUpperCase(),
      detalle: dto.detalle?.trim() || null,
      loteCodigo: null,
      fechaVencimiento: null,
      idLote: dto.id_lote ?? null,
      user,
    });
  }

  async ajuste(dto: AjusteInventarioDto, user: RequestUser) {
    return this.ejecutarMovimiento({
      tipo: 'AJUSTE',
      sentido: dto.sentido,
      idInsumo: dto.id_insumo,
      idSucursal: dto.id_sucursal,
      cantidad: this.round4(dto.cantidad),
      costoUnitario: dto.costo_unitario != null ? this.round4(dto.costo_unitario) : null,
      motivo: dto.motivo.trim().toUpperCase(),
      detalle: dto.detalle?.trim() || null,
      loteCodigo: null,
      fechaVencimiento: null,
      idLote: null,
      user,
    });
  }

  async crearMerma(dto: CreateMermaDto, user: RequestUser) {
    return this.ejecutarMovimiento({
      tipo: 'MERMA',
      idInsumo: dto.id_insumo,
      idSucursal: dto.id_sucursal,
      cantidad: this.round4(dto.cantidad),
      costoUnitario: null,
      motivo: dto.motivo,
      detalle: dto.detalle?.trim() || null,
      loteCodigo: null,
      fechaVencimiento: null,
      idLote: dto.id_lote ?? null,
      motivoMerma: dto.motivo,
      user,
    });
  }

  async kardex(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_insumo', 'id_sucursal', 'tipo', 'fecha_desde', 'fecha_hasta']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE k.estado_registro = 'ACTIVO'`;

    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND k.id_sucursal = ?`;
      params.push(idSucursal);
    }
    this.addNumberFilter(query, 'id_insumo', 'k.id_insumo', params, (sql) => (where += sql));

    if (query.tipo) {
      const tipo = String(query.tipo).toUpperCase();
      if (!['INGRESO', 'SALIDA', 'MERMA', 'AJUSTE'].includes(tipo)) {
        throw new BadRequestException('Tipo de movimiento inválido');
      }
      where += ` AND k.tipo = ?`;
      params.push(tipo);
    }
    if (query.fecha_desde) {
      where += ` AND k.fecha_movimiento >= ?`;
      params.push(String(query.fecha_desde));
    }
    if (query.fecha_hasta) {
      where += ` AND k.fecha_movimiento < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(String(query.fecha_hasta));
    }

    const from = `
      FROM kardex k
      INNER JOIN insumo i ON i.id_insumo = k.id_insumo
      INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
      INNER JOIN sucursal s ON s.id_sucursal = k.id_sucursal
      INNER JOIN sis_usuario u ON u.id_usuario = k.id_usuario_crea
      LEFT JOIN insumo_lote l ON l.id_lote = k.id_lote
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT k.id_kardex, k.fecha_movimiento, k.tipo, k.cantidad, k.costo_unitario, k.costo_total,
                k.stock_anterior, k.stock_posterior, k.motivo, k.detalle,
                k.id_insumo, i.nombre AS insumo, um.codigo AS unidad_codigo,
                k.id_sucursal, s.nombre AS sucursal,
                l.codigo_lote, CONCAT(u.nombres, ' ', u.apellidos) AS usuario
         ${from}
         ORDER BY k.fecha_movimiento DESC, k.id_kardex DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async mermas(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_insumo', 'id_sucursal', 'motivo', 'fecha_desde', 'fecha_hasta']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const { where, params } = this.buildMermaWhere(query, alcance);

    const from = `
      FROM merma m
      INNER JOIN kardex k ON k.id_kardex = m.id_kardex
      INNER JOIN insumo i ON i.id_insumo = m.id_insumo
      INNER JOIN unidad_medida um ON um.id_unidad_medida = i.id_unidad_medida
      INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
      INNER JOIN sis_usuario u ON u.id_usuario = m.id_usuario_crea
      ${where}
    `;

    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT m.id_merma, m.id_kardex, m.id_insumo, i.nombre AS insumo, um.codigo AS unidad_codigo,
                m.id_sucursal, s.nombre AS sucursal, m.cantidad, m.motivo, m.detalle, m.costo_total,
                k.fecha_movimiento, CONCAT(u.nombres, ' ', u.apellidos) AS usuario
         ${from}
         ORDER BY k.fecha_movimiento DESC, m.id_merma DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);

    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async mermasResumen(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_insumo', 'id_sucursal', 'motivo', 'fecha_desde', 'fecha_hasta']);
    const alcance = await this.resolverAlcance(user);
    const { where, params } = this.buildMermaWhere(query, alcance);
    return this.dataSource.query(
      `SELECT m.motivo, COUNT(*) AS movimientos,
              SUM(m.cantidad) AS cantidad, SUM(m.costo_total) AS costo_total
       FROM merma m
       INNER JOIN kardex k ON k.id_kardex = m.id_kardex
       ${where}
       GROUP BY m.motivo
       ORDER BY costo_total DESC`,
      params,
    );
  }

  private buildMermaWhere(query: any, alcance: AlcanceSucursal) {
    const params: any[] = [];
    let where = `WHERE m.estado_registro = 'ACTIVO'`;
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND m.id_sucursal = ?`;
      params.push(idSucursal);
    }
    this.addNumberFilter(query, 'id_insumo', 'm.id_insumo', params, (sql) => (where += sql));
    if (query.motivo) {
      const motivo = String(query.motivo).toUpperCase();
      if (!MOTIVOS_MERMA_LISTA.includes(motivo as MotivoMerma)) {
        throw new BadRequestException('Motivo de merma inválido');
      }
      where += ` AND m.motivo = ?`;
      params.push(motivo);
    }
    if (query.fecha_desde) {
      where += ` AND k.fecha_movimiento >= ?`;
      params.push(String(query.fecha_desde));
    }
    if (query.fecha_hasta) {
      where += ` AND k.fecha_movimiento < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(String(query.fecha_hasta));
    }
    return { where, params };
  }

  private async ejecutarMovimiento(params: {
    tipo: 'INGRESO' | 'SALIDA' | 'MERMA' | 'AJUSTE';
    sentido?: 'INGRESO' | 'SALIDA';
    idInsumo: number;
    idSucursal: number;
    cantidad: number;
    costoUnitario: number | null;
    motivo: string;
    detalle: string | null;
    loteCodigo: string | null;
    fechaVencimiento: string | null;
    idLote: number | null;
    motivoMerma?: MotivoMerma;
    user: RequestUser;
  }) {
    const alcance = await this.resolverAlcance(params.user);
    this.assertSucursalPermitida(params.idSucursal, alcance);
    const deltaSigno = this.signoMovimiento(params.tipo, params.sentido);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idKardex = 0;
    let resultado: any = null;

    try {
      await this.validateInsumoActivo(qr, params.idInsumo);
      await this.validateSucursalActiva(qr, params.idSucursal);
      const stock = await this.lockStock(qr, params.idInsumo, params.idSucursal, params.user.idUsuario);
      const anterior = this.round4(stock.stock_actual);
      const cantidad = params.cantidad;
      const posterior = this.round4(anterior + deltaSigno * cantidad);
      if (posterior < 0) throw new ConflictException('Stock insuficiente para este movimiento');

      let costoUnitario = params.costoUnitario != null ? params.costoUnitario : this.round4(stock.costo_promedio);
      let costoPromedio = this.round4(stock.costo_promedio);
      if (deltaSigno > 0) {
        const denom = posterior;
        costoPromedio = denom > 0
          ? this.round4((anterior * stock.costo_promedio + cantidad * costoUnitario) / denom)
          : costoUnitario;
      }

      const updated = await qr.query(
        `UPDATE insumo_stock
         SET stock_actual = ?, costo_promedio = ?, id_usuario_mod = ?
         WHERE id_insumo_stock = ? AND estado_registro = 'ACTIVO'
           AND (? >= 0 OR stock_actual >= ?)`,
        [
          posterior,
          costoPromedio,
          params.user.idUsuario,
          stock.id_insumo_stock,
          deltaSigno,
          cantidad,
        ],
      );
      if (updated.affectedRows === 0) throw new ConflictException('Stock insuficiente o no disponible');

      let idLote: number | null = params.idLote;
      if (params.loteCodigo && deltaSigno > 0) {
        const loteIns = await qr.query(
          `INSERT INTO insumo_lote
           (id_insumo, id_sucursal, codigo_lote, fecha_vencimiento, cantidad_actual, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            params.idInsumo,
            params.idSucursal,
            params.loteCodigo,
            params.fechaVencimiento,
            cantidad,
            params.user.idUsuario,
          ],
        );
        idLote = Number(loteIns.insertId);
      } else if (idLote && deltaSigno < 0) {
        await this.descontarLote(qr, idLote, params.idInsumo, params.idSucursal, cantidad, params.user.idUsuario);
      }

      const costoTotal = this.round4(cantidad * costoUnitario);
      const kardexIns = await qr.query(
        `INSERT INTO kardex
         (id_insumo, id_sucursal, id_lote, tipo, cantidad, costo_unitario, costo_total,
          stock_anterior, stock_posterior, motivo, detalle, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.idInsumo,
          params.idSucursal,
          idLote,
          params.tipo,
          cantidad,
          costoUnitario,
          costoTotal,
          anterior,
          posterior,
          params.motivo,
          params.detalle,
          params.user.idUsuario,
        ],
      );
      idKardex = Number(kardexIns.insertId);

      if (params.tipo === 'MERMA' && params.motivoMerma) {
        await qr.query(
          `INSERT INTO merma
           (id_kardex, id_insumo, id_sucursal, cantidad, motivo, detalle, costo_total, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idKardex,
            params.idInsumo,
            params.idSucursal,
            cantidad,
            params.motivoMerma,
            params.detalle,
            costoTotal,
            params.user.idUsuario,
          ],
        );
      }

      resultado = {
        id_kardex: idKardex,
        tipo: params.tipo,
        stock_anterior: anterior,
        stock_posterior: posterior,
        costo_unitario: costoUnitario,
        costo_promedio: costoPromedio,
        id_lote: idLote,
      };
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.auditoriaService.registrar('kardex', idKardex, 'CREAR', params.user.idUsuario, null, resultado);
    return resultado;
  }

  /**
   * Salida de kardex reutilizable dentro de una TX existente (KDS / receta).
   * Bloquea la fila de stock; no permite negativo.
   */
  async salidaEnTransaccion(
    qr: QueryRunner,
    params: {
      idInsumo: number;
      idSucursal: number;
      cantidad: number;
      userId: number;
      motivo: string;
      detalle: string | null;
      idLote?: number | null;
    },
  ) {
    const cantidad = this.round4(params.cantidad);
    if (!(cantidad > 0)) return { posterior: null as number | null, id_insumo: params.idInsumo, id_kardex: 0, costo_unitario: 0 };

    await this.validateInsumoActivo(qr, params.idInsumo);
    const stock = await this.lockStock(qr, params.idInsumo, params.idSucursal, params.userId);
    const anterior = this.round4(stock.stock_actual);
    const posterior = this.round4(anterior - cantidad);
    if (posterior < 0) {
      const [nom] = await qr.query(`SELECT nombre FROM insumo WHERE id_insumo = ?`, [params.idInsumo]);
      throw new ConflictException(`Stock insuficiente: ${nom?.nombre || 'insumo'} (hay ${anterior}, pide ${cantidad})`);
    }

    const costoUnitario = this.round4(stock.costo_promedio);
    const updated = await qr.query(
      `UPDATE insumo_stock
       SET stock_actual = ?, id_usuario_mod = ?
       WHERE id_insumo_stock = ? AND estado_registro = 'ACTIVO' AND stock_actual >= ?`,
      [posterior, params.userId, stock.id_insumo_stock, cantidad],
    );
    if (updated.affectedRows === 0) {
      throw new ConflictException('Stock insuficiente o no disponible');
    }

    const idLote = params.idLote ?? null;
    if (idLote) {
      await this.descontarLote(qr, idLote, params.idInsumo, params.idSucursal, cantidad, params.userId);
    }

    const kardexIns = await qr.query(
      `INSERT INTO kardex
       (id_insumo, id_sucursal, id_lote, tipo, cantidad, costo_unitario, costo_total,
        stock_anterior, stock_posterior, motivo, detalle, id_usuario_crea)
       VALUES (?, ?, ?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.idInsumo,
        params.idSucursal,
        idLote,
        cantidad,
        costoUnitario,
        this.round4(cantidad * costoUnitario),
        anterior,
        posterior,
        params.motivo,
        params.detalle,
        params.userId,
      ],
    );
    return {
      posterior,
      id_insumo: params.idInsumo,
      id_kardex: Number(kardexIns.insertId),
      costo_unitario: costoUnitario,
    };
  }

  /** Ingreso dentro de una TX (traslados / recepción). */
  async ingresoEnTransaccion(
    qr: QueryRunner,
    params: {
      idInsumo: number;
      idSucursal: number;
      cantidad: number;
      costoUnitario: number;
      userId: number;
      motivo: string;
      detalle: string | null;
      loteCodigo?: string | null;
      fechaVencimiento?: string | null;
    },
  ) {
    const cantidad = this.round4(params.cantidad);
    if (!(cantidad > 0)) return { id_kardex: 0, id_lote: null as number | null };

    await this.validateInsumoActivo(qr, params.idInsumo);
    await this.validateSucursalActiva(qr, params.idSucursal);
    const stock = await this.lockStock(qr, params.idInsumo, params.idSucursal, params.userId);
    const anterior = this.round4(stock.stock_actual);
    const posterior = this.round4(anterior + cantidad);
    const costoUnitario = this.round4(params.costoUnitario);
    const denom = posterior;
    const costoPromedio = denom > 0
      ? this.round4((anterior * stock.costo_promedio + cantidad * costoUnitario) / denom)
      : costoUnitario;

    await qr.query(
      `UPDATE insumo_stock
       SET stock_actual = ?, costo_promedio = ?, id_usuario_mod = ?
       WHERE id_insumo_stock = ? AND estado_registro = 'ACTIVO'`,
      [posterior, costoPromedio, params.userId, stock.id_insumo_stock],
    );

    let idLote: number | null = null;
    if (params.loteCodigo) {
      const loteIns = await qr.query(
        `INSERT INTO insumo_lote
         (id_insumo, id_sucursal, codigo_lote, fecha_vencimiento, cantidad_actual, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          params.idInsumo,
          params.idSucursal,
          params.loteCodigo,
          params.fechaVencimiento ?? null,
          cantidad,
          params.userId,
        ],
      );
      idLote = Number(loteIns.insertId);
    }

    const costoTotal = this.round4(cantidad * costoUnitario);
    const kardexIns = await qr.query(
      `INSERT INTO kardex
       (id_insumo, id_sucursal, id_lote, tipo, cantidad, costo_unitario, costo_total,
        stock_anterior, stock_posterior, motivo, detalle, id_usuario_crea)
       VALUES (?, ?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.idInsumo,
        params.idSucursal,
        idLote,
        cantidad,
        costoUnitario,
        costoTotal,
        anterior,
        posterior,
        params.motivo,
        params.detalle,
        params.userId,
      ],
    );
    return { id_kardex: Number(kardexIns.insertId), id_lote: idLote };
  }

  /** Merma dentro de una TX (diferencia en recepción de traslado). */
  async mermaEnTransaccion(
    qr: QueryRunner,
    params: {
      idInsumo: number;
      idSucursal: number;
      cantidad: number;
      userId: number;
      motivo: MotivoMerma;
      detalle: string | null;
      idLote?: number | null;
    },
  ) {
    const cantidad = this.round4(params.cantidad);
    if (!(cantidad > 0)) return { id_kardex: 0, id_merma: 0 };

    await this.validateInsumoActivo(qr, params.idInsumo);
    const stock = await this.lockStock(qr, params.idInsumo, params.idSucursal, params.userId);
    const anterior = this.round4(stock.stock_actual);
    const posterior = this.round4(anterior - cantidad);
    if (posterior < 0) throw new ConflictException('Stock insuficiente para registrar merma');

    const costoUnitario = this.round4(stock.costo_promedio);
    const updated = await qr.query(
      `UPDATE insumo_stock
       SET stock_actual = ?, id_usuario_mod = ?
       WHERE id_insumo_stock = ? AND estado_registro = 'ACTIVO' AND stock_actual >= ?`,
      [posterior, params.userId, stock.id_insumo_stock, cantidad],
    );
    if (updated.affectedRows === 0) throw new ConflictException('Stock insuficiente para merma');

    const idLote = params.idLote ?? null;
    if (idLote) {
      await this.descontarLote(qr, idLote, params.idInsumo, params.idSucursal, cantidad, params.userId);
    }

    const costoTotal = this.round4(cantidad * costoUnitario);
    const kardexIns = await qr.query(
      `INSERT INTO kardex
       (id_insumo, id_sucursal, id_lote, tipo, cantidad, costo_unitario, costo_total,
        stock_anterior, stock_posterior, motivo, detalle, id_usuario_crea)
       VALUES (?, ?, ?, 'MERMA', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.idInsumo,
        params.idSucursal,
        idLote,
        cantidad,
        costoUnitario,
        costoTotal,
        anterior,
        posterior,
        params.motivo,
        params.detalle,
        params.userId,
      ],
    );
    const idKardex = Number(kardexIns.insertId);
    const mermaIns = await qr.query(
      `INSERT INTO merma
       (id_kardex, id_insumo, id_sucursal, cantidad, motivo, detalle, costo_total, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idKardex, params.idInsumo, params.idSucursal, cantidad, params.motivo, params.detalle, costoTotal, params.userId],
    );
    return { id_kardex: idKardex, id_merma: Number(mermaIns.insertId) };
  }

  /** Marca productos (y combos que los incluyen) como no disponibles si el insumo quedó en 0. */
  async marcarAgotadosPorInsumos(qr: QueryRunner, idSucursal: number, idInsumos: number[], userId: number) {
    const ids = [...new Set(idInsumos.filter((n) => n > 0))];
    if (!ids.length) return;
    for (const idInsumo of ids) {
      const [st] = await qr.query(
        `SELECT stock_actual FROM insumo_stock
         WHERE id_insumo = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO'`,
        [idInsumo, idSucursal],
      );
      if (!st || Number(st.stock_actual) > 0) continue;

      await qr.query(
        `UPDATE producto_sucursal ps
         INNER JOIN receta r ON r.id_producto = ps.id_producto
           AND r.id_insumo = ? AND r.estado_registro = 'ACTIVO' AND r.vigente_hasta IS NULL
         SET ps.disponible = 0, ps.id_usuario_mod = ?
         WHERE ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO' AND ps.disponible = 1`,
        [idInsumo, userId, idSucursal],
      );
      await qr.query(
        `UPDATE producto_sucursal ps
         INNER JOIN combo_item ci ON ci.id_combo = ps.id_producto AND ci.estado_registro = 'ACTIVO'
         INNER JOIN receta r ON r.id_producto = ci.id_producto
           AND r.id_insumo = ? AND r.estado_registro = 'ACTIVO' AND r.vigente_hasta IS NULL
         SET ps.disponible = 0, ps.id_usuario_mod = ?
         WHERE ps.id_sucursal = ? AND ps.estado_registro = 'ACTIVO' AND ps.disponible = 1`,
        [idInsumo, userId, idSucursal],
      );
    }
  }

  private signoMovimiento(tipo: 'INGRESO' | 'SALIDA' | 'MERMA' | 'AJUSTE', sentido?: 'INGRESO' | 'SALIDA') {
    if (tipo === 'INGRESO') return 1;
    if (tipo === 'SALIDA' || tipo === 'MERMA') return -1;
    if (tipo === 'AJUSTE' && sentido === 'INGRESO') return 1;
    if (tipo === 'AJUSTE' && sentido === 'SALIDA') return -1;
    throw new BadRequestException('Sentido de ajuste inválido');
  }

  private async lockStock(qr: QueryRunner, idInsumo: number, idSucursal: number, userId: number): Promise<StockBloqueado> {
    await this.ensureStockRow(qr, idInsumo, idSucursal, userId);
    const [row] = await qr.query(
      `SELECT id_insumo_stock, stock_actual, costo_promedio, stock_minimo
       FROM insumo_stock
       WHERE id_insumo = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO'
       FOR UPDATE`,
      [idInsumo, idSucursal],
    );
    if (!row) throw new NotFoundException('Stock no encontrado');
    return {
      id_insumo_stock: Number(row.id_insumo_stock),
      stock_actual: Number(row.stock_actual),
      costo_promedio: Number(row.costo_promedio),
      stock_minimo: Number(row.stock_minimo),
    };
  }

  private async ensureStockRow(qr: QueryRunner, idInsumo: number, idSucursal: number, userId: number) {
    await qr.query(
      `INSERT INTO insumo_stock (id_insumo, id_sucursal, stock_actual, stock_minimo, costo_promedio, id_usuario_crea)
       SELECT ?, ?, 0, 0, i.costo_unitario, ?
       FROM insumo i
       WHERE i.id_insumo = ? AND i.estado_registro = 'ACTIVO'
       ON DUPLICATE KEY UPDATE id_insumo_stock = id_insumo_stock`,
      [idInsumo, idSucursal, userId, idInsumo],
    );
  }

  private async descontarLote(
    qr: QueryRunner,
    idLote: number,
    idInsumo: number,
    idSucursal: number,
    cantidad: number,
    userId: number,
  ) {
    const [lote] = await qr.query(
      `SELECT id_lote, cantidad_actual
       FROM insumo_lote
       WHERE id_lote = ? AND id_insumo = ? AND id_sucursal = ? AND estado_registro = 'ACTIVO'
       FOR UPDATE`,
      [idLote, idInsumo, idSucursal],
    );
    if (!lote) throw new NotFoundException('Lote no encontrado en esta sucursal');
    const result = await qr.query(
      `UPDATE insumo_lote
       SET cantidad_actual = cantidad_actual - ?, id_usuario_mod = ?
       WHERE id_lote = ? AND cantidad_actual >= ? AND estado_registro = 'ACTIVO'`,
      [cantidad, userId, idLote, cantidad],
    );
    if (result.affectedRows === 0) throw new ConflictException('El lote no tiene cantidad suficiente');
  }

  private async validateInsumoActivo(qr: QueryRunner, idInsumo: number) {
    const [row] = await qr.query(
      `SELECT id_insumo FROM insumo WHERE id_insumo = ? AND estado_registro = 'ACTIVO'`,
      [idInsumo],
    );
    if (!row) throw new NotFoundException('Insumo no encontrado o inactivo');
  }

  private async validateSucursalActiva(qr: QueryRunner, idSucursal: number) {
    const [row] = await qr.query(
      `SELECT id_sucursal FROM sucursal WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
      [idSucursal],
    );
    if (!row) throw new NotFoundException('Sucursal no encontrada o inactiva');
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

  private addNumberFilter(
    query: any,
    key: string,
    column: string,
    params: any[],
    append: (sql: string) => void,
  ) {
    if (query[key] == null || query[key] === '') return;
    const n = Number(query[key]);
    if (!n || Number.isNaN(n)) throw new BadRequestException(`${key} inválido`);
    params.push(n);
    append(` AND ${column} = ?`);
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

  private isTruthy(value: any) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private round4(value: number) {
    return Math.round(Number(value || 0) * 10000) / 10000;
  }
}
