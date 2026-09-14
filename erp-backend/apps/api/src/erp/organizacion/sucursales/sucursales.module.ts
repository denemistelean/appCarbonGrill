import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { SucursalesController } from './sucursales.controller';
import { SucursalesService } from './sucursales.service';

@Module({
  imports: [CommonModule],
  controllers: [SucursalesController],
  providers: [SucursalesService],
})
export class SucursalesModule {}
