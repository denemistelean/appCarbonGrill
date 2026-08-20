import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SeguridadController } from './seguridad.controller';
import { SeguridadService } from './seguridad.service';

@Module({
  imports: [
    // 🛡️ Agregamos el escudo de seguridad con el límite ampliado
    ThrottlerModule.forRoot([{
      ttl: 60000, // Tiempo: 1 minuto (en milisegundos)
      limit: 120, // Límite: 120 peticiones por minuto para que no te bloquee
    }]),
  ],
  controllers: [SeguridadController],
  providers: [
    SeguridadService,
    // 🛡️ Activamos el escudo para que proteja automáticamente todas las rutas
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ]
})
export class SeguridadModule {}