import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { OseService } from './ose.service';
import { BetaOseAdapter } from './sunat-beta/beta-ose.adapter';
import { CpeRepresentacionService } from './cpe-representacion.service';

@Module({
  imports: [CommonModule],
  controllers: [ComprobantesController],
  providers: [ComprobantesService, OseService, BetaOseAdapter, CpeRepresentacionService],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
