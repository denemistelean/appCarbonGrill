import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { CartaModule } from '../carta/carta.module';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';

@Module({
  imports: [CommonModule, CartaModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
