import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(@InjectDataSource('APP_DB_CONN') private readonly db: DataSource) {}

  async registrar(
    nombreTabla: string,
    idRegistro: number,
    accion: 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'ANULAR',
    idUsuario: number,
    valoresAntiguos: any = null,
    valoresNuevos: any = null
  ) {
    try {
      const sql = `
        INSERT INTO sis_auditoria 
        (nombre_tabla, id_registro, accion, id_usuario, valores_antiguos, valores_nuevos) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.query(sql, [
        nombreTabla,
        idRegistro,
        accion,
        idUsuario,
        valoresAntiguos ? JSON.stringify(valoresAntiguos) : null,
        valoresNuevos ? JSON.stringify(valoresNuevos) : null
      ]);
      
      this.logger.log(`✅ Auditoría guardada con éxito: ${accion} en ${nombreTabla}`);
      
    } catch (error) {
      // 🔥 AQUÍ VEREMOS EL ERROR REAL EN LA CONSOLA DE NESTJS
      this.logger.error(`❌ Error al intentar guardar auditoría en ${nombreTabla} (ID: ${idRegistro})`, error?.stack);
    }
  }
}