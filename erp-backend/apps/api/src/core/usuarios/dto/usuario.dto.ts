import { IsInt, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateUsuarioDto {
  @IsInt()
  @IsNotEmpty()
  id_rol!: number;

  @IsString()
  @IsNotEmpty()
  nombres!: string;

  @IsString()
  @IsNotEmpty()
  apellidos!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Mínimo 3 caracteres' })
  @MaxLength(100, { message: 'Máximo 100 caracteres' })
  correo!: string;

  @IsString()
  @MinLength(6, { message: 'Mínimo 6 caracteres' })
  @IsNotEmpty()
  password!: string;
}

export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {}
