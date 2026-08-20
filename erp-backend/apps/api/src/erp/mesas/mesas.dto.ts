import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ESTADOS_MESA = [
  'LIBRE',
  'OCUPADA',
  'ESPERANDO_CONFIRMACION',
  'COMIENDO',
  'PIDIENDO_CUENTA',
  'LIMPIEZA',
] as const;
export type EstadoMesa = (typeof ESTADOS_MESA)[number];

export const ZONAS_MESA = ['SALON', 'TERRAZA', 'BAR'] as const;
export type ZonaMesa = (typeof ZONAS_MESA)[number];

export class CreateMesaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nombre?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  capacidad!: number;

  @IsIn(ZONAS_MESA)
  zona!: ZonaMesa;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pos_x?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pos_y?: number;
}

export class UpdateMesaDto extends PartialType(CreateMesaDto) {}

export class CambiarEstadoMesaDto {
  @IsIn(ESTADOS_MESA)
  estado!: EstadoMesa;
}

export class PosicionMesaItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_mesa!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pos_x!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pos_y!: number;
}

export class ActualizarPosicionesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosicionMesaItemDto)
  items!: PosicionMesaItemDto[];
}

export class UnirMesasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_mesa_principal!: number;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  id_mesas_secundarias!: number[];
}

export class SepararMesasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_mesa!: number;
}
