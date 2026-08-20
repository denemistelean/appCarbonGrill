import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { IdentityModule } from '../../common/integrations/identity/identity.module';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  imports: [CommonModule, IdentityModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
