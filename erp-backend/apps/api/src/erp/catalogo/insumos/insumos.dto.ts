import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreateInsumoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_unidad_medida!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costo_unitario!: number;
}

export class UpdateInsumoDto extends PartialType(CreateInsumoDto) {}
