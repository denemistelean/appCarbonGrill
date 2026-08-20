import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSucursalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsIn(['LOCAL', 'ALMACEN'])
  tipo?: 'LOCAL' | 'ALMACEN';

  @IsOptional()
  @IsString()
  @MaxLength(4)
  codigo_establecimiento_sunat?: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{11}$/, { message: 'RUC debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razon_social?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_comercial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  ubigeo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  departamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provincia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  distrito?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_fiscal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nubefact_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nubefact_token?: string;
}

export class UpdateSucursalDto extends PartialType(CreateSucursalDto) {}
