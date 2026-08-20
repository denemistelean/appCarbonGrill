import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module';
import { TrasladosController } from './traslados.controller';
import { TrasladosService } from './traslados.service';

@Module({
  imports: [InventarioModule],
  controllers: [TrasladosController],
  providers: [TrasladosService],
})
export class TrasladosModule {}
