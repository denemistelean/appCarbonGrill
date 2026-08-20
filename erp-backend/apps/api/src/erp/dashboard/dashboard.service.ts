import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RequestUser } from '../../common/auth/request-user.interface';

type AlcanceSucursal = { esSuperadmin: boolean; idSucursal: number | null; rol: string };

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource) {}

  /**
   * Indicadores sis_* (núcleo) + KPIs de operación del día.
   * No quitar usuarios_activos / roles / modulos.
   */
  async resumen(query: any, user: RequestUser) {
    const [usuarios] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_usuario WHERE estado_registro = 'ACTIVO'`,
    );
    const [roles] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_rol WHERE estado_registro = 'ACTIVO'`,
    );
    const [modulos] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_modulo WHERE estado_registro = 'ACTIVO'`,
    );

    const sis = {
      usuarios_activos: Number(usuarios?.total || 0),
      roles: Number(roles?.total || 0),
      modulos: Number(modulos?.total || 0),
    };

    const hoy = await this.kpisHoy(query, user);

    return {
      indicadores: { ...sis, ...hoy },
      sistema: sis,
      series: {},
      totales: sis,
      hoy,
    };
  }

  private async kpisHoy(query: any, user: RequestUser) {
    this.assertQueryScalars(query, ['id_sucursal']);
    const alcance = await this.resolverAlcance(user);
    const idSucursal = this.forzarSucursal(query?.id_sucursal, alcance);
    const sucPed: any[] = [];
    const wherePed = this.sucursalSql('p', idSucursal, alcance, sucPed);
    const sucMesa: any[] = [];
    const whereMesa = this.sucursalSql('m', idSucursal, alcance, sucMesa);
    const sucComp: any[] = [];
    const whereComp = this.sucursalSql('c', idSucursal, alcance, sucComp);

    const [ventas] = await this.dataSource.query(
      `SELECT COALESCE(SUM(c.monto), 0) AS total, COUNT(DISTINCT p.id_pedido) AS pedidos
       FROM cobro c
       INNER JOIN cuenta cu ON cu.id_cuenta = c.id_cuenta
       INNER JOIN pedido p ON p.id_pedido = cu.id_pedido
       WHERE c.estado_registro = 'ACTIVO' AND c.estado = 'REGISTRADO'
         AND DATE(c.fecha_cobro) = CURDATE()
         ${wherePed}`,
      sucPed,
    );
    const [plato] = await this.dataSource.query(
      `SELECT pr.nombre, ROUND(SUM(i.cantidad), 3) AS unidades
       FROM pedido_item i
       INNER JOIN pedido p ON p.id_pedido = i.id_pedido
       INNER JOIN producto pr ON pr.id_producto = i.id_producto
       WHERE i.estado_registro = 'ACTIVO' AND i.id_item_padre IS NULL
         AND i.estado_preparacion <> 'ANULADO'
         AND p.estado_registro = 'ACTIVO' AND p.estado NOT IN ('ANULADO', 'PENDIENTE_CONFIRMACION')
         AND DATE(p.fecha_confirma) = CURDATE()
         ${wherePed}
       GROUP BY pr.id_producto, pr.nombre
       ORDER BY unidades DESC
       LIMIT 1`,
      sucPed,
    );
    const [mesas] = await this.dataSource.query(
      `SELECT
         SUM(CASE WHEN m.estado NOT IN ('LIBRE', 'LIMPIEZA') THEN 1 ELSE 0 END) AS ocupadas,
         COUNT(*) AS total
       FROM mesa m
       WHERE m.estado_registro = 'ACTIVO' ${whereMesa}`,
      sucMesa,
    );
    const [llamados] = await this.dataSource.query(
      `SELECT COUNT(*) AS n
       FROM llamado_mozo l
       INNER JOIN mesa m ON m.id_mesa = l.id_mesa
       WHERE l.estado_registro = 'ACTIVO' AND l.estado = 'PENDIENTE' ${whereMesa}`,
      sucMesa,
    );
    const [pendOse] = await this.dataSource.query(
      `SELECT COUNT(*) AS n
       FROM comprobante c
       WHERE c.estado_registro = 'ACTIVO'
         AND c.estado IN ('RECHAZADO', 'REGISTRADO')
         AND (c.es_contingencia = 1 OR c.estado = 'RECHAZADO')
         ${whereComp}`,
      sucComp,
    );
    const total = Number(ventas?.total || 0);
    const pedidos = Number(ventas?.pedidos || 0);
    return {
      ventas_hoy: Math.round(total * 100) / 100,
      ticket_promedio: pedidos > 0 ? Math.round((total / pedidos) * 100) / 100 : 0,
      pedidos_hoy: pedidos,
      plato_mas_vendido: plato?.nombre || '—',
      mesas_ocupadas: Number(mesas?.ocupadas || 0),
      mesas_total: Number(mesas?.total || 0),
      llamados_pendientes: Number(llamados?.n || 0),
      comprobantes_pendientes_ose: Number(pendOse?.n || 0),
    };
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
}
