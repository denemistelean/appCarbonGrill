import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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

const MOTIVOS_MERMA = [
  'CARNE_QUEMADA',
  'INSUMO_VENCIDO',
  'DESPERDICIO_CORTE',
  'ERROR_COMANDA',
  'OTRO',
  'MERMA_TRANSPORTE',
  'PRODUCTO_DANADO',
  'ERROR_CONTEO',
] as const;
export type MotivoMerma = (typeof MOTIVOS_MERMA)[number];
export const MOTIVOS_MERMA_LISTA = MOTIVOS_MERMA;

export class IngresoInventarioDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costo_unitario!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lote?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle?: string;
}

export class SalidaInventarioDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_lote?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle?: string;
}

export class AjusteInventarioDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsIn(['INGRESO', 'SALIDA'])
  sentido!: 'INGRESO' | 'SALIDA';

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  motivo!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costo_unitario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle?: string;
}

export class CreateMermaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsIn(MOTIVOS_MERMA)
  motivo!: MotivoMerma;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_lote?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle?: string;
}

export class UpdateStockMinimoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stock_minimo!: number;
}

export class IngresoLoteItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costo_unitario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lote?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;
}

export class IngresoLoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngresoLoteItemDto)
  items!: IngresoLoteItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle?: string;
}
