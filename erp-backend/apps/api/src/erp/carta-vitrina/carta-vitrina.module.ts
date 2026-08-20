import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { CartaVitrinaPublicController, CartaVitrinaStaffController } from './carta-vitrina.controller';
import { CartaVitrinaService } from './carta-vitrina.service';

@Module({
  imports: [CommonModule],
  controllers: [CartaVitrinaPublicController, CartaVitrinaStaffController],
  providers: [CartaVitrinaService],
})
export class CartaVitrinaModule {}
