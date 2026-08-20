import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DatabaseError');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Extraemos el código de error (Mysql Driver)
    const code = exception.driverError?.code || exception.code;
    const sqlMessage = exception.driverError?.message || exception.message;

    // 🔥 CASO 1: DUPLICADO (Error 1062)
    if (code === 'ER_DUP_ENTRY' || code === 1062) {
      // Intentamos sacar el valor duplicado del mensaje: "Duplicate entry 'NORTE'..."
      const match = sqlMessage.match(/Duplicate entry '(.*)' for key/);
      const valor = match ? match[1] : 'dato';

      this.logger.warn(`Duplicado detectado: ${valor}`);

      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: `Ya existe un registro con el valor '${valor}'.`,
        error: 'Conflict',
        statusCode: 409
      });
    }

    // 🔥 CASO 2: LLAVE FORÁNEA — eliminar un registro que tiene hijos (Error 1451)
    if (code === 'ER_ROW_IS_REFERENCED_2' || code === 1451) {
      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: 'No se puede eliminar porque tiene registros relacionados.',
        error: 'Conflict',
        statusCode: 409
      });
    }

    // 🔥 CASO 3: LLAVE FORÁNEA — insertar/actualizar con FK inexistente (Error 1452)
    if (code === 'ER_NO_REFERENCED_ROW_2' || code === 1452) {
      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: 'El registro referenciado no existe.',
        error: 'Conflict',
        statusCode: 409
      });
    }

    // OTROS ERRORES — loguear internamente, nunca exponer detalles SQL al cliente
    this.logger.error(`Error de Base de Datos no controlado [${code}]: ${sqlMessage}`, exception.stack);

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error interno de base de datos.',
      statusCode: 500
    });
  }
}