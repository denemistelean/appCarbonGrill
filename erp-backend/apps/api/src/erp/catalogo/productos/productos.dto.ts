import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecetaItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;
}

export class ComboItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad!: number;
}

export class ProductoSucursalItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsIn([0, 1])
  disponible!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_override?: number | null;
}

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_categoria!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio!: number;

  @Type(() => Number)
  @IsIn([0, 1])
  es_combo!: number;

  @IsIn(['COCINA', 'PARRILLA', 'BAR', 'NINGUNA'])
  estacion!: 'COCINA' | 'PARRILLA' | 'BAR' | 'NINGUNA';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecetaItemDto)
  receta?: RecetaItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  combo_items?: ComboItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductoSucursalItemDto)
  sucursales?: ProductoSucursalItemDto[];
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {}
