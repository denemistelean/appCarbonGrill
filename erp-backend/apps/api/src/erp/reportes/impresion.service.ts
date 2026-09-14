import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import { AlcanceService } from '../../common/auth/alcance.service';
import { RequestUser } from '../../common/auth/request-user.interface';
import { EncolarImpresionDto } from './reportes.dto';
import { asciiTicket, construirEscPos80 } from './escpos.util';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

@Injectable()
export class ImpresionService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly alcanceService: AlcanceService,
  ) {}

  async listar(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_sucursal', 'estado']);
    const alcance = await this.alcanceService.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = `WHERE q.estado_registro = 'ACTIVO'`;
    const idSucursal = this.alcanceService.forzarSucursal(query.id_sucursal, alcance);
    if (idSucursal) {
      where += ` AND q.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND q.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    if (query.estado) {
      where += ` AND q.estado = ?`;
      params.push(String(query.estado).toUpperCase());
    }
    const from = `
      FROM cola_impresion q
      INNER JOIN sucursal s ON s.id_sucursal = q.id_sucursal
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT q.id_cola, q.id_sucursal, s.nombre AS sucursal, q.tipo, q.id_referencia, q.titulo,
                q.estado, q.intentos, q.ultimo_error, q.fecha_cola, q.fecha_impreso
         ${from}
         ORDER BY q.fecha_cola DESC, q.id_cola DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);
    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async encolar(dto: EncolarImpresionDto, user: RequestUser) {
    const ticket = await this.armarTicket(dto.tipo, dto.id_referencia, user);
    const escpos = construirEscPos80(ticket.lineas);
    const ins = await this.dataSource.query(
      `INSERT INTO cola_impresion
         (id_sucursal, tipo, id_referencia, titulo, payload_texto, payload_escpos, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ticket.idSucursal,
        dto.tipo,
        dto.id_referencia,
        ticket.titulo,
        ticket.lineas.join('\n'),
        escpos,
        user.idUsuario,
      ],
    );
    const id = Number(ins.insertId);
    await this.auditoriaService.registrar('cola_impresion', id, 'CREAR', user.idUsuario, null, {
      tipo: dto.tipo,
      id_referencia: dto.id_referencia,
    });
    return this.findOne(id, user);
  }

  async reintentar(id: number, user: RequestUser) {
    const actual = await this.findOne(id, user);
    const ticket = await this.armarTicket(actual.tipo, Number(actual.id_referencia), user);
    const escpos = construirEscPos80(ticket.lineas);
    await this.dataSource.query(
      `UPDATE cola_impresion
       SET payload_texto = ?, payload_escpos = ?, estado = 'PENDIENTE', intentos = intentos + 1,
           ultimo_error = NULL, titulo = ?, id_usuario_mod = ?
       WHERE id_cola = ?`,
      [ticket.lineas.join('\n'), escpos, ticket.titulo, user.idUsuario, id],
    );
    await this.auditoriaService.registrar('cola_impresion', id, 'ACTUALIZAR', user.idUsuario, { estado: actual.estado }, {
      accion: 'reintentar',
    });
    return this.findOne(id, user);
  }

  async marcarImpreso(id: number, user: RequestUser) {
    const actual = await this.findOne(id, user);
    await this.dataSource.query(
      `UPDATE cola_impresion
       SET estado = 'IMPRESO', fecha_impreso = NOW(), intentos = intentos + 1, id_usuario_mod = ?
       WHERE id_cola = ?`,
      [user.idUsuario, id],
    );
    await this.auditoriaService.registrar('cola_impresion', id, 'ACTUALIZAR', user.idUsuario, { estado: actual.estado }, {
      estado: 'IMPRESO',
    });
    return this.findOne(id, user);
  }

  async marcarError(id: number, mensaje: string, user: RequestUser) {
    await this.findOne(id, user);
    await this.dataSource.query(
      `UPDATE cola_impresion
       SET estado = 'ERROR', intentos = intentos + 1, ultimo_error = ?, id_usuario_mod = ?
       WHERE id_cola = ?`,
      [String(mensaje || 'Error de impresión').slice(0, 255), user.idUsuario, id],
    );
    return this.findOne(id, user);
  }

  async findOne(id: number, user: RequestUser) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT q.id_cola, q.id_sucursal, s.nombre AS sucursal, q.tipo, q.id_referencia, q.titulo,
              q.payload_texto, q.estado, q.intentos, q.ultimo_error, q.fecha_cola, q.fecha_impreso
       FROM cola_impresion q
       INNER JOIN sucursal s ON s.id_sucursal = q.id_sucursal
       WHERE q.id_cola = ? AND q.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Ticket no encontrado');
    await this.alcanceService.assertAccesoSucursal(Number(row.id_sucursal), user);
    return row;
  }

  async escposBuffer(id: number, user: RequestUser) {
    this.assertId(id);
    const [row] = await this.dataSource.query(
      `SELECT q.id_cola, q.id_sucursal, q.titulo, q.payload_escpos
       FROM cola_impresion q
       WHERE q.id_cola = ? AND q.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Ticket no encontrado');
    await this.alcanceService.assertAccesoSucursal(Number(row.id_sucursal), user);
    return { titulo: row.titulo, buffer: Buffer.from(row.payload_escpos) };
  }

  private async armarTicket(tipo: string, idRef: number, user: RequestUser) {
    if (tipo === 'PRECUENTA') return this.ticketPrecuenta(idRef, user);
    if (tipo === 'COMPROBANTE') return this.ticketComprobante(idRef, user);
    if (tipo === 'COBRO') return this.ticketCobro(idRef, user);
    throw new BadRequestException('Tipo de ticket inválido');
  }

  private async ticketPrecuenta(idPedido: number, user: RequestUser) {
    this.assertId(idPedido);
    const [p] = await this.dataSource.query(
      `SELECT p.id_pedido, p.id_sucursal, p.total, p.estado, m.numero AS mesa, s.nombre AS sucursal
       FROM pedido p
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sucursal s ON s.id_sucursal = p.id_sucursal
       WHERE p.id_pedido = ? AND p.estado_registro = 'ACTIVO'`,
      [idPedido],
    );
    if (!p) throw new NotFoundException('Pedido no encontrado');
    await this.alcanceService.assertAccesoSucursal(Number(p.id_sucursal), user);
    const items = await this.dataSource.query(
      `SELECT i.cantidad, pr.nombre AS producto, ROUND(i.cantidad * i.precio_unitario, 2) AS monto
       FROM pedido_item i
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE i.id_pedido = ? AND i.id_item_padre IS NULL AND i.estado_registro = 'ACTIVO'
         AND i.estado_preparacion <> 'ANULADO'
       ORDER BY i.id_pedido_item`,
      [idPedido],
    );
    const [cta] = await this.dataSource.query(
      `SELECT total, pagado FROM cuenta WHERE id_pedido = ? AND estado_registro = 'ACTIVO' ORDER BY id_cuenta DESC LIMIT 1`,
      [idPedido],
    );
    const total = Number(cta?.total ?? p.total ?? 0);
    const pagado = Number(cta?.pagado || 0);
    const lineas = [
      this.centro('****PRE CUENTA****'),
      this.sep(),
      `Mesa ${p.mesa}  Pedido #${p.id_pedido}`,
      this.sep(),
      ...items.map((i: any) => this.fila(`${i.cantidad}x ${i.producto}`, this.money(i.monto))),
      this.sep(),
      this.fila('TOTAL', `S/ ${this.money(total)}`),
    ];
    if (pagado > 0) {
      lineas.push(this.fila('Pagado', `S/ ${this.money(pagado)}`));
      lineas.push(this.fila('SALDO', `S/ ${this.money(total - pagado)}`));
    }
    return { idSucursal: Number(p.id_sucursal), titulo: `Precuenta mesa ${p.mesa} #${p.id_pedido}`, lineas };
  }

  private async ticketComprobante(idComp: number, user: RequestUser) {
    this.assertId(idComp);
    const [c] = await this.dataSource.query(
      `SELECT c.*, s.nombre AS sucursal
       FROM comprobante c
       INNER JOIN sucursal s ON s.id_sucursal = c.id_sucursal
       WHERE c.id_comprobante = ? AND c.estado_registro = 'ACTIVO'`,
      [idComp],
    );
    if (!c) throw new NotFoundException('Comprobante no encontrado');
    await this.alcanceService.assertAccesoSucursal(Number(c.id_sucursal), user);
    const items = await this.dataSource.query(
      `SELECT * FROM comprobante_item WHERE id_comprobante = ? AND estado_registro = 'ACTIVO' ORDER BY id_comprobante_item`,
      [idComp],
    );
    const tipoEtq = c.tipo === '01' ? 'FACTURA' : c.tipo === '03' ? 'BOLETA' : 'N/CREDITO';
    const nro = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`;
    const lineas = [
      this.centro(c.sucursal),
      this.centro(tipoEtq),
      this.centro(nro),
      this.sep(),
      `Cliente: ${c.razon_social_cliente}`,
      `Doc: ${c.tipo_doc_cliente} ${c.num_doc_cliente || '-'}`,
      this.sep(),
      ...items.map((i: any) => this.fila(`${i.cantidad}x ${i.descripcion}`, this.money(i.total))),
      this.sep(),
      this.fila('OP. GRAVADA', this.money(c.op_gravada)),
      this.fila('IGV 18%', this.money(c.igv)),
      this.fila('TOTAL', `S/ ${this.money(c.total)}`),
      this.sep(),
      this.centro(c.es_contingencia ? 'CONTINGENCIA SUNAT' : String(c.estado)),
      this.centro(c.ose_hash || ''),
    ];
    return { idSucursal: Number(c.id_sucursal), titulo: `${tipoEtq} ${nro}`, lineas };
  }

  private async ticketCobro(idCobro: number, user: RequestUser) {
    this.assertId(idCobro);
    const [c] = await this.dataSource.query(
      `SELECT cob.id_cobro, cob.monto, cob.modo, cob.fecha_cobro, p.id_pedido, p.id_sucursal,
              m.numero AS mesa, s.nombre AS sucursal
       FROM cobro cob
       INNER JOIN cuenta cu ON cu.id_cuenta = cob.id_cuenta
       INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sucursal s ON s.id_sucursal = p.id_sucursal
       WHERE cob.id_cobro = ? AND cob.estado_registro = 'ACTIVO'`,
      [idCobro],
    );
    if (!c) throw new NotFoundException('Cobro no encontrado');
    await this.alcanceService.assertAccesoSucursal(Number(c.id_sucursal), user);
    const medios = await this.dataSource.query(
      `SELECT medio, monto, recibido, vuelto FROM cobro_medio
       WHERE id_cobro = ? AND estado_registro = 'ACTIVO'`,
      [idCobro],
    );
    const lineas = [
      this.centro(c.sucursal),
      this.centro('TICKET DE COBRO'),
      this.sep(),
      `Mesa ${c.mesa}  Pedido #${c.id_pedido}`,
      `Modo ${c.modo}`,
      this.sep(),
      ...medios.map((m: any) => this.fila(m.medio, `S/ ${this.money(m.monto)}`)),
      this.sep(),
      this.fila('TOTAL', `S/ ${this.money(c.monto)}`),
      this.centro('Documento interno'),
    ];
    return { idSucursal: Number(c.id_sucursal), titulo: `Cobro #${c.id_cobro} mesa ${c.mesa}`, lineas };
  }

  private sep() {
    return '-'.repeat(42);
  }

  private centro(t: string) {
    const s = asciiTicket(t).slice(0, 42);
    const pad = Math.max(0, Math.floor((42 - s.length) / 2));
    return ' '.repeat(pad) + s;
  }

  private fila(izq: string, der: string) {
    const right = asciiTicket(der).slice(0, 14);
    const left = asciiTicket(izq).slice(0, 42 - right.length - 1);
    return left.padEnd(42 - right.length) + right;
  }

  private money(n: any) {
    return (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
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
}
