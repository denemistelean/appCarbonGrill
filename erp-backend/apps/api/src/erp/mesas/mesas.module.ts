import { Module } from '@nestjs/common';
import { CartaModule } from '../carta/carta.module';
import { MesasController } from './mesas.controller';
import { MesasService } from './mesas.service';

@Module({
  imports: [CartaModule],
  controllers: [MesasController],
  providers: [MesasService],
  exports: [MesasService],
})
export class MesasModule {}
