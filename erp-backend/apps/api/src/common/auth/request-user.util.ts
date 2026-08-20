import { UnauthorizedException } from '@nestjs/common';
import { JwtRequestUser, RequestUser } from './request-user.interface';

/**
 * Adapta `req.user` del JWT actual al shape de dominio.
 * Uso en controllers/services de erp/*:
 *   const user = resolveRequestUser(req);
 */
export function resolveRequestUser(req: { user?: JwtRequestUser | null }): RequestUser {
  const raw = req?.user;
  const idUsuario = Number(raw?.userId);
  const idRol = Number(raw?.roleId);

  if (!raw || !idUsuario || Number.isNaN(idUsuario) || !idRol || Number.isNaN(idRol)) {
    throw new UnauthorizedException('Token inválido o sin usuario');
  }

  const idSucursalRaw = raw.idSucursal != null ? Number(raw.idSucursal) : undefined;

  return {
    idUsuario,
    correo: String(raw.email ?? ''),
    idRol,
    idSucursal:
      idSucursalRaw != null && !Number.isNaN(idSucursalRaw) && idSucursalRaw > 0
        ? idSucursalRaw
        : undefined,
  };
}
