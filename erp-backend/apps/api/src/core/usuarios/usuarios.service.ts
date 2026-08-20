import { Injectable, InternalServerErrorException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import * as bcrypt from 'bcrypt';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(@InjectDataSource('APP_DB_CONN') private dataSource: DataSource, private auditoriaService: AuditoriaService) {}

  async findByEmail(correo: string) {
    const [data] = await this.dataSource.query(`CALL sis_usuario_obtener_por_correo(?)`, [correo]);
    return data && data.length > 0 ? data[0] : null;
  }

  async getRoles() {
    const [data] = await this.dataSource.query(`CALL sis_rol_listar()`);
    return { success: true, data };
  }

  async create(dto: CreateUsuarioDto, userId: number) {
    try {
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      // Enviamos NULL al parámetro de id_cliente del SP, ya que el Core no maneja clientes.
      const [[result]] = await this.dataSource.query(
        `CALL sis_usuario_crear(?, ?, ?, ?, ?, ?)`, 
        [dto.id_rol, null, dto.nombres.trim().toUpperCase(), dto.apellidos.trim().toUpperCase(), dto.correo.trim().toLowerCase(), hashedPassword]
      );
      
      const idUsuarioNuevo = result.id_insertado;

      await this.auditoriaService.registrar('sis_usuario', idUsuarioNuevo, 'CREAR', userId, null, { correo: dto.correo, rol: dto.id_rol });
      return { success: true, message: 'Usuario base registrado exitosamente', id: idUsuarioNuevo };
    } catch (error: any) {
      if (error.message.includes('correo')) throw new ConflictException('El correo ya está en uso');
      throw new InternalServerErrorException('Error al crear usuario en el Core');
    }
  }

  async findAll() {
    const [data] = await this.dataSource.query(`CALL sis_usuario_listar(NULL, 'ACTIVO')`);
    return { success: true, data };
  }

  async findOne(id: number) {
    const [data] = await this.dataSource.query(`CALL sis_usuario_obtener(?)`, [id]);
    if (!data || data.length === 0) throw new NotFoundException('Usuario no encontrado');
    return { success: true, data: data[0] };
  }

  async update(id: number, dto: UpdateUsuarioDto, userId: number) {
    const antiguo = await this.findOne(id);

    try {
      // 🔥 FIX CRÍTICO APLICADO AQUÍ: El orden exacto de los parámetros para sis_usuario_actualizar
      await this.dataSource.query(
        `CALL sis_usuario_actualizar(?, ?, ?, ?, ?)`, 
        [
          id, 
          dto.id_rol || antiguo.data.id_rol, 
          dto.nombres || antiguo.data.nombres, 
          dto.apellidos || antiguo.data.apellidos,
          dto.correo || antiguo.data.correo
        ]
      );

      if (dto.password && String(dto.password).trim().length >= 6) {
        const hashed = await bcrypt.hash(String(dto.password).trim(), 10);
        await this.dataSource.query(`UPDATE sis_usuario SET password = ? WHERE id_usuario = ?`, [hashed, id]);
      }

      await this.auditoriaService.registrar('sis_usuario', id, 'ACTUALIZAR', userId, antiguo.data, { id_rol: dto.id_rol, nombres: dto.nombres });
      return { success: true, message: 'Usuario actualizado correctamente' };
    } catch (error) {
      throw new InternalServerErrorException('Error al actualizar usuario');
    }
  }

  async cambiarClave(userId: number, claveActual: string, claveNueva: string) {
    const [row] = await this.dataSource.query(
      `SELECT id_usuario, password, estado_registro FROM sis_usuario WHERE id_usuario = ? LIMIT 1`,
      [userId]
    );
    if (!row || row.estado_registro !== 'ACTIVO') {
      throw new NotFoundException('Usuario no encontrado');
    }
    const ok = await bcrypt.compare(String(claveActual || ''), row.password);
    if (!ok) {
      throw new ConflictException('La clave actual es incorrecta');
    }
    if (String(claveNueva || '').trim().length < 6) {
      throw new ConflictException('La nueva clave debe tener al menos 6 caracteres');
    }
    const hashed = await bcrypt.hash(String(claveNueva).trim(), 10);
    await this.dataSource.query(`UPDATE sis_usuario SET password = ? WHERE id_usuario = ?`, [hashed, userId]);
    await this.auditoriaService.registrar('sis_usuario', userId, 'ACTUALIZAR', userId, null, { accion: 'cambiar_clave' });
    return { success: true, mensaje: 'Clave actualizada correctamente' };
  }

  async leerYMarcarPrimeraSesion(userId: number): Promise<boolean> {
    try {
      const [row] = await this.dataSource.query(`SELECT primera_sesion FROM sis_usuario WHERE id_usuario = ?`, [userId]);
      const esPrimera = row?.primera_sesion === 1;
      if (esPrimera) {
        await this.dataSource.query(`UPDATE sis_usuario SET primera_sesion = 0 WHERE id_usuario = ?`, [userId]);
      }
      return esPrimera;
    } catch (_) {
      return false;
    }
  }

  async remove(id: number, userId: number) {
    if (id === 1) throw new ConflictException('No se puede eliminar al Administrador Principal del Sistema.');
    const antiguo = await this.findOne(id);
    await this.dataSource.query(`CALL sis_usuario_eliminar(?)`, [id]);
    await this.auditoriaService.registrar('sis_usuario', id, 'ELIMINAR', userId, antiguo.data, null);
    return { success: true, message: 'Usuario dado de baja' };
  }
}