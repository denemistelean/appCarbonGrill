import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const TIPOS_COMPROBANTE = ['01', '03', '07'] as const;
export const TIPOS_DOC_CLIENTE = ['0', '1', '4', '6', '7'] as const;

export class EmitirComprobanteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cuenta!: number;

  @IsIn(['01', '03'])
  tipo!: '01' | '03';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_serie!: number;

  @IsIn(TIPOS_DOC_CLIENTE)
  tipo_doc_cliente!: (typeof TIPOS_DOC_CLIENTE)[number];

  @IsOptional()
  @IsString()
  @MaxLength(15)
  num_doc_cliente?: string;

  @IsString()
  @MaxLength(200)
  razon_social_cliente!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_cliente?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_esperado!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  ids_cuenta_item?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_cobro?: number;
}

export class EmitirNotaCreditoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_comprobante_afectado!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_serie!: number;

  @IsString()
  @MaxLength(200)
  motivo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  total_esperado!: number;
}

export class CrearSerieDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsIn(TIPOS_COMPROBANTE)
  tipo!: (typeof TIPOS_COMPROBANTE)[number];

  @IsString()
  @Matches(/^[A-Z0-9]{4}$/)
  serie!: string;
}

export class AnularComprobanteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @ValidateIf((o) => o.id_serie != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_serie?: number;
}
