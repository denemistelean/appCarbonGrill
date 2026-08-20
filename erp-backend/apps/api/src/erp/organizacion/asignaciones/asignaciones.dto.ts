import { IsInt, Min } from 'class-validator';

export class CreateAsignacionDto {
  @IsInt()
  @Min(1)
  id_usuario!: number;

  @IsInt()
  @Min(1)
  id_sucursal!: number;

  @IsInt()
  @Min(1)
  id_rol!: number;
}
