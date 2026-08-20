/**
 * Shape estable para módulos de negocio (erp/*).
 * NO reemplaza el JWT ni los guards: solo adapta `req.user` existente.
 *
 * Origen JWT (JwtStrategy.validate):
 *   { userId: payload.sub, email: payload.username, roleId: payload.roleId }
 */
export interface RequestUser {
  idUsuario: number;
  correo: string;
  idRol: number;
  /** Presente cuando exista contexto de sucursal en sesión (fases posteriores). */
  idSucursal?: number;
}

/** Forma cruda que deja Passport en `req.user` tras validar el JWT. */
export interface JwtRequestUser {
  userId: number;
  email: string;
  roleId: number;
  idSucursal?: number;
}
