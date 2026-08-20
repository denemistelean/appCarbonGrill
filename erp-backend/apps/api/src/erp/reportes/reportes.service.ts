import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RequestUser } from '../../common/auth/request-user.interface';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };
type Rango = { desde: string; hasta: string; desdeDia: string; hastaDia: string };

@Injectable()
export class ReportesService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource) {}

  async sucursales(user: RequestUser) {
    const alcance = await this.resolverAlcance(user);
    const params: any[] = [];
    let where = `WHERE s.estado_registro = 'ACTIVO'`;
    if (!alcance.esSuperadmin) {
      where += ` AND s.id_sucursal = ?`;
      params.push(alcance.idSucursal);
    }
    return this.dataSource.query(
      `SELECT s.id_sucursal, s.codigo, s.nombre, s.tipo FROM sucursal s ${where} ORDER BY s.nombre ASC`,
      params,
    );
  }

  async consolidado(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('s', idSucursal, alcance, sucParams);

    const [catalogo] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM insumo WHERE estado_registro = 'ACTIVO') AS insumos,
         (SELECT COUNT(*) FROM producto WHERE estado_registro = 'ACTIVO') AS productos`,
    );

    const filas = await this.dataSource.query(
      `SELECT
         s.id_sucursal, s.codigo, s.nombre, s.tipo, s.ruc, s.razon_social,
         COALESCE(v.ventas, 0) AS ventas,
         COALESCE(v.pedidos, 0) AS pedidos,
         COALESCE(v.cobros, 0) AS cobros,
         COALESCE(cpe.boletas, 0) AS boletas,
         COALESCE(cpe.facturas, 0) AS facturas,
         COALESCE(cpe.total_cpe, 0) AS total_cpe,
         COALESCE(di.notas_internas, 0) AS notas_internas,
         COALESCE(di.total_interno, 0) AS total_interno,
         COALESCE(st.valor_stock, 0) AS valor_stock,
         COALESCE(st.insumos_con_stock, 0) AS insumos_con_stock,
         COALESCE(st.alertas, 0) AS alertas_stock,
         COALESCE(pr.productos_carta, 0) AS productos_carta,
         COALESCE(pr.productos, 0) AS productos_sucursal,
         COALESCE(m.mesas, 0) AS mesas,
         COALESCE(m.ocupadas, 0) AS mesas_ocupadas
       FROM sucursal s
       LEFT JOIN (
         SELECT p.id_sucursal,
                ROUND(SUM(c.monto), 2) AS ventas,
                COUNT(DISTINCT p.id_pedido) AS pedidos,
                COUNT(c.id_cobro) AS cobros
         FROM cobro c
         INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
         INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
         WHERE c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
           AND c.fecha_cobro BETWEEN ? AND ?
         GROUP BY p.id_sucursal
       ) v ON v.id_sucursal = s.id_sucursal
       LEFT JOIN (
         SELECT id_sucursal,
                SUM(CASE WHEN tipo = '03' AND estado <> 'ANULADO' THEN 1 ELSE 0 END) AS boletas,
                SUM(CASE WHEN tipo = '01' AND estado <> 'ANULADO' THEN 1 ELSE 0 END) AS facturas,
                ROUND(SUM(CASE WHEN estado <> 'ANULADO' THEN total ELSE 0 END), 2) AS total_cpe
         FROM comprobante
         WHERE estado_registro = 'ACTIVO' AND fecha_emision BETWEEN ? AND ?
         GROUP BY id_sucursal
       ) cpe ON cpe.id_sucursal = s.id_sucursal
       LEFT JOIN (
         SELECT id_sucursal, COUNT(*) AS notas_internas, ROUND(SUM(total), 2) AS total_interno
         FROM documento_interno
         WHERE estado_registro = 'ACTIVO' AND fecha_emision BETWEEN ? AND ?
         GROUP BY id_sucursal
       ) di ON di.id_sucursal = s.id_sucursal
       LEFT JOIN (
         SELECT id_sucursal,
                ROUND(SUM(stock_actual * costo_promedio), 2) AS valor_stock,
                SUM(CASE WHEN stock_actual > 0 THEN 1 ELSE 0 END) AS insumos_con_stock,
                SUM(CASE WHEN stock_actual <= stock_minimo AND stock_minimo > 0 THEN 1 ELSE 0 END) AS alertas
         FROM insumo_stock
         WHERE estado_registro = 'ACTIVO'
         GROUP BY id_sucursal
       ) st ON st.id_sucursal = s.id_sucursal
       LEFT JOIN (
         SELECT id_sucursal,
                SUM(CASE WHEN disponible = 1 THEN 1 ELSE 0 END) AS productos_carta,
                COUNT(*) AS productos
         FROM producto_sucursal
         WHERE estado_registro = 'ACTIVO'
         GROUP BY id_sucursal
       ) pr ON pr.id_sucursal = s.id_sucursal
       LEFT JOIN (
         SELECT id_sucursal,
                COUNT(*) AS mesas,
                SUM(CASE WHEN estado NOT IN ('LIBRE', 'LIMPIEZA') THEN 1 ELSE 0 END) AS ocupadas
         FROM mesa
         WHERE estado_registro = 'ACTIVO' AND numero <> 'POS'
         GROUP BY id_sucursal
       ) m ON m.id_sucursal = s.id_sucursal
       WHERE s.estado_registro = 'ACTIVO' ${sucWhere}
       ORDER BY s.tipo ASC, s.nombre ASC`,
      [rango.desde, rango.hasta, rango.desde, rango.hasta, rango.desde, rango.hasta, ...sucParams],
    );

    const porSucursal = (filas || []).map((r: any) => {
      const ventas = this.round2(r.ventas);
      const pedidos = Number(r.pedidos || 0);
      return {
        ...r,
        ventas,
        pedidos,
        cobros: Number(r.cobros || 0),
        boletas: Number(r.boletas || 0),
        facturas: Number(r.facturas || 0),
        total_cpe: this.round2(r.total_cpe),
        notas_internas: Number(r.notas_internas || 0),
        total_interno: this.round2(r.total_interno),
        valor_stock: this.round2(r.valor_stock),
        insumos_con_stock: Number(r.insumos_con_stock || 0),
        alertas_stock: Number(r.alertas_stock || 0),
        productos_carta: Number(r.productos_carta || 0),
        productos_sucursal: Number(r.productos_sucursal || 0),
        mesas: Number(r.mesas || 0),
        mesas_ocupadas: Number(r.mesas_ocupadas || 0),
        ticket_promedio: pedidos > 0 ? this.round2(ventas / pedidos) : 0,
      };
    });

    const sum = (key: string) => this.round2(porSucursal.reduce((a: number, r: any) => a + Number(r[key] || 0), 0));
    const sumInt = (key: string) => porSucursal.reduce((a: number, r: any) => a + Number(r[key] || 0), 0);
    const ventas = sum('ventas');
    const pedidos = sumInt('pedidos');

    return {
      rango,
      catalogo: {
        insumos: Number(catalogo?.insumos || 0),
        productos: Number(catalogo?.productos || 0),
      },
      agrupado: {
        sucursales: porSucursal.length,
        locales: porSucursal.filter((r: any) => r.tipo === 'LOCAL').length,
        almacenes: porSucursal.filter((r: any) => r.tipo === 'ALMACEN').length,
        ventas,
        pedidos,
        cobros: sumInt('cobros'),
        ticket_promedio: pedidos > 0 ? this.round2(ventas / pedidos) : 0,
        boletas: sumInt('boletas'),
        facturas: sumInt('facturas'),
        total_cpe: sum('total_cpe'),
        notas_internas: sumInt('notas_internas'),
        total_interno: sum('total_interno'),
        valor_stock: sum('valor_stock'),
        insumos_con_stock: sumInt('insumos_con_stock'),
        alertas_stock: sumInt('alertas_stock'),
        productos_carta: sumInt('productos_carta'),
        mesas: sumInt('mesas'),
        mesas_ocupadas: sumInt('mesas_ocupadas'),
      },
      por_sucursal: porSucursal,
    };
  }

  async ventas(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('p', idSucursal, alcance, sucParams);

    const [resumen] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(c.monto), 0) AS total,
         COUNT(DISTINCT c.id_cobro) AS cobros,
         COUNT(DISTINCT p.id_pedido) AS pedidos
       FROM cobro c
       INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
       INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
       WHERE c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
         AND c.fecha_cobro BETWEEN ? AND ?
         ${sucWhere}`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    const total = this.round2(resumen?.total);
    const pedidos = Number(resumen?.pedidos || 0);
    const porDia = await this.dataSource.query(
      `SELECT DATE(c.fecha_cobro) AS fecha,
              COUNT(DISTINCT c.id_cobro) AS cobros,
              COUNT(DISTINCT p.id_pedido) AS pedidos,
              ROUND(SUM(c.monto), 2) AS total
       FROM cobro c
       INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
       INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
       WHERE c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
         AND c.fecha_cobro BETWEEN ? AND ?
         ${sucWhere}
       GROUP BY DATE(c.fecha_cobro)
       ORDER BY fecha ASC`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    const porMedio = await this.dataSource.query(
      `SELECT cm.medio, ROUND(SUM(cm.monto), 2) AS total, COUNT(*) AS n
       FROM cobro_medio cm
       INNER JOIN cobro c ON c.id_cobro = cm.id_cobro
       INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
       INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
       WHERE cm.estado_registro = 'ACTIVO' AND c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
         AND c.fecha_cobro BETWEEN ? AND ?
         ${sucWhere}
       GROUP BY cm.medio
       ORDER BY total DESC`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    return {
      rango,
      resumen: {
        total,
        cobros: Number(resumen?.cobros || 0),
        pedidos,
        ticket_promedio: pedidos > 0 ? this.round2(total / pedidos) : 0,
      },
      por_dia: porDia,
      por_medio: porMedio,
    };
  }

  async platos(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('p', idSucursal, alcance, sucParams);
    const rows = await this.dataSource.query(
      `SELECT pr.id_producto, pr.nombre,
              ROUND(SUM(i.cantidad), 3) AS unidades,
              ROUND(SUM(i.cantidad * i.precio_unitario), 2) AS venta,
              ROUND(SUM(i.cantidad * i.costo_receta_snapshot), 2) AS costo
       FROM pedido_item i
       INNER JOIN pedido p ON p.id_pedido = i.id_pedido
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE i.estado_registro = 'ACTIVO' AND i.id_item_padre IS NULL
         AND i.estado_preparacion <> 'ANULADO'
         AND p.estado_registro = 'ACTIVO' AND p.estado NOT IN ('ANULADO', 'PENDIENTE_CONFIRMACION')
         AND p.fecha_confirma BETWEEN ? AND ?
         ${sucWhere}
       GROUP BY pr.id_producto, pr.nombre
       ORDER BY unidades DESC, venta DESC
       LIMIT 50`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    return { rango, data: rows };
  }

  async rentabilidad(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('p', idSucursal, alcance, sucParams);
    const rows = await this.dataSource.query(
      `SELECT pr.id_producto, pr.nombre,
              ROUND(SUM(i.cantidad), 3) AS unidades,
              ROUND(SUM(i.cantidad * i.precio_unitario), 2) AS venta,
              ROUND(SUM(i.cantidad * i.costo_receta_snapshot), 2) AS costo,
              ROUND(SUM(i.cantidad * i.precio_unitario) - SUM(i.cantidad * i.costo_receta_snapshot), 2) AS margen
       FROM pedido_item i
       INNER JOIN pedido p ON p.id_pedido = i.id_pedido
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE i.estado_registro = 'ACTIVO' AND i.id_item_padre IS NULL
         AND i.estado_preparacion <> 'ANULADO'
         AND p.estado_registro = 'ACTIVO' AND p.estado NOT IN ('ANULADO', 'PENDIENTE_CONFIRMACION')
         AND p.fecha_confirma BETWEEN ? AND ?
         ${sucWhere}
       GROUP BY pr.id_producto, pr.nombre
       ORDER BY margen DESC
       LIMIT 50`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    const venta = this.round2(rows.reduce((a: number, r: any) => a + Number(r.venta || 0), 0));
    const costo = this.round2(rows.reduce((a: number, r: any) => a + Number(r.costo || 0), 0));
    return {
      rango,
      resumen: { venta, costo, margen: this.round2(venta - costo) },
      data: rows,
    };
  }

  async mermas(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('m', idSucursal, alcance, sucParams);
    const porMotivo = await this.dataSource.query(
      `SELECT m.motivo, COUNT(*) AS n, ROUND(SUM(m.cantidad), 4) AS cantidad, ROUND(SUM(m.costo_total), 2) AS costo
       FROM merma m
       INNER JOIN kardex k ON k.id_kardex = m.id_kardex
       WHERE m.estado_registro = 'ACTIVO' AND k.fecha_movimiento BETWEEN ? AND ?
         ${sucWhere}
       GROUP BY m.motivo
       ORDER BY costo DESC`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    const detalle = await this.dataSource.query(
      `SELECT m.id_merma, m.motivo, m.cantidad, m.costo_total, m.detalle, i.nombre AS insumo,
              s.nombre AS sucursal, k.fecha_movimiento
       FROM merma m
       INNER JOIN kardex k ON k.id_kardex = m.id_kardex
       INNER JOIN insumo i ON i.id_insumo = m.id_insumo
       INNER JOIN sucursal s ON s.id_sucursal = m.id_sucursal
       WHERE m.estado_registro = 'ACTIVO' AND k.fecha_movimiento BETWEEN ? AND ?
         ${sucWhere}
       ORDER BY k.fecha_movimiento DESC
       LIMIT 100`,
      [rango.desde, rango.hasta, ...sucParams],
    );
    const costo = this.round2(porMotivo.reduce((a: number, r: any) => a + Number(r.costo || 0), 0));
    return { rango, resumen: { costo, n: porMotivo.reduce((a: number, r: any) => a + Number(r.n || 0), 0) }, por_motivo: porMotivo, detalle };
  }

  async ocupacion(query: any, user: RequestUser) {
    const { alcance, idSucursal, rango } = await this.prep(query, user);
    const sucParams: any[] = [];
    const sucWhere = this.sucursalSql('m', idSucursal, alcance, sucParams);
    const mesas = await this.dataSource.query(
      `SELECT m.estado, COUNT(*) AS n
       FROM mesa m
       WHERE m.estado_registro = 'ACTIVO' ${sucWhere}
       GROUP BY m.estado`,
      sucParams,
    );
    const sucPed: any[] = [];
    const sucPedWhere = this.sucursalSql('p', idSucursal, alcance, sucPed);
    const [tiempos] = await this.dataSource.query(
      `SELECT
         COUNT(*) AS n,
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, p.fecha_confirma, cob.max_cobro)), 1) AS minutos_promedio,
         ROUND(MIN(TIMESTAMPDIFF(MINUTE, p.fecha_confirma, cob.max_cobro)), 1) AS minutos_min,
         ROUND(MAX(TIMESTAMPDIFF(MINUTE, p.fecha_confirma, cob.max_cobro)), 1) AS minutos_max
       FROM pedido p
       INNER JOIN (
         SELECT cu.id_pedido, MAX(c.fecha_cobro) AS max_cobro
         FROM cobro c
         INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
         WHERE c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
         GROUP BY cu.id_pedido
       ) cob ON cob.id_pedido = p.id_pedido
       WHERE p.estado_registro = 'ACTIVO' AND p.estado = 'PAGADO'
         AND p.fecha_confirma IS NOT NULL
         AND cob.max_cobro BETWEEN ? AND ?
         ${sucPedWhere}`,
      [rango.desde, rango.hasta, ...sucPed],
    );
    const totalMesas = mesas.reduce((a: number, r: any) => a + Number(r.n || 0), 0);
    const ocupadas = mesas
      .filter((r: any) => !['LIBRE', 'LIMPIEZA'].includes(String(r.estado)))
      .reduce((a: number, r: any) => a + Number(r.n || 0), 0);
    return {
      rango,
      mesas_ahora: {
        total: totalMesas,
        ocupadas,
        pct: totalMesas > 0 ? this.round2((ocupadas / totalMesas) * 100) : 0,
        por_estado: mesas,
      },
      tiempos: {
        n: Number(tiempos?.n || 0),
        minutos_promedio: Number(tiempos?.minutos_promedio || 0),
        minutos_min: Number(tiempos?.minutos_min || 0),
        minutos_max: Number(tiempos?.minutos_max || 0),
      },
    };
  }

  async filasExport(tipo: string, query: any, user: RequestUser): Promise<{ columnas: { header: string; key: string; width?: number }[]; data: any[]; titulo: string }> {
    if (tipo === 'consolidado') {
      const r = await this.consolidado(query, user);
      return {
        titulo: 'Consolidado por sucursal',
        columnas: [
          { header: 'Codigo', key: 'codigo', width: 12 },
          { header: 'Sucursal', key: 'nombre', width: 24 },
          { header: 'Tipo', key: 'tipo', width: 12 },
          { header: 'RUC', key: 'ruc', width: 14 },
          { header: 'Ventas', key: 'ventas', width: 14 },
          { header: 'Pedidos', key: 'pedidos', width: 12 },
          { header: 'Boletas', key: 'boletas', width: 12 },
          { header: 'Facturas', key: 'facturas', width: 12 },
          { header: 'Valor stock', key: 'valor_stock', width: 14 },
          { header: 'Alertas stock', key: 'alertas_stock', width: 12 },
          { header: 'Productos carta', key: 'productos_carta', width: 14 },
        ],
        data: r.por_sucursal,
      };
    }
    if (tipo === 'ventas') {
      const r = await this.ventas(query, user);
      return {
        titulo: 'Ventas',
        columnas: [
          { header: 'Fecha', key: 'fecha', width: 14 },
          { header: 'Cobros', key: 'cobros', width: 12 },
          { header: 'Pedidos', key: 'pedidos', width: 12 },
          { header: 'Total', key: 'total', width: 14 },
        ],
        data: r.por_dia,
      };
    }
    if (tipo === 'platos') {
      const r = await this.platos(query, user);
      return {
        titulo: 'Platos',
        columnas: [
          { header: 'Plato', key: 'nombre', width: 32 },
          { header: 'Unidades', key: 'unidades', width: 12 },
          { header: 'Venta', key: 'venta', width: 14 },
          { header: 'Costo', key: 'costo', width: 14 },
        ],
        data: r.data,
      };
    }
    if (tipo === 'rentabilidad') {
      const r = await this.rentabilidad(query, user);
      return {
        titulo: 'Rentabilidad',
        columnas: [
          { header: 'Plato', key: 'nombre', width: 32 },
          { header: 'Unidades', key: 'unidades', width: 12 },
          { header: 'Venta', key: 'venta', width: 14 },
          { header: 'Costo', key: 'costo', width: 14 },
          { header: 'Margen', key: 'margen', width: 14 },
        ],
        data: r.data,
      };
    }
    if (tipo === 'mermas') {
      const r = await this.mermas(query, user);
      return {
        titulo: 'Mermas',
        columnas: [
          { header: 'Motivo', key: 'motivo', width: 22 },
          { header: 'N', key: 'n', width: 10 },
          { header: 'Cantidad', key: 'cantidad', width: 14 },
          { header: 'Costo', key: 'costo', width: 14 },
        ],
        data: r.por_motivo,
      };
    }
    if (tipo === 'ocupacion') {
      const r = await this.ocupacion(query, user);
      return {
        titulo: 'Ocupacion',
        columnas: [
          { header: 'Estado mesa', key: 'estado', width: 24 },
          { header: 'Cantidad', key: 'n', width: 12 },
        ],
        data: r.mesas_ahora.por_estado,
      };
    }
    throw new BadRequestException('Tipo de reporte inválido');
  }

  htmlPdf(titulo: string, columnas: { header: string; key: string }[], data: any[]) {
    const th = columnas.map((c) => `<th>${this.esc(c.header)}</th>`).join('');
    const body = data
      .map(
        (row) =>
          `<tr>${columnas.map((c) => `<td>${this.esc(row[c.key] ?? '')}</td>`).join('')}</tr>`,
      )
      .join('');
    return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:16px}
  h1{font-size:16px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
  th{background:#f3f3f3}
</style></head>
<body>
  <h1>${this.esc(titulo)}</h1>
  <table><thead><tr>${th}</tr></thead><tbody>${body || '<tr><td colspan="99">Sin datos</td></tr>'}</tbody></table>
</body></html>`;
  }

  private async prep(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal', 'fecha_desde', 'fecha_hasta']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.forzarSucursal(query.id_sucursal, alcance);
    return { alcance, idSucursal, rango: this.rango(query) };
  }

  private rango(query: any): Rango {
    const hoy = this.isoDate(new Date());
    const hace7 = this.isoDate(new Date(Date.now() - 6 * 86400000));
    const desdeDia = this.parseDia(query.fecha_desde, hace7);
    const hastaDia = this.parseDia(query.fecha_hasta, hoy);
    if (desdeDia > hastaDia) throw new BadRequestException('El rango de fechas es inválido');
    return { desdeDia, hastaDia, desde: `${desdeDia} 00:00:00`, hasta: `${hastaDia} 23:59:59` };
  }

  private parseDia(raw: any, fallback: string) {
    if (raw == null || raw === '') return fallback;
    const s = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('Fecha inválida');
    return s;
  }

  private isoDate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private sucursalSql(alias: string, idSucursal: number | null, alcance: AlcanceSucursal, params: any[]) {
    if (idSucursal) {
      params.push(idSucursal);
      return ` AND ${alias}.id_sucursal = ?`;
    }
    if (!alcance.esSuperadmin) {
      params.push(alcance.idSucursal);
      return ` AND ${alias}.id_sucursal = ?`;
    }
    return '';
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

  private round2(n: any) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private esc(v: any) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
