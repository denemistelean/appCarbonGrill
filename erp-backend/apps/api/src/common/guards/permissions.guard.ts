import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export const RequirePermission = (permission: string) => SetMetadata('requiredPermission', permission);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectDataSource('APP_DB_CONN') private dataSource: DataSource
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>('requiredPermission', context.getHandler());

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const idRol = user?.idRol;

    if (!idRol) {
      this.logger.warn('Usuario sin rol intentó acceder a ruta protegida');
      throw new UnauthorizedException('Usuario sin rol identificado');
    }

    try {
      const result = await this.dataSource.query(`
        SELECT 1
        FROM sis_permiso p
        INNER JOIN sis_accion a ON p.id_accion = a.id_accion
        WHERE p.id_rol = ? AND a.codigo_accion = ?
          AND p.estado_registro = 'ACTIVO'
          AND a.estado_registro = 'ACTIVO'
        LIMIT 1
      `, [idRol, requiredPermission]);

      if (result.length > 0) {
        return true; // Acceso concedido
      } else {
        this.logger.warn(`Rol ${idRol} denegado para acción: ${requiredPermission}`);
        throw new ForbiddenException(`No tienes el permiso requerido: ${requiredPermission}`);
      }

    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      this.logger.error(`Error verificando permisos: ${error}`);
      return false; // Ante error técnico, denegamos por seguridad
    }
  }
}