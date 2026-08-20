import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MEDIOS_COBRO = ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'] as const;
export type MedioCobro = (typeof MEDIOS_COBRO)[number];

export const MODOS_COBRO = ['COMPLETA', 'ITEMS', 'PARTES'] as const;
export type ModoCobro = (typeof MODOS_COBRO)[number];

export class AbrirTurnoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto_apertura!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class CerrarTurnoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto_cierre_contado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class CobroMedioDto {
  @IsIn(MEDIOS_COBRO)
  medio!: MedioCobro;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recibido?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;
}

export class CobrarDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_pedido!: number;

  @IsIn(MODOS_COBRO)
  modo!: ModoCobro;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CobroMedioDto)
  medios!: CobroMedioDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ids_items?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  n_partes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  n_parte?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class PedirCuentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_pedido!: number;
}
