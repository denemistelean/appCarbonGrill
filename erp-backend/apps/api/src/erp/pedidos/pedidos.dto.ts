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

export const ESTADOS_PEDIDO = [
  'PENDIENTE_CONFIRMACION',
  'CONFIRMADO',
  'EN_PREPARACION',
  'LISTO',
  'ENTREGADO',
  'PAGADO',
  'ANULADO',
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const ESTADOS_PREPARACION = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'ANULADO'] as const;
export type EstadoPreparacion = (typeof ESTADOS_PREPARACION)[number];

export class PedidoModDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_insumo!: number;

  @IsIn(['AGREGAR', 'QUITAR'])
  accion!: 'AGREGAR' | 'QUITAR';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad?: number;
}

export class PedidoItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  persona_asociada?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PedidoModDto)
  mods?: PedidoModDto[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  porciones?: number[];
}

export class UpsertPedidoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_mesa!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsOptional()
  @IsIn(['MOZO', 'POS'])
  origen?: 'MOZO' | 'POS';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PedidoItemDto)
  items!: PedidoItemDto[];
}

export class ConfirmarPedidoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;
}

export class CambiarPreparacionDto {
  @IsIn(ESTADOS_PREPARACION)
  estado_preparacion!: EstadoPreparacion;
}
