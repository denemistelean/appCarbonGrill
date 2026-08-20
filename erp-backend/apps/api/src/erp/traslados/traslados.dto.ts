import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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

const MOTIVOS_DIFERENCIA = ['MERMA_TRANSPORTE', 'PRODUCTO_DANADO', 'ERROR_CONTEO', 'OTRO'] as const;

export class TrasladoItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad_enviada!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_lote_origen?: number;
}

export class CreateTrasladoDto {
  @IsIn(['DISTRIBUCION', 'TRANSFERENCIA'])
  tipo!: 'DISTRIBUCION' | 'TRANSFERENCIA';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_origen!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_destino!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TrasladoItemDto)
  items!: TrasladoItemDto[];
}

export class RecibirTrasladoItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_traslado_item!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad_recibida!: number;

  @IsOptional()
  @IsIn(MOTIVOS_DIFERENCIA)
  motivo_diferencia?: (typeof MOTIVOS_DIFERENCIA)[number];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detalle_diferencia?: string;
}

export class RecibirTrasladoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecibirTrasladoItemDto)
  items!: RecibirTrasladoItemDto[];
}

export class RechazarTrasladoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;
}
