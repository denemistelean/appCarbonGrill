import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { ImpresionService } from './impresion.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [CommonModule],
  controllers: [ReportesController],
  providers: [ReportesService, ImpresionService],
  exports: [ReportesService, ImpresionService],
})
export class ReportesModule {}
