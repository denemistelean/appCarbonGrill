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
import { PedidoItemDto } from '../pedidos/pedidos.dto';

export const MOTIVOS_LLAMADO = ['AYUDA', 'CUENTA', 'PEDIDO', 'OTRO'] as const;

export class CartaPedidoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PedidoItemDto)
  items!: PedidoItemDto[];
}

export class LlamarMozoDto {
  @IsIn(MOTIVOS_LLAMADO)
  motivo!: (typeof MOTIVOS_LLAMADO)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detalle?: string;
}

export class AbrirSesionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_mesa!: number;
}
