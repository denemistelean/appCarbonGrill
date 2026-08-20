import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module';
import { CartaPublicaController, CartaStaffController } from './carta.controller';
import { CartaService } from './carta.service';

@Module({
  imports: [PedidosModule],
  controllers: [CartaPublicaController, CartaStaffController],
  providers: [CartaService],
  exports: [CartaService],
})
export class CartaModule {}
