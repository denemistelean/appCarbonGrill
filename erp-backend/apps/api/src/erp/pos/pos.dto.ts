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
import { CobroMedioDto } from '../caja/caja.dto';

export const TIPOS_VENTA_POS = ['NOTA_VENTA', 'BOLETA_SIMPLE', 'BOLETA', 'FACTURA'] as const;
export type TipoVentaPos = (typeof TIPOS_VENTA_POS)[number];

export class PosItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad!: number;
}

export class PosVentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsIn(TIPOS_VENTA_POS)
  tipo_comprobante!: TipoVentaPos;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items!: PosItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CobroMedioDto)
  medios!: CobroMedioDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cliente?: number;

  @IsOptional()
  @IsIn(['0', '1', '4', '6', '7'])
  tipo_doc_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  num_doc_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razon_social_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class PosEmitirCuentaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cuenta!: number;

  @IsIn(TIPOS_VENTA_POS)
  tipo_comprobante!: TipoVentaPos;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cobro?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cliente?: number;

  @IsOptional()
  @IsIn(['0', '1', '4', '6', '7'])
  tipo_doc_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  num_doc_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razon_social_cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_cliente?: string;
}
