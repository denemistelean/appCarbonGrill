import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Le decimos que busque la "pulsera" en el Header de la petición HTTP (Bearer Token)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Si el token caducó, rechaza el acceso automáticamente
      secretOrKey: config.get<string>('JWT_SECRET') || 'emergencia', // La firma criptográfica
    });
  }

  // Si el token es real y no ha caducado, esta función extrae los datos del usuario
  // para que podamos usarlos dentro de nuestra API (ej: saber quién está creando un producto).
  async validate(payload: any) {
    return { userId: payload.sub, email: payload.username, roleId: payload.roleId };
  }
}