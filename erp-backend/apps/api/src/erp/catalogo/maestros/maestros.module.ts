import { Module } from '@nestjs/common';
import { MaestrosController } from './maestros.controller';
import { MaestrosService } from './maestros.service';

@Module({
  controllers: [MaestrosController],
  providers: [MaestrosService],
})
export class MaestrosModule {}
