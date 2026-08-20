import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateUnidadMedidaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre!: string;
}

export class UpdateUnidadMedidaDto extends PartialType(CreateUnidadMedidaDto) {}

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden?: number;
}

export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto) {}

export class CreatePorcionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio!: number;

  @IsOptional()
  @IsIn(['TODAS', 'PARRILLA', 'COCINA', 'BAR'])
  aplica_estacion?: 'TODAS' | 'PARRILLA' | 'COCINA' | 'BAR';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden?: number;
}

export class UpdatePorcionDto extends PartialType(CreatePorcionDto) {}
