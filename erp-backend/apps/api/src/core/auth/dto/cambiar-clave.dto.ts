import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty()
  clave_actual!: string;

  @IsString()
  @MinLength(6, { message: 'La nueva clave debe tener al menos 6 caracteres' })
  @IsNotEmpty()
  clave_nueva!: string;
}
