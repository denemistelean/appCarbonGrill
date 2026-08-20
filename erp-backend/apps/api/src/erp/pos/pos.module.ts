import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { CajaModule } from '../caja/caja.module';
import { ComprobantesModule } from '../comprobantes/comprobantes.module';
import { PedidosModule } from '../pedidos/pedidos.module';
import { ClientesModule } from '../clientes/clientes.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [CommonModule, PedidosModule, CajaModule, ComprobantesModule, ClientesModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
