import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ROLES_OPERATIVOS } from '../../common/auth/alcance.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
  ) {}

  private buildPayload(user: { id_usuario: number; correo: string; id_rol: number }) {
    return {
      sub: user.id_usuario,
      username: user.correo,
      roleId: user.id_rol,
    };
  }

  private signAccessToken(payload: Record<string, unknown>) {
    return this.jwtService.sign(payload);
  }

  private signRefreshToken(payload: Record<string, unknown>) {
    const expiresIn = (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any;
    return this.jwtService.sign(payload, { expiresIn });
  }

  private buildAuthResponse(user: any, esPrimeraSesion: boolean) {
    const payload = this.buildPayload(user);
    return {
      mensaje: 'Login exitoso',
      access_token: this.signAccessToken(payload),
      refresh_token: this.signRefreshToken(payload),
      sessionId: String(user.id_usuario),
      primera_sesion: esPrimeraSesion,
      usuario: {
        id_usuario: user.id_usuario,
        nombres: user.nombres,
        apellidos: user.apellidos,
        correo: user.correo,
        username: user.correo,
        id_rol: user.id_rol,
        nombre_rol: user.rol,
        rol: user.rol,
        id_sucursal: user.id_sucursal ?? null,
        sucursal: user.sucursal ?? null,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const identifier = String(loginDto.correo || loginDto.username || '').trim();
    if (!identifier) {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    const user = await this.usuariosService.findByEmail(identifier);

    if (!user || user.estado_registro !== 'ACTIVO') {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    const passwordValida = await bcrypt.compare(loginDto.password, user.password);

    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    let esPrimeraSesion = false;
    try {
      esPrimeraSesion = await this.usuariosService.leerYMarcarPrimeraSesion(user.id_usuario);
    } catch (_) {}

    const sucursal = await this.cargarSucursalAsignada(user.id_usuario);
    this.validarAsignacionOperativa(String(user.rol || ''), sucursal.id_sucursal);
    return this.buildAuthResponse({ ...user, ...sucursal }, esPrimeraSesion);
  }

  async contexto(userId: number) {
    const user = await this.usuariosService.findOne(userId);
    if (!user?.data || user.data.estado_registro !== 'ACTIVO') {
      throw new UnauthorizedException('Usuario inactivo');
    }
    const [rolRow] = await this.dataSource.query(
      `SELECT nombre FROM sis_rol WHERE id_rol = ? LIMIT 1`,
      [user.data.id_rol],
    );
    const nombreRol = String(rolRow?.nombre || user.data.nombre_rol || user.data.rol || '');
    const esSuperadmin = nombreRol === 'SUPERADMIN';
    const asignacion = await this.cargarSucursalAsignada(userId);

    if (!esSuperadmin && ROLES_OPERATIVOS.includes(nombreRol as (typeof ROLES_OPERATIVOS)[number]) && !asignacion.id_sucursal) {
      throw new UnauthorizedException('Usuario sin local asignado');
    }

    let sucursalDetalle: Record<string, unknown> | null = null;
    if (asignacion.id_sucursal) {
      const [s] = await this.dataSource.query(
        `SELECT id_sucursal, codigo, nombre, nombre_comercial, logo_path, ruc, razon_social,
                direccion, direccion_fiscal, telefono, tipo
         FROM sucursal
         WHERE id_sucursal = ? AND estado_registro = 'ACTIVO'`,
        [asignacion.id_sucursal],
      );
      if (s) {
        sucursalDetalle = {
          id_sucursal: Number(s.id_sucursal),
          codigo: s.codigo,
          nombre: s.nombre,
          nombre_comercial: s.nombre_comercial || s.nombre,
          logo_path: s.logo_path || null,
          logo_url: s.logo_path ? `/uploads/${String(s.logo_path).replace(/^\/+/, '')}` : null,
          ruc: s.ruc || null,
          razon_social: s.razon_social || null,
          direccion: s.direccion_fiscal || s.direccion || null,
          telefono: s.telefono || null,
          tipo: s.tipo || 'LOCAL',
        };
      }
    }

    const nombreMostrar =
      (sucursalDetalle?.nombre_comercial as string) ||
      (sucursalDetalle?.nombre as string) ||
      'Portal de gestión';

    return {
      es_superadmin: esSuperadmin,
      id_sucursal: asignacion.id_sucursal,
      sucursal_nombre: asignacion.sucursal,
      nombre_marca: nombreMostrar,
      logo_url: (sucursalDetalle?.logo_url as string) || null,
      sucursal: sucursalDetalle,
      usuario: {
        id_usuario: user.data.id_usuario,
        nombres: user.data.nombres,
        apellidos: user.data.apellidos,
        correo: user.data.correo,
        id_rol: user.data.id_rol,
        nombre_rol: nombreRol,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken);
      if (String(payload.sub) !== String(dto.sessionId)) {
        throw new UnauthorizedException('Sesión inválida');
      }
      const user = await this.usuariosService.findOne(Number(payload.sub));
      if (!user?.data || user.data.estado_registro !== 'ACTIVO') {
        throw new UnauthorizedException('Usuario inactivo');
      }
      const sucursal = await this.cargarSucursalAsignada(user.data.id_usuario);
      const nombreRol = String(user.data.nombre_rol || user.data.rol || '');
      this.validarAsignacionOperativa(nombreRol, sucursal.id_sucursal);
      const normalized = {
        id_usuario: user.data.id_usuario,
        correo: user.data.correo,
        id_rol: user.data.id_rol,
        nombres: user.data.nombres,
        apellidos: user.data.apellidos,
        rol: user.data.nombre_rol || user.data.rol,
        id_sucursal: sucursal.id_sucursal,
        sucursal: sucursal.sucursal,
      };
      return this.buildAuthResponse(normalized, false);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  async logout() {
    return { mensaje: 'Sesión cerrada' };
  }

  async cambiarClave(userId: number, claveActual: string, claveNueva: string) {
    return this.usuariosService.cambiarClave(userId, claveActual, claveNueva);
  }

  /** Roles operativos deben tener sucursal_asignacion vigente. */
  private validarAsignacionOperativa(nombreRol: string, idSucursal: number | null) {
    if (nombreRol === 'SUPERADMIN') return;
    if (ROLES_OPERATIVOS.includes(nombreRol as (typeof ROLES_OPERATIVOS)[number]) && !idSucursal) {
      throw new UnauthorizedException('Usuario sin local asignado. Contacte al administrador.');
    }
  }

  /** Lectura extra sobre sucursal_asignacion. No modifica SPs de sis_usuario. */
  private async cargarSucursalAsignada(idUsuario: number): Promise<{ id_sucursal: number | null; sucursal: string | null }> {
    try {
      const [row] = await this.dataSource.query(
        `SELECT a.id_sucursal, s.nombre AS sucursal
         FROM sucursal_asignacion a
         INNER JOIN sucursal s ON s.id_sucursal = a.id_sucursal
         WHERE a.id_usuario = ?
           AND a.estado_registro = 'ACTIVO'
           AND a.vigente_hasta IS NULL
           AND s.estado_registro = 'ACTIVO'
         ORDER BY a.id_asignacion DESC
         LIMIT 1`,
        [idUsuario],
      );
      if (!row) return { id_sucursal: null, sucursal: null };
      return { id_sucursal: Number(row.id_sucursal), sucursal: row.sucursal };
    } catch {
      return { id_sucursal: null, sucursal: null };
    }
  }
}
