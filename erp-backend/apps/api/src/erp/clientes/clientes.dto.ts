import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const TIPOS_DOC_CLIENTE = ['DNI', 'RUC', 'CE', 'PAS', 'OTRO'] as const;

export class CreateClienteDto {
  @IsIn(TIPOS_DOC_CLIENTE)
  tipo_documento!: (typeof TIPOS_DOC_CLIENTE)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero_documento!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razon_social!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombres?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  correo?: string;
}

export class UpdateClienteDto extends PartialType(CreateClienteDto) {}
