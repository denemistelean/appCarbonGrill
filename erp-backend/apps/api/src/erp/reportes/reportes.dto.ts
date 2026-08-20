import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const TIPOS_TICKET = ['PRECUENTA', 'COMPROBANTE', 'COBRO'] as const;
export const TIPOS_REPORTE = ['consolidado', 'ventas', 'platos', 'rentabilidad', 'mermas', 'ocupacion'] as const;

export class EncolarImpresionDto {
  @IsIn(TIPOS_TICKET)
  tipo!: (typeof TIPOS_TICKET)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_referencia!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sucursal?: number;
}
