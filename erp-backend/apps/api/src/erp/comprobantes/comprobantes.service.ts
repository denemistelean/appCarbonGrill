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
  AnularComprobanteDto,
  CrearSerieDto,
  EmitirComprobanteDto,
  EmitirNotaCreditoDto,
} from './comprobantes.dto';
import { OsePayload, OseService } from './ose.service';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

const IGV = 0.18;
const LIMITE_BOLETA_SIN_DOC = 700;

@Injectable()
export class ComprobantesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly ose: OseService,
  ) {}

  catalogos() {
    return {
      tipos: [
        { codigo: '01', etiqueta: 'Factura' },
        { codigo: '03', etiqueta: 'Boleta' },
        { codigo: '07', etiqueta: 'Nota de crédito' },
      ],
      docs: [
        { codigo: '0', etiqueta: 'Sin documento' },
        { codigo: '1', etiqueta: 'DNI' },
        { codigo: '6', etiqueta: 'RUC' },
        { codigo: '4', etiqueta: 'Carné de extranjería' },
        { codigo: '7', etiqueta: 'Pasaporte' },
      ],
      igv: 18,
      ose_modo: this.ose.modo(),
      ose_falla_contingencia: this.ose.fallaAContingencia(),
      emisor: this.ose.emisor(),
    };
  }

  async listaSucursales(user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    const params: any[] = [];
    let where = `WHERE s.estado_registro = 'ACTIVO' AND s.tipo = 'LOCAL'`;
    if (!alcance.esSuperadmin) {
      where += ` AND s.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    return this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre, s.ruc, s.razon_social, s.nombre_comercial, s.codigo_establecimiento_sunat
       FROM sucursal s ${where} ORDER BY s.nombre ASC`,
      params,
    );
  }

  async listaSeries(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal', 'tipo']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    const params: any[] = [];
    let where = `WHERE cs.estado_registro = 'ACTIVO'`;
    if (idSucursal) {
      where += ` AND cs.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND cs.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    if (query.tipo) {
      where += ` AND cs.tipo = ?`;
      params.push(String(query.tipo));
    }
    return this.dataSource.query(
      `SELECT cs.id_serie, cs.id_sucursal, s.nombre AS sucursal, cs.tipo, cs.serie, cs.correlativo_actual
       FROM comprobante_serie cs
       INNER JOIN sucursal s ON s.id_sucursal = cs.id_sucursal
       ${where}
       ORDER BY s.nombre, cs.tipo, cs.serie`,
      params,
    );
  }

  async crearSerie(dto: CrearSerieDto, user: RequestUser) {
    await this.assertAccesoSucursal(dto.id_sucursal, user);
    const serie = dto.serie.toUpperCase();
    try {
      const ins = await this.dataSource.query(
        `INSERT INTO comprobante_serie (id_sucursal, tipo, serie, correlativo_actual, id_usuario_crea)
         VALUES (?, ?, ?, 0, ?)`,
        [dto.id_sucursal, dto.tipo, serie, user.idUsuario],
      );
      const id = Number(ins.insertId);
      await this.auditoriaService.registrar('comprobante_serie', id, 'CREAR', user.idUsuario, null, dto);
      const [row] = await this.dataSource.query(`SELECT * FROM comprobante_serie WHERE id_serie = ?`, [id]);
      return row;
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
        throw new ConflictException('Ya existe esa serie en la sucursal');
      }
      throw e;
    }
  }

  async findAll(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_sucursal', 'tipo', 'estado', 'id_cuenta', 'search']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE c.estado_registro = 'ACTIVO'`;
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND c.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND c.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    if (query.tipo) {
      where += ` AND c.tipo = ?`;
      params.push(String(query.tipo));
    }
    if (query.estado) {
      where += ` AND c.estado = ?`;
      params.push(String(query.estado).toUpperCase());
    }
    if (query.id_cuenta) {
      const idCuenta = Number(query.id_cuenta);
      if (!idCuenta) throw new BadRequestException('Cuenta inválida');
      where += ` AND c.id_cuenta = ?`;
      params.push(idCuenta);
    }
    if (query.search) {
      const s = `%${String(query.search).trim()}%`;
      where += ` AND (c.serie LIKE ? OR c.razon_social_cliente LIKE ? OR c.num_doc_cliente LIKE ?)`;
      params.push(s, s, s);
    }
    const from = `
      FROM comprobante c
      INNER JOIN sucursal s ON s.id_sucursal = c.id_sucursal
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT c.id_comprobante, c.id_sucursal, s.nombre AS sucursal, c.tipo, c.serie, c.correlativo,
                c.razon_social_cliente, c.num_doc_cliente, c.total, c.estado, c.es_contingencia,
                c.fecha_emision, c.ose_mensaje,
                (c.xml_enviado IS NOT NULL AND c.xml_enviado <> '') AS tiene_xml,
                (c.xml_cdr IS NOT NULL AND c.xml_cdr <> '') AS tiene_cdr
         ${from}
         ORDER BY c.fecha_emision DESC, c.id_comprobante DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);
    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async findOne(id: number, user: RequestUser) {
    this.assertId(id);
    const [cab] = await this.dataSource.query(
      `SELECT c.*, s.nombre AS sucursal, s.codigo_establecimiento_sunat, s.direccion AS sucursal_direccion,
              s.telefono AS sucursal_telefono,
              s.ruc AS emisor_ruc, s.razon_social AS emisor_razon, s.nombre_comercial AS emisor_comercial,
              s.ubigeo AS emisor_ubigeo, s.departamento AS emisor_depto, s.provincia AS emisor_prov,
              s.distrito AS emisor_dist, s.direccion_fiscal AS emisor_dir,
              s.nubefact_url, s.nubefact_token
       FROM comprobante c
       INNER JOIN sucursal s ON s.id_sucursal = c.id_sucursal
       WHERE c.id_comprobante = ? AND c.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!cab) throw new NotFoundException('Comprobante no encontrado');
    await this.assertAccesoSucursal(cab.id_sucursal, user);
    const items = await this.dataSource.query(
      `SELECT * FROM comprobante_item WHERE id_comprobante = ? AND estado_registro = 'ACTIVO' ORDER BY id_comprobante_item`,
      [id],
    );
    return { ...cab, items, emisor: this.emisorDesdeFila(cab), ose_modo: this.ose.modo() };
  }

  async previewCuenta(idCuenta: number, user: RequestUser) {
    this.assertId(idCuenta);
    const cuenta = await this.obtenerCuenta(idCuenta);
    await this.assertAccesoSucursal(cuenta.id_sucursal, user);
    const items = await this.itemsPendientesDeFacturar(idCuenta, null);
    const tot = this.armarLineas(items);
    return {
      cuenta,
      items: tot.lineas,
      op_gravada: tot.opGravada,
      igv: tot.igv,
      total: tot.total,
    };
  }

  async emitir(dto: EmitirComprobanteDto, user: RequestUser) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idComp = 0;
    let payloadOse: OsePayload | null = null;
    try {
      const cuenta = await this.obtenerCuentaTx(qr, dto.id_cuenta);
      await this.assertAccesoSucursal(cuenta.id_sucursal, user);
      if (cuenta.estado !== 'PAGADA' && cuenta.estado !== 'PARCIAL') {
        throw new ConflictException('Solo se emite sobre una cuenta cobrada (parcial o pagada)');
      }

      const serie = await this.lockSerie(qr, dto.id_serie, cuenta.id_sucursal, dto.tipo);
      const itemsDb = await this.itemsPendientesDeFacturar(dto.id_cuenta, dto.ids_cuenta_item, qr);
      if (!itemsDb.length) throw new ConflictException('No hay ítems pendientes de facturar');
      const tot = this.armarLineas(itemsDb);
      this.assertTotal(dto.total_esperado, tot.total);
      this.validarCliente(dto.tipo, dto.tipo_doc_cliente, dto.num_doc_cliente, dto.razon_social_cliente, tot.total);

      const nro = Number(serie.correlativo_actual) + 1;
      await qr.query(
        `UPDATE comprobante_serie SET correlativo_actual = ?, id_usuario_mod = ? WHERE id_serie = ?`,
        [nro, user.idUsuario, serie.id_serie],
      );

      const ins = await qr.query(
        `INSERT INTO comprobante
         (id_sucursal, id_serie, id_cuenta, id_cobro, tipo, serie, correlativo,
          tipo_doc_cliente, num_doc_cliente, razon_social_cliente, direccion_cliente,
          op_gravada, igv, total, estado, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?)`,
        [
          cuenta.id_sucursal,
          serie.id_serie,
          cuenta.id_cuenta,
          dto.id_cobro || null,
          dto.tipo,
          serie.serie,
          nro,
          dto.tipo_doc_cliente,
          dto.num_doc_cliente?.trim() || null,
          dto.razon_social_cliente.trim().toUpperCase(),
          dto.direccion_cliente?.trim() || null,
          tot.opGravada,
          tot.igv,
          tot.total,
          user.idUsuario,
        ],
      );
      idComp = Number(ins.insertId);
      for (const ln of tot.lineas) {
        await qr.query(
          `INSERT INTO comprobante_item
           (id_comprobante, id_cuenta_item, codigo, descripcion, unidad, cantidad,
            valor_unitario, precio_unitario, op_gravada, igv, total, id_usuario_crea)
           VALUES (?, ?, ?, ?, 'NIU', ?, ?, ?, ?, ?, ?, ?)`,
          [
            idComp,
            ln.id_cuenta_item,
            ln.codigo,
            ln.descripcion,
            ln.cantidad,
            ln.valor_unitario,
            ln.precio_unitario,
            ln.op_gravada,
            ln.igv,
            ln.total,
            user.idUsuario,
          ],
        );
      }

      const [suc] = await qr.query(
        `SELECT nombre, direccion, codigo_establecimiento_sunat, ruc, razon_social, nombre_comercial,
                ubigeo, departamento, provincia, distrito, direccion_fiscal, nubefact_url, nubefact_token
         FROM sucursal WHERE id_sucursal = ?`,
        [cuenta.id_sucursal],
      );
      payloadOse = {
        tipo: dto.tipo,
        serie: serie.serie,
        correlativo: nro,
        fechaEmision: new Date(),
        cliente: {
          tipoDoc: dto.tipo_doc_cliente,
          numDoc: dto.num_doc_cliente?.trim() || null,
          razonSocial: dto.razon_social_cliente.trim().toUpperCase(),
          direccion: dto.direccion_cliente?.trim() || null,
        },
        sucursal: {
          codigoEstablecimiento: suc?.codigo_establecimiento_sunat || '0000',
          nombre: suc?.nombre,
          direccion: suc?.direccion_fiscal || suc?.direccion,
        },
        ...this.oseExtras(suc),
        opGravada: tot.opGravada,
        igv: tot.igv,
        total: tot.total,
        items: tot.lineas.map((ln) => ({
          codigo: ln.codigo,
          descripcion: ln.descripcion,
          unidad: 'NIU',
          cantidad: ln.cantidad,
          valorUnitario: ln.valor_unitario,
          precioUnitario: ln.precio_unitario,
          opGravada: ln.op_gravada,
          igv: ln.igv,
          total: ln.total,
        })),
      };
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.enviarOse(idComp, payloadOse!, user.idUsuario);
    await this.auditoriaService.registrar('comprobante', idComp, 'CREAR', user.idUsuario, null, {
      tipo: dto.tipo,
      total: dto.total_esperado,
    });
    return this.findOne(idComp, user);
  }

  async emitirNc(dto: EmitirNotaCreditoDto, user: RequestUser) {
    const orig = await this.findOne(dto.id_comprobante_afectado, user);
    if (orig.tipo === '07') throw new BadRequestException('No se emite NC sobre otra NC');
    if (orig.estado !== 'ACEPTADO') throw new ConflictException('Solo se anula con NC un comprobante ACEPTADO');
    if (['ANULADO'].includes(orig.estado)) throw new ConflictException('El comprobante ya está anulado');

    const [ya] = await this.dataSource.query(
      `SELECT id_comprobante FROM comprobante
       WHERE id_comprobante_afectado = ? AND tipo = '07' AND estado_registro = 'ACTIVO'
         AND estado NOT IN ('ANULADO','RECHAZADO') LIMIT 1`,
      [orig.id_comprobante],
    );
    if (ya) throw new ConflictException('Ya existe una nota de crédito vigente para este documento');
    this.assertTotal(dto.total_esperado, Number(orig.total));

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idComp = 0;
    let payloadOse: OsePayload | null = null;
    try {
      const serie = await this.lockSerie(qr, dto.id_serie, orig.id_sucursal, '07');
      this.assertSerieNc(serie.serie, orig.tipo);
      const nro = Number(serie.correlativo_actual) + 1;
      await qr.query(
        `UPDATE comprobante_serie SET correlativo_actual = ?, id_usuario_mod = ? WHERE id_serie = ?`,
        [nro, user.idUsuario, serie.id_serie],
      );
      const ins = await qr.query(
        `INSERT INTO comprobante
         (id_sucursal, id_serie, id_cuenta, id_comprobante_afectado, tipo, serie, correlativo,
          tipo_doc_cliente, num_doc_cliente, razon_social_cliente, direccion_cliente,
          op_gravada, igv, total, estado, id_usuario_crea)
         VALUES (?, ?, ?, ?, '07', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?)`,
        [
          orig.id_sucursal,
          serie.id_serie,
          orig.id_cuenta,
          orig.id_comprobante,
          serie.serie,
          nro,
          orig.tipo_doc_cliente,
          orig.num_doc_cliente,
          orig.razon_social_cliente,
          orig.direccion_cliente,
          orig.op_gravada,
          orig.igv,
          orig.total,
          user.idUsuario,
        ],
      );
      idComp = Number(ins.insertId);
      for (const it of orig.items) {
        await qr.query(
          `INSERT INTO comprobante_item
           (id_comprobante, id_cuenta_item, codigo, descripcion, unidad, cantidad,
            valor_unitario, precio_unitario, op_gravada, igv, total, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idComp,
            it.id_cuenta_item,
            it.codigo,
            it.descripcion,
            it.unidad,
            it.cantidad,
            it.valor_unitario,
            it.precio_unitario,
            it.op_gravada,
            it.igv,
            it.total,
            user.idUsuario,
          ],
        );
      }
      payloadOse = {
        tipo: '07',
        serie: serie.serie,
        correlativo: nro,
        fechaEmision: new Date(),
        cliente: {
          tipoDoc: orig.tipo_doc_cliente,
          numDoc: orig.num_doc_cliente,
          razonSocial: orig.razon_social_cliente,
          direccion: orig.direccion_cliente,
        },
        sucursal: {
          codigoEstablecimiento: orig.codigo_establecimiento_sunat || '0000',
          nombre: orig.sucursal,
          direccion: orig.emisor_dir || orig.sucursal_direccion,
        },
        ...this.oseExtras(orig),
        opGravada: Number(orig.op_gravada),
        igv: Number(orig.igv),
        total: Number(orig.total),
        items: orig.items.map((it: any) => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          cantidad: Number(it.cantidad),
          valorUnitario: Number(it.valor_unitario),
          precioUnitario: Number(it.precio_unitario),
          opGravada: Number(it.op_gravada),
          igv: Number(it.igv),
          total: Number(it.total),
        })),
        afectado: {
          tipo: orig.tipo,
          serie: orig.serie,
          correlativo: Number(orig.correlativo),
          motivo: dto.motivo.trim(),
        },
      };
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    await this.enviarOse(idComp, payloadOse!, user.idUsuario);
    const nc = await this.findOne(idComp, user);
    if (nc.estado === 'ACEPTADO') {
      await this.dataSource.query(
        `UPDATE comprobante SET estado = 'ANULADO', id_usuario_mod = ? WHERE id_comprobante = ?`,
        [user.idUsuario, orig.id_comprobante],
      );
    }
    await this.auditoriaService.registrar('comprobante', idComp, 'CREAR', user.idUsuario, null, {
      nc_de: orig.id_comprobante,
      motivo: dto.motivo,
    });
    return this.findOne(idComp, user);
  }

  async anular(id: number, dto: AnularComprobanteDto, user: RequestUser) {
    const actual = await this.findOne(id, user);
    if (actual.tipo === '07') throw new ConflictException('Una nota de crédito no se anula por este flujo');
    if (actual.estado === 'ANULADO') throw new ConflictException('Ya está anulado');
    if (actual.estado === 'ACEPTADO') {
      if (!dto.id_serie) throw new BadRequestException('Indique la serie de nota de crédito');
      return this.emitirNc(
        {
          id_comprobante_afectado: id,
          id_serie: dto.id_serie,
          motivo: dto.motivo?.trim() || 'ANULACION',
          total_esperado: Number(actual.total),
        },
        user,
      );
    }
    if (!['REGISTRADO', 'RECHAZADO'].includes(actual.estado)) {
      throw new ConflictException('No se puede anular en este estado');
    }
    await this.dataSource.query(
      `UPDATE comprobante SET estado = 'ANULADO', ose_mensaje = ?, id_usuario_mod = ?
       WHERE id_comprobante = ? AND estado_registro = 'ACTIVO'`,
      [dto.motivo?.trim() || 'Anulado antes de aceptación SUNAT', user.idUsuario, id],
    );
    await this.auditoriaService.registrar('comprobante', id, 'ANULAR', user.idUsuario, { estado: actual.estado }, {
      estado: 'ANULADO',
    });
    return this.findOne(id, user);
  }

  async reenviar(id: number, user: RequestUser) {
    const actual = await this.findOne(id, user);
    if (actual.estado !== 'RECHAZADO' && actual.estado !== 'REGISTRADO') {
      throw new ConflictException('Solo se reenvía un comprobante rechazado o registrado');
    }
    const payload: OsePayload = {
      tipo: actual.tipo,
      serie: actual.serie,
      correlativo: Number(actual.correlativo),
      fechaEmision: new Date(actual.fecha_emision),
      cliente: {
        tipoDoc: actual.tipo_doc_cliente,
        numDoc: actual.num_doc_cliente,
        razonSocial: actual.razon_social_cliente,
        direccion: actual.direccion_cliente,
      },
      sucursal: {
        codigoEstablecimiento: actual.codigo_establecimiento_sunat || '0000',
        nombre: actual.sucursal,
        direccion: actual.emisor_dir || actual.sucursal_direccion,
      },
      ...this.oseExtras(actual),
      opGravada: Number(actual.op_gravada),
      igv: Number(actual.igv),
      total: Number(actual.total),
      items: actual.items.map((it: any) => ({
        codigo: it.codigo,
        descripcion: it.descripcion,
        unidad: it.unidad,
        cantidad: Number(it.cantidad),
        valorUnitario: Number(it.valor_unitario),
        precioUnitario: Number(it.precio_unitario),
        opGravada: Number(it.op_gravada),
        igv: Number(it.igv),
        total: Number(it.total),
      })),
    };
    if (actual.tipo === '07' && actual.id_comprobante_afectado) {
      const [af] = await this.dataSource.query(
        `SELECT tipo, serie, correlativo FROM comprobante WHERE id_comprobante = ?`,
        [actual.id_comprobante_afectado],
      );
      payload.afectado = {
        tipo: af.tipo,
        serie: af.serie,
        correlativo: Number(af.correlativo),
        motivo: actual.ose_mensaje || 'ANULACION',
      };
    }
    await this.enviarOse(id, payload, user.idUsuario);
    await this.auditoriaService.registrar('comprobante', id, 'ACTUALIZAR', user.idUsuario, { estado: actual.estado }, {
      accion: 'reenviar',
    });
    return this.findOne(id, user);
  }

  async reenviarLote(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    const params: any[] = [];
    let where = `WHERE c.estado_registro = 'ACTIVO'
      AND c.estado IN ('RECHAZADO', 'REGISTRADO')
      AND (c.es_contingencia = 1 OR c.estado = 'RECHAZADO')`;
    if (idSucursal) {
      where += ` AND c.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND c.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    const pendientes = await this.dataSource.query(
      `SELECT c.id_comprobante ${where} ORDER BY c.id_comprobante ASC LIMIT 50`,
      params,
    );
    const resultados: { id_comprobante: number; ok: boolean; estado?: string; error?: string }[] = [];
    for (const row of pendientes) {
      try {
        const c = await this.reenviar(Number(row.id_comprobante), user);
        resultados.push({ id_comprobante: Number(row.id_comprobante), ok: true, estado: c.estado });
      } catch (e: any) {
        resultados.push({
          id_comprobante: Number(row.id_comprobante),
          ok: false,
          error: e?.message || 'Error al reenviar',
        });
      }
    }
    return { total: pendientes.length, resultados };
  }

  private async enviarOse(idComp: number, payload: OsePayload, userId: number) {
    await this.dataSource.query(
      `UPDATE comprobante SET estado = 'ENVIADO', id_usuario_mod = ? WHERE id_comprobante = ?`,
      [userId, idComp],
    );
    const r = await this.ose.enviar(payload);
    const estado = r.contingencia ? 'REGISTRADO' : r.aceptado ? 'ACEPTADO' : 'RECHAZADO';
    await this.dataSource.query(
      `UPDATE comprobante
       SET estado = ?, es_contingencia = CASE WHEN ? = 1 THEN 1 ELSE es_contingencia END,
           ose_hash = ?, ose_mensaje = ?, ose_enlace_pdf = ?, xml_enviado = ?, xml_cdr = ?, id_usuario_mod = ?
       WHERE id_comprobante = ?`,
      [
        estado,
        r.contingencia ? 1 : 0,
        r.hash,
        r.mensaje?.slice(0, 500) || null,
        r.enlacePdf,
        r.xmlEnviado,
        r.xmlCdr,
        userId,
        idComp,
      ],
    );
  }

  private async itemsPendientesDeFacturar(idCuenta: number, ids: number[] | null | undefined, qr?: QueryRunner) {
    const db = qr || this.dataSource;
    const extraIds = ids && ids.length
      ? ` AND ci.id_cuenta_item IN (${ids.map(() => '?').join(',')})`
      : '';
    const params: any[] = [idCuenta, ...(ids || [])];
    return db.query(
      `SELECT ci.id_cuenta_item, ci.monto, i.cantidad, pr.codigo, pr.nombre AS producto
       FROM cuenta_item ci
       INNER JOIN pedido_item i ON i.id_pedido_item = ci.id_pedido_item
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE ci.id_cuenta = ? AND ci.estado_registro = 'ACTIVO' AND ci.estado = 'PAGADO'
         AND NOT EXISTS (
           SELECT 1 FROM comprobante_item x
           INNER JOIN comprobante c ON c.id_comprobante = x.id_comprobante
           WHERE x.id_cuenta_item = ci.id_cuenta_item AND x.estado_registro = 'ACTIVO'
             AND c.estado_registro = 'ACTIVO' AND c.estado NOT IN ('ANULADO','RECHAZADO')
             AND c.tipo IN ('01','03')
         )
         ${extraIds}
       ORDER BY ci.id_cuenta_item`,
      params,
    );
  }

  private armarLineas(items: any[]) {
    const lineas = items.map((it) => {
      const cantidad = Number(it.cantidad) || 1;
      const total = this.round2(Number(it.monto));
      const op = this.round2(total / (1 + IGV));
      const igv = this.round2(total - op);
      return {
        id_cuenta_item: Number(it.id_cuenta_item),
        codigo: it.codigo || null,
        descripcion: String(it.producto || 'ITEM').toUpperCase(),
        cantidad,
        valor_unitario: this.round4(op / cantidad),
        precio_unitario: this.round2(total / cantidad),
        op_gravada: op,
        igv,
        total,
      };
    });
    let opGravada = this.round2(lineas.reduce((s, l) => s + l.op_gravada, 0));
    let igv = this.round2(lineas.reduce((s, l) => s + l.igv, 0));
    const total = this.round2(lineas.reduce((s, l) => s + l.total, 0));
    const esperadoOp = this.round2(total / (1 + IGV));
    const esperadoIgv = this.round2(total - esperadoOp);
    if (lineas.length && (opGravada !== esperadoOp || igv !== esperadoIgv)) {
      const last = lineas[lineas.length - 1];
      last.op_gravada = this.round2(last.op_gravada + (esperadoOp - opGravada));
      last.igv = this.round2(last.igv + (esperadoIgv - igv));
      opGravada = esperadoOp;
      igv = esperadoIgv;
    }
    return { lineas, opGravada, igv, total };
  }

  private emisorDesdeFila(s: any) {
    return this.ose.emisor({
      ruc: s?.ruc || s?.emisor_ruc,
      razonSocial: s?.razon_social || s?.emisor_razon,
      nombreComercial: s?.nombre_comercial || s?.emisor_comercial,
      ubigeo: s?.ubigeo || s?.emisor_ubigeo,
      direccion: s?.direccion_fiscal || s?.emisor_dir || s?.direccion || s?.sucursal_direccion,
      departamento: s?.departamento || s?.emisor_depto,
      provincia: s?.provincia || s?.emisor_prov,
      distrito: s?.distrito || s?.emisor_dist,
    });
  }

  private oseExtras(s: any): Pick<OsePayload, 'emisor' | 'nubefact'> {
    return {
      emisor: this.emisorDesdeFila(s),
      nubefact: { url: s?.nubefact_url, token: s?.nubefact_token },
    };
  }

  private validarCliente(tipo: string, tipoDoc: string, num: string | undefined, razon: string, total: number) {
    if (!razon?.trim()) throw new BadRequestException('Indique el nombre o razón social');
    if (tipo === '01') {
      if (tipoDoc !== '6' || !/^(10|15|17|20)\d{9}$/.test(String(num || ''))) {
        throw new BadRequestException('La factura requiere RUC válido (11 dígitos)');
      }
    }
    if (tipo === '03') {
      if (total >= LIMITE_BOLETA_SIN_DOC) {
        if (tipoDoc !== '1' || !/^\d{8}$/.test(String(num || ''))) {
          throw new BadRequestException('Boleta de S/ 700 o más requiere DNI');
        }
      }
      if (tipoDoc === '1' && num && !/^\d{8}$/.test(num)) throw new BadRequestException('DNI inválido');
      if (tipoDoc === '6' && num && !/^\d{11}$/.test(num)) throw new BadRequestException('RUC inválido');
    }
  }

  private assertSerieNc(serie: string, tipoOrig: string) {
    const s = String(serie).toUpperCase();
    if (tipoOrig === '01' && !s.startsWith('F')) {
      throw new BadRequestException('La NC de una factura debe usar serie que inicie con F');
    }
    if (tipoOrig === '03' && !s.startsWith('B')) {
      throw new BadRequestException('La NC de una boleta debe usar serie que inicie con B');
    }
  }

  private async lockSerie(qr: QueryRunner, idSerie: number, idSucursal: number, tipo: string) {
    const [row] = await qr.query(
      `SELECT id_serie, id_sucursal, tipo, serie, correlativo_actual
       FROM comprobante_serie
       WHERE id_serie = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
      [idSerie],
    );
    if (!row) throw new NotFoundException('Serie no encontrada');
    if (Number(row.id_sucursal) !== Number(idSucursal)) {
      throw new ForbiddenException('La serie no pertenece a la sucursal');
    }
    if (row.tipo !== tipo) throw new BadRequestException('La serie no corresponde al tipo de comprobante');
    return row;
  }

  private async obtenerCuenta(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT c.id_cuenta, c.id_sucursal, c.id_mesa, c.id_pedido, c.estado, c.total, c.pagado,
              m.numero AS mesa
       FROM cuenta c INNER JOIN mesa m ON m.id_mesa = c.id_mesa
       WHERE c.id_cuenta = ? AND c.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return row;
  }

  private async obtenerCuentaTx(qr: QueryRunner, id: number) {
    const [row] = await qr.query(
      `SELECT c.id_cuenta, c.id_sucursal, c.id_mesa, c.id_pedido, c.estado, c.total, c.pagado
       FROM cuenta c WHERE c.id_cuenta = ? AND c.estado_registro = 'ACTIVO' FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return row;
  }

  private assertTotal(esperado: number, calculado: number) {
    if (this.round2(esperado) !== this.round2(calculado)) {
      throw new BadRequestException('Alerta de seguridad: totales no coinciden');
    }
  }

  private async assertAccesoSucursal(idSucursal: number, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    if (!alcance.esSuperadmin && Number(idSucursal) !== alcance.idSucursal) {
      throw new ForbiddenException('No puede operar otra sucursal');
    }
  }

  private async resolverAlcance(user: RequestUser): Promise<AlcanceSucursal> {
    const [rol] = await this.dataSource.query(`SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`, [user.idRol]);
    const nombre = String(rol?.nombre || '');
    const esSuperadmin = nombre === 'SUPERADMIN';
    if (esSuperadmin) return { esSuperadmin: true, idSucursal: null, rol: nombre };
    const [asig] = await this.dataSource.query(
      `SELECT a.id_sucursal FROM sucursal_asignacion a
       INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
       WHERE a.id_usuario = ? AND a.estado_registro = 'ACTIVO' AND a.vigente_hasta IS NULL AND s.estado_registro = 'ACTIVO'
       ORDER BY a.id_asignacion DESC LIMIT 1`,
      [user.idUsuario],
    );
    const idSucursal = Number(asig?.id_sucursal || 0);
    if (!idSucursal) throw new ForbiddenException('Usuario sin sucursal asignada');
    return { esSuperadmin: false, idSucursal, rol: nombre };
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

  private round4(n: number) {
    return Math.round(Number(n || 0) * 10000) / 10000;
  }

}
