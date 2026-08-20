import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module';
import { KdsGateway } from './kds.gateway';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [InventarioModule],
  controllers: [PedidosController],
  providers: [PedidosService, KdsGateway],
  exports: [PedidosService],
})
export class PedidosModule {}
