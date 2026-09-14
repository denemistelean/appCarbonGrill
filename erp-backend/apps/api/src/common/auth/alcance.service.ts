import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlcanceSucursal } from './alcance.interface';
import { RequestUser } from './request-user.interface';

@Injectable()
export class AlcanceService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource) {}

  async resolverAlcance(user: RequestUser): Promise<AlcanceSucursal> {
    const [rol] = await this.dataSource.query(
      `SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`,
      [user.idRol],
    );
    const nombre = String(rol?.nombre || '');
    const esSuperadmin = nombre === 'SUPERADMIN';
    if (esSuperadmin) return { esSuperadmin: true, idSucursal: null, rol: nombre };

    const [asig] = await this.dataSource.query(
      `SELECT a.id_sucursal FROM sucursal_asignacion a
       INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
       WHERE a.id_usuario = ? AND a.estado_registro = 'ACTIVO' AND a.vigente_hasta IS NULL
         AND s.estado_registro = 'ACTIVO'
       ORDER BY a.id_asignacion DESC LIMIT 1`,
      [user.idUsuario],
    );
    const idSucursal = Number(asig?.id_sucursal || 0);
    if (!idSucursal) throw new ForbiddenException('Usuario sin sucursal asignada');
    return { esSuperadmin: false, idSucursal, rol: nombre };
  }

  forzarSucursal(raw: unknown, alcance: AlcanceSucursal): number | null {
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

  async assertAccesoSucursal(idSucursal: number, user: RequestUser): Promise<void> {
    const alcance = await this.resolverAlcance(user);
    if (!alcance.esSuperadmin && Number(idSucursal) !== alcance.idSucursal) {
      throw new ForbiddenException('No puede operar otra sucursal');
    }
  }
}
