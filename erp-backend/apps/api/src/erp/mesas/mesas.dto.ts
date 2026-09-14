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

export const TIPOS_FORMA_MAPA = ['RECT', 'L', 'CIRCLE', 'CUSTOM'] as const;
export type TipoFormaMapa = (typeof TIPOS_FORMA_MAPA)[number];

export const TIPOS_LANDMARK = ['TV', 'BANO', 'ESCALERA', 'COCINA', 'CAJA', 'ENTRADA'] as const;
export type TipoLandmark = (typeof TIPOS_LANDMARK)[number];

export class LandmarkMapaDto {
  @IsIn(TIPOS_LANDMARK)
  tipo!: TipoLandmark;

  @Type(() => Number)
  @Min(0)
  @Max(100)
  x!: number;

  @Type(() => Number)
  @Min(0)
  @Max(100)
  y!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  etiqueta?: string;
}

export class GuardarSalonMapaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsIn(TIPOS_FORMA_MAPA)
  tipo_forma!: TipoFormaMapa;

  @IsOptional()
  @IsArray()
  puntos?: number[][];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LandmarkMapaDto)
  landmarks?: LandmarkMapaDto[];
}
