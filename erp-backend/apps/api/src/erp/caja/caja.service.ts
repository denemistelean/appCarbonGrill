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
import { CartaService } from '../carta/carta.service';
import { AbrirTurnoDto, CerrarTurnoDto, CobrarDto, CobroMedioDto } from './caja.dto';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

@Injectable()
export class CajaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly cartaService: CartaService,
  ) {}

  catalogos() {
    return {
      medios: [
        { codigo: 'EFECTIVO', etiqueta: 'Efectivo' },
        { codigo: 'TARJETA', etiqueta: 'Tarjeta' },
        { codigo: 'YAPE', etiqueta: 'Yape' },
        { codigo: 'PLIN', etiqueta: 'Plin' },
      ],
      modos: [
        { codigo: 'COMPLETA', etiqueta: 'Cuenta completa' },
        { codigo: 'ITEMS', etiqueta: 'Por ítems' },
        { codigo: 'PARTES', etiqueta: 'Partes iguales' },
      ],
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
      `SELECT s.id_sucursal, s.codigo, s.nombre FROM sucursal s ${where} ORDER BY s.nombre ASC`,
      params,
    );
  }

  async turnoActual(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    const [turno] = await this.dataSource.query(
      `SELECT t.id_turno, t.id_sucursal, s.nombre AS sucursal, t.id_cajero,
              CONCAT(u.nombres, ' ', u.apellidos) AS cajero,
              t.estado, t.monto_apertura, t.fecha_apertura, t.notas
       FROM caja_turno t
       INNER JOIN sucursal s ON s.id_sucursal = t.id_sucursal
       INNER JOIN sis_usuario u ON u.id_usuario = t.id_cajero
       WHERE t.id_sucursal = ? AND t.estado = 'ABIERTO' AND t.estado_registro = 'ACTIVO'
       ORDER BY t.id_turno DESC LIMIT 1`,
      [idSucursal],
    );
    if (!turno) return null;
    const resumen = await this.resumenTurnoInternal(Number(turno.id_turno));
    return { ...turno, resumen };
  }

  async abrirTurno(dto: AbrirTurnoDto, user: RequestUser) {
    await this.assertAccesoSucursal(dto.id_sucursal, user);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idTurno = 0;
    try {
      const [abierto] = await qr.query(
        `SELECT id_turno FROM caja_turno
         WHERE id_sucursal = ? AND estado = 'ABIERTO' AND estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [dto.id_sucursal],
      );
      if (abierto) throw new ConflictException('Ya hay un turno abierto en esta sucursal');
      const ins = await qr.query(
        `INSERT INTO caja_turno (id_sucursal, id_cajero, estado, monto_apertura, notas, id_usuario_crea)
         VALUES (?, ?, 'ABIERTO', ?, ?, ?)`,
        [dto.id_sucursal, user.idUsuario, this.round2(dto.monto_apertura), dto.notas?.trim() || null, user.idUsuario],
      );
      idTurno = Number(ins.insertId);
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
    const created = await this.turnoPorId(idTurno, user);
    await this.auditoriaService.registrar('caja_turno', idTurno, 'CREAR', user.idUsuario, null, {
      monto_apertura: dto.monto_apertura,
    });
    return created;
  }

  async cerrarTurno(id: number, dto: CerrarTurnoDto, user: RequestUser) {
    this.assertId(id);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [turno] = await qr.query(
        `SELECT id_turno, id_sucursal, estado, monto_apertura
         FROM caja_turno WHERE id_turno = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
        [id],
      );
      if (!turno) throw new NotFoundException('Turno no encontrado');
      await this.assertAccesoSucursal(turno.id_sucursal, user);
      if (turno.estado !== 'ABIERTO') throw new ConflictException('El turno ya está cerrado');

      const resumen = await this.resumenTurnoInternal(id, qr);
      const esperado = this.round2(Number(turno.monto_apertura) + Number(resumen.efectivo_neto || 0));
      const contado = this.round2(dto.monto_cierre_contado);
      const diferencia = this.round2(contado - esperado);

      await qr.query(
        `UPDATE caja_turno
         SET estado = 'CERRADO', monto_cierre_esperado = ?, monto_cierre_contado = ?, diferencia = ?,
             fecha_cierre = NOW(), notas = COALESCE(?, notas), id_usuario_mod = ?
         WHERE id_turno = ? AND estado_registro = 'ACTIVO'`,
        [esperado, contado, diferencia, dto.notas?.trim() || null, user.idUsuario, id],
      );
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
    const updated = await this.turnoPorId(id, user);
    await this.auditoriaService.registrar('caja_turno', id, 'ACTUALIZAR', user.idUsuario, { estado: 'ABIERTO' }, {
      estado: 'CERRADO',
      monto_cierre_contado: dto.monto_cierre_contado,
    });
    return updated;
  }

  async historialTurnos(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['page', 'limit', 'id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const page = this.toPositiveNumber(query.page, 1);
    const limit = Math.min(this.toPositiveNumber(query.limit, 10), 100);
    const offset = (page - 1) * limit;
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    const params: any[] = [];
    let where = `WHERE t.estado_registro = 'ACTIVO'`;
    if (idSucursal) {
      where += ` AND t.id_sucursal = ?`;
      params.push(idSucursal);
    } else if (!alcance.esSuperadmin) {
      where += ` AND t.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    const from = `
      FROM caja_turno t
      INNER JOIN sucursal s ON s.id_sucursal = t.id_sucursal
      INNER JOIN sis_usuario u ON u.id_usuario = t.id_cajero
      ${where}
    `;
    const [data, totalRows] = await Promise.all([
      this.dataSource.query(
        `SELECT t.id_turno, t.id_sucursal, s.nombre AS sucursal, t.estado,
                t.monto_apertura, t.monto_cierre_esperado, t.monto_cierre_contado, t.diferencia,
                t.fecha_apertura, t.fecha_cierre, CONCAT(u.nombres, ' ', u.apellidos) AS cajero
         ${from}
         ORDER BY t.fecha_apertura DESC, t.id_turno DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.query(`SELECT COUNT(*) AS total ${from}`, params),
    ]);
    return { data, meta: { total: Number(totalRows[0]?.total || 0), page, limit } };
  }

  async turnoPorId(id: number, user: RequestUser) {
    this.assertId(id);
    const [turno] = await this.dataSource.query(
      `SELECT t.id_turno, t.id_sucursal, s.nombre AS sucursal, t.id_cajero,
              CONCAT(u.nombres, ' ', u.apellidos) AS cajero,
              t.estado, t.monto_apertura, t.monto_cierre_esperado, t.monto_cierre_contado, t.diferencia,
              t.fecha_apertura, t.fecha_cierre, t.notas
       FROM caja_turno t
       INNER JOIN sucursal s ON s.id_sucursal = t.id_sucursal
       INNER JOIN sis_usuario u ON u.id_usuario = t.id_cajero
       WHERE t.id_turno = ? AND t.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!turno) throw new NotFoundException('Turno no encontrado');
    await this.assertAccesoSucursal(turno.id_sucursal, user);
    const resumen = await this.resumenTurnoInternal(id);
    const cobros = await this.dataSource.query(
      `SELECT cob.id_cobro, cob.monto, cob.modo, cob.fecha_cobro, cob.estado,
              c.id_pedido, m.numero AS mesa
       FROM cobro cob
       INNER JOIN cuenta c ON c.id_cuenta = cob.id_cuenta
       INNER JOIN mesa m ON m.id_mesa = c.id_mesa
       WHERE cob.id_turno = ? AND cob.estado_registro = 'ACTIVO'
       ORDER BY cob.id_cobro DESC`,
      [id],
    );
    return { ...turno, resumen, cobros };
  }

  async pendientes(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.exigirSucursal(query.id_sucursal, alcance);
    const rows = await this.dataSource.query(
      `SELECT p.id_pedido, p.id_mesa, m.numero AS mesa, m.estado AS estado_mesa,
              p.estado AS estado_pedido, p.total, p.fecha_pedido, p.fecha_confirma,
              CONCAT(u.nombres, ' ', u.apellidos) AS mozo,
              c.id_cuenta, c.estado AS estado_cuenta, c.pagado
       FROM pedido p
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sis_usuario u ON u.id_usuario = p.id_mozo
       LEFT JOIN cuenta c ON c.id_pedido = p.id_pedido AND c.estado_registro = 'ACTIVO'
       WHERE p.id_sucursal = ? AND p.estado_registro = 'ACTIVO'
         AND p.estado NOT IN ('PENDIENTE_CONFIRMACION', 'ANULADO', 'PAGADO')
       ORDER BY (m.estado = 'PIDIENDO_CUENTA') DESC, p.fecha_confirma ASC, p.id_pedido ASC`,
      [idSucursal],
    );
    return rows.map((r: any) => ({
      ...r,
      saldo: this.round2(Number(r.total) - Number(r.pagado || 0)),
    }));
  }

  async detalleCuenta(idPedido: number, user: RequestUser) {
    this.assertId(idPedido);
    const pedido = await this.obtenerPedido(idPedido);
    await this.assertAccesoSucursal(pedido.id_sucursal, user);
    const cuenta = await this.asegurarCuenta(idPedido, user.idUsuario, null);
    const items = await this.dataSource.query(
      `SELECT ci.id_cuenta_item, ci.id_pedido_item, ci.monto, ci.estado,
              i.cantidad, i.precio_unitario, i.notas, i.persona_asociada, i.estacion,
              pr.nombre AS producto, pr.codigo, pr.es_combo
       FROM cuenta_item ci
       INNER JOIN pedido_item i ON i.id_pedido_item = ci.id_pedido_item
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE ci.id_cuenta = ? AND ci.estado_registro = 'ACTIVO'
       ORDER BY ci.id_cuenta_item ASC`,
      [cuenta.id_cuenta],
    );
    const partes = await this.dataSource.query(
      `SELECT id_cuenta_parte, n_parte, monto, estado, id_cobro
       FROM cuenta_parte WHERE id_cuenta = ? AND estado_registro = 'ACTIVO' ORDER BY n_parte ASC`,
      [cuenta.id_cuenta],
    );
    const cobros = await this.dataSource.query(
      `SELECT cob.id_cobro, cob.modo, cob.monto, cob.fecha_cobro, cob.estado,
              CONCAT(u.nombres, ' ', u.apellidos) AS cajero
       FROM cobro cob
       INNER JOIN sis_usuario u ON u.id_usuario = cob.id_usuario_crea
       WHERE cob.id_cuenta = ? AND cob.estado_registro = 'ACTIVO'
       ORDER BY cob.id_cobro ASC`,
      [cuenta.id_cuenta],
    );
    const ids = cobros.map((c: any) => c.id_cobro);
    const medios = ids.length
      ? await this.dataSource.query(
          `SELECT id_cobro, medio, monto, recibido, vuelto, referencia
           FROM cobro_medio WHERE estado_registro = 'ACTIVO' AND id_cobro IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : [];
    const mediosPor = medios.reduce((acc: Record<number, any[]>, row: any) => {
      const k = Number(row.id_cobro);
      if (!acc[k]) acc[k] = [];
      acc[k].push(row);
      return acc;
    }, {});
    return {
      pedido,
      cuenta: {
        ...cuenta,
        saldo: this.round2(Number(cuenta.total) - Number(cuenta.pagado)),
      },
      items,
      partes,
      cobros: cobros.map((c: any) => ({ ...c, medios: mediosPor[Number(c.id_cobro)] || [] })),
    };
  }

  async pedirCuenta(idPedido: number, user: RequestUser) {
    this.assertId(idPedido);
    const pedido = await this.obtenerPedido(idPedido);
    await this.assertAccesoSucursal(pedido.id_sucursal, user);
    if (['PENDIENTE_CONFIRMACION', 'ANULADO', 'PAGADO'].includes(pedido.estado)) {
      throw new ConflictException('Este pedido no puede pedir cuenta');
    }
    await this.dataSource.query(
      `UPDATE mesa SET estado = 'PIDIENDO_CUENTA', id_usuario_mod = ?
       WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
      [user.idUsuario, pedido.id_mesa, pedido.id_mesa],
    );
    await this.auditoriaService.registrar('mesa', Number(pedido.id_mesa), 'ACTUALIZAR', user.idUsuario, null, {
      estado: 'PIDIENDO_CUENTA',
      id_pedido: idPedido,
    });
    return this.detalleCuenta(idPedido, user);
  }

  async precuentaHtml(idPedido: number, user: RequestUser) {
    const det = await this.detalleCuenta(idPedido, user);
    const suc = det.pedido.sucursal;
    const mesa = det.pedido.mesa;
    const filas = det.items
      .map(
        (i: any) => `
        <tr>
          <td>${this.esc(i.cantidad)} × ${this.esc(i.producto)}${i.notas ? `<div class="n">${this.esc(i.notas)}</div>` : ''}</td>
          <td class="r">${this.money(i.monto)}</td>
        </tr>`,
      )
      .join('');
    return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 8px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .m { color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .n { font-size: 10px; color: #666; }
  .tot { border-top: 1px dashed #000; font-weight: bold; font-size: 14px; }
  .foot { margin-top: 10px; font-size: 10px; text-align: center; }
</style></head>
<body>
  <h1>PRE-CUENTA</h1>
  <div class="m">${this.esc(suc)} · Mesa ${this.esc(mesa)}<br>Pedido #${det.pedido.id_pedido}</div>
  <table>
    ${filas}
    <tr class="tot"><td>TOTAL</td><td class="r">S/ ${this.money(det.cuenta.total)}</td></tr>
    ${Number(det.cuenta.pagado) > 0 ? `<tr><td>Pagado</td><td class="r">S/ ${this.money(det.cuenta.pagado)}</td></tr>
    <tr class="tot"><td>SALDO</td><td class="r">S/ ${this.money(det.cuenta.saldo)}</td></tr>` : ''}
  </table>
  <div class="foot">Documento interno — no es comprobante SUNAT</div>
</body></html>`;
  }

  async cobrar(dto: CobrarDto, user: RequestUser) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let idCobro = 0;
    let idPedido = dto.id_pedido;
    let cerrarSesionQr = 0;
    try {
      const [pedido] = await qr.query(
        `SELECT id_pedido, id_sucursal, id_mesa, estado, total
         FROM pedido WHERE id_pedido = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
        [dto.id_pedido],
      );
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      await this.assertAccesoSucursal(pedido.id_sucursal, user);
      if (['PENDIENTE_CONFIRMACION', 'ANULADO', 'PAGADO'].includes(pedido.estado)) {
        throw new ConflictException('El pedido no está listo para cobro');
      }

      const turno = await this.exigirTurnoAbierto(qr, Number(pedido.id_sucursal));
      const cuenta = await this.asegurarCuentaTx(qr, pedido, turno.id_turno, user.idUsuario);
      if (cuenta.estado === 'PAGADA' || cuenta.estado === 'ANULADA') {
        throw new ConflictException('La cuenta ya está cerrada');
      }

      const { montoCobro, aplicar } = await this.resolverMontoCobro(qr, cuenta, dto);
      this.assertTotal(dto.total_esperado, montoCobro);
      this.validarMedios(dto.medios, montoCobro);

      const ins = await qr.query(
        `INSERT INTO cobro (id_cuenta, id_turno, modo, monto, notas, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cuenta.id_cuenta, turno.id_turno, dto.modo, montoCobro, dto.notas?.trim() || null, user.idUsuario],
      );
      idCobro = Number(ins.insertId);

      for (const m of dto.medios) {
        const monto = this.round2(m.monto);
        let recibido: number | null = null;
        let vuelto: number | null = null;
        if (m.medio === 'EFECTIVO') {
          recibido = this.round2(m.recibido ?? monto);
          if (recibido < monto) throw new BadRequestException('El efectivo recibido no cubre el monto');
          vuelto = this.round2(recibido - monto);
        }
        await qr.query(
          `INSERT INTO cobro_medio (id_cobro, medio, monto, recibido, vuelto, referencia, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [idCobro, m.medio, monto, recibido, vuelto, m.referencia?.trim() || null, user.idUsuario],
        );
      }

      if (aplicar.tipo === 'ITEMS' || aplicar.tipo === 'COMPLETA') {
        for (const idItem of aplicar.ids) {
          await qr.query(
            `UPDATE cuenta_item SET estado = 'PAGADO', id_cobro = ?
             WHERE id_cuenta_item = ? AND estado = 'PENDIENTE' AND estado_registro = 'ACTIVO'`,
            [idCobro, idItem],
          );
        }
      }
      if (aplicar.tipo === 'PARTES') {
        await qr.query(
          `UPDATE cuenta_parte SET estado = 'PAGADA', id_cobro = ?
           WHERE id_cuenta_parte = ? AND estado = 'PENDIENTE' AND estado_registro = 'ACTIVO'`,
          [idCobro, aplicar.idParte],
        );
      }

      const pagado = this.round2(Number(cuenta.pagado) + montoCobro);
      const total = this.round2(Number(cuenta.total));
      let estadoCuenta = pagado >= total ? 'PAGADA' : 'PARCIAL';
      await qr.query(
        `UPDATE cuenta SET pagado = ?, estado = ?, tipo_division = COALESCE(tipo_division, ?),
                id_turno = ?, id_usuario_mod = ?
         WHERE id_cuenta = ? AND estado_registro = 'ACTIVO'`,
        [pagado, estadoCuenta, dto.modo, turno.id_turno, user.idUsuario, cuenta.id_cuenta],
      );

      if (estadoCuenta === 'PAGADA') {
        await qr.query(
          `UPDATE pedido SET estado = 'PAGADO', id_usuario_mod = ?
           WHERE id_pedido = ? AND estado_registro = 'ACTIVO'`,
          [user.idUsuario, pedido.id_pedido],
        );
        const [mesaRow] = await qr.query(`SELECT numero FROM mesa WHERE id_mesa = ?`, [pedido.id_mesa]);
        const estadoMesa = mesaRow?.numero === 'POS' ? 'LIBRE' : 'LIMPIEZA';
        await qr.query(
          `UPDATE mesa SET estado = ?, id_usuario_mod = ?
           WHERE (id_mesa = ? OR mesa_padre_id = ?) AND estado_registro = 'ACTIVO'`,
          [estadoMesa, user.idUsuario, pedido.id_mesa, pedido.id_mesa],
        );
        cerrarSesionQr = Number(pedido.id_mesa);
      }

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    if (cerrarSesionQr) {
      await this.cartaService.cerrarSesionesMesa(cerrarSesionQr, user.idUsuario);
    }

    await this.auditoriaService.registrar('cobro', idCobro, 'CREAR', user.idUsuario, null, {
      id_pedido: idPedido,
      monto: dto.total_esperado,
      modo: dto.modo,
    });
    return this.detalleCuenta(idPedido, user);
  }

  private async resolverMontoCobro(qr: QueryRunner, cuenta: any, dto: CobrarDto) {
    if (dto.modo === 'COMPLETA') {
      if (cuenta.tipo_division === 'PARTES') {
        throw new ConflictException('La cuenta ya se divide en partes iguales');
      }
      const pendientes = await qr.query(
        `SELECT id_cuenta_item, monto FROM cuenta_item
         WHERE id_cuenta = ? AND estado = 'PENDIENTE' AND estado_registro = 'ACTIVO'`,
        [cuenta.id_cuenta],
      );
      if (!pendientes.length) throw new ConflictException('No hay saldo pendiente');
      const monto = this.round2(pendientes.reduce((s: number, r: any) => s + Number(r.monto), 0));
      return { montoCobro: monto, aplicar: { tipo: 'COMPLETA' as const, ids: pendientes.map((r: any) => Number(r.id_cuenta_item)) } };
    }

    if (dto.modo === 'ITEMS') {
      if (cuenta.tipo_division === 'PARTES') {
        throw new ConflictException('La cuenta ya está dividida en partes iguales');
      }
      const ids = [...new Set((dto.ids_items || []).map((n) => Number(n)).filter((n) => n > 0))];
      if (!ids.length) throw new BadRequestException('Debe indicar los ítems a cobrar');
      const rows = await qr.query(
        `SELECT id_cuenta_item, id_pedido_item, monto, estado
         FROM cuenta_item
         WHERE id_cuenta = ? AND id_pedido_item IN (${ids.map(() => '?').join(',')}) AND estado_registro = 'ACTIVO'`,
        [cuenta.id_cuenta, ...ids],
      );
      if (rows.length !== ids.length) throw new BadRequestException('Ítem no pertenece a la cuenta');
      if (rows.some((r: any) => r.estado !== 'PENDIENTE')) {
        throw new ConflictException('Hay ítems que ya fueron cobrados');
      }
      const monto = this.round2(rows.reduce((s: number, r: any) => s + Number(r.monto), 0));
      return { montoCobro: monto, aplicar: { tipo: 'ITEMS' as const, ids: rows.map((r: any) => Number(r.id_cuenta_item)) } };
    }

    // PARTES
    if (cuenta.tipo_division === 'ITEMS') {
      throw new ConflictException('La cuenta ya se divide por ítems');
    }
    let partes = await qr.query(
      `SELECT id_cuenta_parte, n_parte, monto, estado FROM cuenta_parte
       WHERE id_cuenta = ? AND estado_registro = 'ACTIVO' ORDER BY n_parte ASC FOR UPDATE`,
      [cuenta.id_cuenta],
    );
    if (!partes.length) {
      const n = Number(dto.n_partes || 0);
      if (n < 2 || n > 12) throw new BadRequestException('Indique entre 2 y 12 partes');
      const saldo = this.round2(Number(cuenta.total) - Number(cuenta.pagado));
      const montos = this.repartir(saldo, n);
      for (let i = 0; i < n; i++) {
        await qr.query(
          `INSERT INTO cuenta_parte (id_cuenta, n_parte, monto, estado, id_usuario_crea)
           VALUES (?, ?, ?, 'PENDIENTE', ?)`,
          [cuenta.id_cuenta, i + 1, montos[i], cuenta.id_usuario_crea],
        );
      }
      await qr.query(
        `UPDATE cuenta SET tipo_division = 'PARTES', n_partes = ?, id_usuario_mod = ?
         WHERE id_cuenta = ?`,
        [n, cuenta.id_usuario_crea, cuenta.id_cuenta],
      );
      partes = await qr.query(
        `SELECT id_cuenta_parte, n_parte, monto, estado FROM cuenta_parte
         WHERE id_cuenta = ? AND estado_registro = 'ACTIVO' ORDER BY n_parte ASC`,
        [cuenta.id_cuenta],
      );
    }
    const nParte = Number(dto.n_parte || 0);
    const parte = partes.find((p: any) => Number(p.n_parte) === nParte) || partes.find((p: any) => p.estado === 'PENDIENTE');
    if (!parte) throw new ConflictException('No hay partes pendientes');
    if (parte.estado !== 'PENDIENTE') throw new ConflictException('Esa parte ya está pagada');
    return {
      montoCobro: this.round2(Number(parte.monto)),
      aplicar: { tipo: 'PARTES' as const, idParte: Number(parte.id_cuenta_parte) },
    };
  }

  private validarMedios(medios: CobroMedioDto[], esperado: number) {
    const suma = this.round2(medios.reduce((s, m) => s + Number(m.monto), 0));
    this.assertTotal(suma, esperado);
  }

  private async asegurarCuenta(idPedido: number, userId: number, idTurno: number | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [pedido] = await qr.query(
        `SELECT id_pedido, id_sucursal, id_mesa, total FROM pedido
         WHERE id_pedido = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
        [idPedido],
      );
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      const cuenta = await this.asegurarCuentaTx(qr, pedido, idTurno, userId);
      await qr.commitTransaction();
      return cuenta;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  private async asegurarCuentaTx(qr: QueryRunner, pedido: any, idTurno: number | null, userId: number) {
    const [existente] = await qr.query(
      `SELECT * FROM cuenta WHERE id_pedido = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
      [pedido.id_pedido],
    );
    if (existente) return existente;

    const items = await qr.query(
      `SELECT id_pedido_item, cantidad, precio_unitario
       FROM pedido_item
       WHERE id_pedido = ? AND estado_registro = 'ACTIVO' AND id_item_padre IS NULL
         AND estado_preparacion <> 'ANULADO'`,
      [pedido.id_pedido],
    );
    if (!items.length) throw new BadRequestException('El pedido no tiene ítems cobrables');
    const total = this.round2(items.reduce((s: number, i: any) => s + Number(i.precio_unitario) * Number(i.cantidad), 0));

    const ins = await qr.query(
      `INSERT INTO cuenta (id_pedido, id_sucursal, id_mesa, id_turno, estado, total, pagado, id_usuario_crea)
       VALUES (?, ?, ?, ?, 'ABIERTA', ?, 0, ?)`,
      [pedido.id_pedido, pedido.id_sucursal, pedido.id_mesa, idTurno, total, userId],
    );
    const idCuenta = Number(ins.insertId);
    for (const it of items) {
      await qr.query(
        `INSERT INTO cuenta_item (id_cuenta, id_pedido_item, monto, estado, id_usuario_crea)
         VALUES (?, ?, ?, 'PENDIENTE', ?)`,
        [idCuenta, it.id_pedido_item, this.round2(Number(it.precio_unitario) * Number(it.cantidad)), userId],
      );
    }
    const [cuenta] = await qr.query(`SELECT * FROM cuenta WHERE id_cuenta = ?`, [idCuenta]);
    return cuenta;
  }

  private async exigirTurnoAbierto(qr: QueryRunner, idSucursal: number) {
    const [turno] = await qr.query(
      `SELECT id_turno, id_sucursal, estado FROM caja_turno
       WHERE id_sucursal = ? AND estado = 'ABIERTO' AND estado_registro = 'ACTIVO'
       FOR UPDATE`,
      [idSucursal],
    );
    if (!turno) throw new ConflictException('Debe abrir un turno de caja en la sucursal');
    return turno;
  }

  private async resumenTurnoInternal(idTurno: number, qr?: QueryRunner) {
    const db = qr || this.dataSource;
    const medios = await db.query(
      `SELECT cm.medio,
              SUM(cm.monto) AS monto,
              SUM(COALESCE(cm.recibido, 0)) AS recibido,
              SUM(COALESCE(cm.vuelto, 0)) AS vuelto
       FROM cobro_medio cm
       INNER JOIN cobro c ON c.id_cobro = cm.id_cobro
       WHERE c.id_turno = ? AND c.estado = 'REGISTRADO' AND c.estado_registro = 'ACTIVO'
         AND cm.estado_registro = 'ACTIVO'
       GROUP BY cm.medio`,
      [idTurno],
    );
    const porMedio: Record<string, number> = { EFECTIVO: 0, TARJETA: 0, YAPE: 0, PLIN: 0 };
    let efectivoNeto = 0;
    for (const r of medios) {
      porMedio[r.medio] = this.round2(Number(r.monto || 0));
      if (r.medio === 'EFECTIVO') efectivoNeto = this.round2(Number(r.monto || 0));
    }
    const [tot] = await db.query(
      `SELECT COUNT(*) AS cobros, COALESCE(SUM(monto), 0) AS total
       FROM cobro WHERE id_turno = ? AND estado = 'REGISTRADO' AND estado_registro = 'ACTIVO'`,
      [idTurno],
    );
    return {
      cobros: Number(tot?.cobros || 0),
      total_cobrado: this.round2(Number(tot?.total || 0)),
      efectivo_neto: efectivoNeto,
      por_medio: porMedio,
    };
  }

  private async obtenerPedido(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT p.id_pedido, p.id_sucursal, s.nombre AS sucursal, p.id_mesa, m.numero AS mesa,
              p.estado, p.total, p.subtotal, p.fecha_pedido, p.fecha_confirma,
              CONCAT(u.nombres, ' ', u.apellidos) AS mozo
       FROM pedido p
       INNER JOIN sucursal s ON s.id_sucursal = p.id_sucursal
       INNER JOIN mesa m ON m.id_mesa = p.id_mesa
       INNER JOIN sis_usuario u ON u.id_usuario = p.id_mozo
       WHERE p.id_pedido = ? AND p.estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Pedido no encontrado');
    return row;
  }

  private repartir(total: number, n: number) {
    const base = this.round2(Math.floor((total * 100) / n) / 100);
    const partes = Array.from({ length: n }, () => base);
    partes[n - 1] = this.round2(total - base * (n - 1));
    return partes;
  }

  private assertTotal(esperado: number, calculado: number) {
    if (this.round2(esperado) !== this.round2(calculado)) {
      throw new BadRequestException('Alerta de seguridad: totales no coinciden');
    }
  }

  private async assertAccesoSucursal(idSucursal: number, user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    this.assertSucursalPermitida(idSucursal, alcance);
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

  private exigirSucursal(raw: any, alcance: AlcanceSucursal): number {
    const id = this.forzarSucursal(raw, alcance);
    if (!id) throw new BadRequestException('Debe indicar la sucursal');
    return id;
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

  private money(n: any) {
    return this.round2(Number(n || 0)).toFixed(2);
  }

  private esc(v: any) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
