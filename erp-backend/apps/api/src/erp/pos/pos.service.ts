import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RequestUser } from '../../common/auth/request-user.interface';
import { CajaService } from '../caja/caja.service';
import { ComprobantesService } from '../comprobantes/comprobantes.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { PosEmitirCuentaDto, PosVentaDto, TipoVentaPos } from './pos.dto';

@Injectable()
export class PosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly pedidos: PedidosService,
    private readonly caja: CajaService,
    private readonly comprobantes: ComprobantesService,
  ) {}

  tiposVenta() {
    return [
      { codigo: 'NOTA_VENTA', etiqueta: 'Nota de venta', sunat: false },
      { codigo: 'BOLETA_SIMPLE', etiqueta: 'Boleta simple', sunat: false },
      { codigo: 'BOLETA', etiqueta: 'Boleta electrónica', sunat: true, tipo_cpe: '03' },
      { codigo: 'FACTURA', etiqueta: 'Factura electrónica', sunat: true, tipo_cpe: '01' },
    ];
  }

  async productos(query: any, user: RequestUser) {
    const idSucursal = Number(query.id_sucursal);
    if (!idSucursal) throw new BadRequestException('Indique la sucursal');
    const carta = await this.pedidos.cartaPorSucursal(idSucursal);
    const term = String(query.search || '').trim().toLowerCase();
    if (!term) return carta;
    return carta.filter((p: any) =>
      `${p.nombre} ${p.codigo || ''} ${p.categoria || ''}`.toLowerCase().includes(term),
    );
  }

  async vender(dto: PosVentaDto, user: RequestUser) {
    const mesa = await this.asegurarMesaPos(dto.id_sucursal);
    const pedido = await this.pedidos.upsert(null, {
      id_sucursal: dto.id_sucursal,
      id_mesa: Number(mesa.id_mesa),
      notas: dto.notas,
      total_esperado: dto.total_esperado,
      items: dto.items.map((i) => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
      origen: 'POS',
    } as any, user);

    await this.dataSource.query(
      `UPDATE pedido SET origen = 'POS' WHERE id_pedido = ?`,
      [pedido.id_pedido],
    );

    await this.pedidos.confirmar(Number(pedido.id_pedido), { total_esperado: dto.total_esperado }, user);

    const cobrado = await this.caja.cobrar({
      id_pedido: Number(pedido.id_pedido),
      modo: 'COMPLETA',
      total_esperado: dto.total_esperado,
      medios: dto.medios,
    }, user);

    const idCuenta = Number(cobrado?.cuenta?.id_cuenta);
    const cobros = cobrado?.cobros || [];
    const idCobro = Number(cobros[cobros.length - 1]?.id_cobro || 0);

    const cliente = await this.resolverCliente(dto);
    let documento: any = null;
    try {
      documento = await this.emitirSegunTipo({
        tipo: dto.tipo_comprobante,
        idSucursal: dto.id_sucursal,
        idCuenta,
        idCobro,
        total: dto.total_esperado,
        cliente,
        user,
      });
    } catch (e: any) {
      documento = {
        error: e?.message || 'La venta se cobró, pero no se emitió el documento',
        pendiente: true,
        id_cuenta: idCuenta,
      };
    }

    return {
      id_pedido: Number(pedido.id_pedido),
      id_cuenta: idCuenta,
      id_cobro: idCobro,
      tipo_comprobante: dto.tipo_comprobante,
      documento,
      cuenta: cobrado,
    };
  }

  async emitirSegunTipo(opts: {
    tipo: TipoVentaPos;
    idSucursal: number;
    idCuenta: number;
    idCobro: number;
    total: number;
    cliente: { tipo_doc_cliente: string; num_doc_cliente: string | null; razon_social_cliente: string; direccion_cliente: string | null };
    user: RequestUser;
  }) {
    if (opts.tipo === 'BOLETA' || opts.tipo === 'FACTURA') {
      const cpe = opts.tipo === 'FACTURA' ? '01' : '03';
      const [serie] = await this.dataSource.query(
        `SELECT id_serie FROM comprobante_serie
         WHERE id_sucursal = ? AND tipo = ? AND estado_registro = 'ACTIVO'
         ORDER BY id_serie ASC LIMIT 1`,
        [opts.idSucursal, cpe],
      );
      if (!serie) throw new ConflictException(`Configure una serie de ${opts.tipo === 'FACTURA' ? 'factura' : 'boleta'} en Comprobantes`);
      return this.comprobantes.emitir({
        id_cuenta: opts.idCuenta,
        tipo: cpe as '01' | '03',
        id_serie: Number(serie.id_serie),
        tipo_doc_cliente: opts.cliente.tipo_doc_cliente as any,
        num_doc_cliente: opts.cliente.num_doc_cliente || undefined,
        razon_social_cliente: opts.cliente.razon_social_cliente,
        direccion_cliente: opts.cliente.direccion_cliente || undefined,
        total_esperado: opts.total,
        id_cobro: opts.idCobro || undefined,
      }, opts.user);
    }

    return this.emitirInterno({
      ...opts,
      tipo: opts.tipo as 'NOTA_VENTA' | 'BOLETA_SIMPLE',
    });
  }

  async emitirInterno(opts: {
    tipo: 'NOTA_VENTA' | 'BOLETA_SIMPLE';
    idSucursal: number;
    idCuenta: number;
    idCobro: number;
    total: number;
    cliente: { tipo_doc_cliente: string; num_doc_cliente: string | null; razon_social_cliente: string; direccion_cliente: string | null };
    user: RequestUser;
  }) {
    const serie = opts.tipo === 'NOTA_VENTA' ? 'NV01' : 'BS01';
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(MAX(correlativo), 0) + 1 AS n
       FROM documento_interno
       WHERE id_sucursal = ? AND tipo = ? AND serie = ? AND estado_registro = 'ACTIVO'`,
      [opts.idSucursal, opts.tipo, serie],
    );
    const correlativo = Number(row?.n || 1);
    const ins = await this.dataSource.query(
      `INSERT INTO documento_interno
       (id_sucursal, id_cuenta, id_cobro, tipo, serie, correlativo,
        tipo_doc_cliente, num_doc_cliente, razon_social_cliente, direccion_cliente, total, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.idSucursal,
        opts.idCuenta,
        opts.idCobro || null,
        opts.tipo,
        serie,
        correlativo,
        opts.cliente.tipo_doc_cliente,
        opts.cliente.num_doc_cliente,
        opts.cliente.razon_social_cliente,
        opts.cliente.direccion_cliente,
        opts.total,
        opts.user.idUsuario,
      ],
    );
    return {
      tipo: opts.tipo,
      sunat: false,
      id_documento: Number(ins.insertId),
      serie,
      correlativo,
    };
  }

  async emitirDesdeCuenta(dto: PosEmitirCuentaDto, user: RequestUser) {
    const [cuenta] = await this.dataSource.query(
      `SELECT id_cuenta, id_sucursal, id_pedido, estado, pagado
       FROM cuenta WHERE id_cuenta = ? AND estado_registro = 'ACTIVO'`,
      [dto.id_cuenta],
    );
    if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
    if (cuenta.estado === 'ANULADA') throw new ConflictException('La cuenta está anulada');
    const cliente = await this.resolverCliente(dto);
    return this.emitirSegunTipo({
      tipo: dto.tipo_comprobante,
      idSucursal: Number(cuenta.id_sucursal),
      idCuenta: Number(cuenta.id_cuenta),
      idCobro: Number(dto.id_cobro || 0),
      total: dto.total_esperado,
      cliente,
      user,
    });
  }

  async pdfInterno(id: number, user: RequestUser) {
    const [doc] = await this.dataSource.query(
      `SELECT d.*, s.nombre AS sucursal
       FROM documento_interno d
       INNER JOIN sucursal s ON s.id_sucursal = d.id_sucursal
       WHERE d.id_documento = ? AND d.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!doc) throw new NotFoundException('Documento no encontrado');
    const items = await this.dataSource.query(
      `SELECT pr.nombre AS descripcion, i.cantidad, ci.monto AS total
       FROM cuenta_item ci
       INNER JOIN pedido_item i ON i.id_pedido_item = ci.id_pedido_item
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE ci.id_cuenta = ? AND ci.estado_registro = 'ACTIVO'`,
      [doc.id_cuenta],
    );
    const titulo = doc.tipo === 'NOTA_VENTA' ? 'NOTA DE VENTA' : 'BOLETA SIMPLE';
    const filas = (items || []).map((i: any) =>
      `<tr><td>${this.esc(i.descripcion)}</td><td class="r">${Number(i.cantidad).toFixed(2)}</td><td class="r">${Number(i.total).toFixed(2)}</td></tr>`,
    ).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:sans-serif;font-size:12px;width:280px;margin:0;padding:8px}
.r{text-align:right} table{width:100%;border-collapse:collapse}
.foot{margin-top:8px;font-size:10px;text-align:center}
</style></head><body>
  <h3 style="text-align:center;margin:0">${this.esc(doc.sucursal)}</h3>
  <div style="text-align:center">${titulo}<br>${this.esc(doc.serie)}-${String(doc.correlativo).padStart(8,'0')}</div>
  <div>Cliente: ${this.esc(doc.razon_social_cliente)}<br>Doc: ${this.esc(doc.num_doc_cliente || '-')}</div>
  <table>${filas}
    <tr><td colspan="2"><strong>TOTAL</strong></td><td class="r"><strong>S/ ${Number(doc.total).toFixed(2)}</strong></td></tr>
  </table>
  <div class="foot">Documento interno — no es comprobante electrónico SUNAT</div>
</body></html>`;
  }

  private async asegurarMesaPos(idSucursal: number) {
    const [mesa] = await this.dataSource.query(
      `SELECT id_mesa, numero, estado FROM mesa
       WHERE id_sucursal = ? AND numero = 'POS' AND estado_registro = 'ACTIVO' LIMIT 1`,
      [idSucursal],
    );
    if (!mesa) throw new ConflictException('No hay mesa POS en esta sucursal. Ejecute el SQL de POS.');
    const [abierto] = await this.dataSource.query(
      `SELECT id_pedido FROM pedido
       WHERE id_mesa = ? AND estado_registro = 'ACTIVO' AND estado NOT IN ('ENTREGADO','PAGADO','ANULADO')
       LIMIT 1`,
      [mesa.id_mesa],
    );
    if (abierto) throw new ConflictException('Hay una venta de mostrador abierta. Termine el cobro en Caja.');
    return mesa;
  }

  private async resolverCliente(dto: PosVentaDto | PosEmitirCuentaDto) {
    const tipo = dto.tipo_comprobante;
    let tipoDoc = dto.tipo_doc_cliente || '0';
    let num = dto.num_doc_cliente?.trim() || null;
    let razon = (dto.razon_social_cliente || 'CLIENTES VARIOS').trim().toUpperCase();
    let direccion = dto.direccion_cliente?.trim() || null;

    if (dto.id_cliente) {
      const [cli] = await this.dataSource.query(
        `SELECT tipo_documento, numero_documento, razon_social, direccion
         FROM cliente WHERE id_cliente = ? AND estado_registro = 'ACTIVO'`,
        [dto.id_cliente],
      );
      if (!cli) throw new NotFoundException('Cliente no encontrado');
      tipoDoc = this.mapTipoDocCliente(cli.tipo_documento);
      num = String(cli.numero_documento || '').trim() || null;
      razon = String(cli.razon_social || '').trim().toUpperCase();
      direccion = cli.direccion?.trim() || direccion;
    }

    if (tipo === 'FACTURA') {
      tipoDoc = '6';
      if (!num || !/^(10|15|17|20)\d{9}$/.test(num)) {
        throw new BadRequestException('La factura requiere RUC válido (11 dígitos)');
      }
      if (!razon || razon === 'CLIENTES VARIOS') throw new BadRequestException('Indique la razón social del RUC');
    }
    if (tipo === 'BOLETA' && dto.total_esperado >= 700) {
      if (tipoDoc !== '1' || !/^\d{8}$/.test(String(num || ''))) {
        throw new BadRequestException('Boleta de S/ 700 o más requiere DNI');
      }
    }
    return { tipo_doc_cliente: tipoDoc, num_doc_cliente: num, razon_social_cliente: razon, direccion_cliente: direccion };
  }

  private mapTipoDocCliente(tipo: string) {
    const t = String(tipo || '').toUpperCase();
    if (t === 'DNI') return '1';
    if (t === 'RUC') return '6';
    if (t === 'CE') return '4';
    if (t === 'PAS') return '7';
    return '0';
  }

  private esc(v: any) {
    return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  }
}
