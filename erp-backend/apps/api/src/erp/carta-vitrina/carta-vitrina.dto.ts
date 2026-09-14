import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class IdSucursalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal?: number;
}

export class ActualizarVitrinaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  promo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  moneda?: string;

  @IsOptional()
  @IsIn(['carbon_grill', 'don_papas'])
  tema?: 'carbon_grill' | 'don_papas';
}

export class CrearTagDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal?: number;

  @IsIn(['SABOR', 'CHORIZO'])
  tipo!: 'SABOR' | 'CHORIZO';

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden?: number;
}

export class GuardarProductoVitrinaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_categoria!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_junior?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  imagen_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  visible_carta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  disponible?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden_carta?: number;

  @IsOptional()
  @IsIn(['COCINA', 'PARRILLA', 'BAR', 'NINGUNA'])
  estacion?: 'COCINA' | 'PARRILLA' | 'BAR' | 'NINGUNA';
}
