import { Global, Module } from '@nestjs/common';
import { AlcanceService } from './alcance.service';

@Global()
@Module({
  providers: [AlcanceService],
  exports: [AlcanceService],
})
export class AlcanceModule {}
