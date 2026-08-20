import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

// El decorador @Catch() vacío significa que atrapará ABSOLUTAMENTE TODOS los errores
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Determinamos el código de estado HTTP
    const status = 
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 2. Extraemos el mensaje del error
    let message = 'Error interno del servidor';
    
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      // Si el error viene de las validaciones de nuestro DTO, extraemos ese mensaje específico
      message = typeof exceptionResponse === 'string' 
        ? exceptionResponse 
        : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      // Errores no HTTP (p. ej. MySQL caído, SP inexistente): log completo para diagnóstico.
      const detail =
        exception.message?.trim() ||
        (exception as any).code ||
        (exception as any).driverError?.message ||
        exception.name ||
        String(exception);
      console.error(`[ERROR NO CONTROLADO] en ${request.url}:`, detail);
      if (exception.stack) console.error(exception.stack);

      const full = `${exception.message || ''} ${(exception as any).driverError?.message || ''}`;
      if (full.includes('ER_DUP_ENTRY')) {
        message = 'El registro que intenta crear ya existe en el sistema.';
      } else if (
        full.includes('ECONNREFUSED') ||
        full.includes("Can't connect") ||
        full.includes('PROTOCOL_CONNECTION_LOST') ||
        (exception as any).code === 'ECONNREFUSED'
      ) {
        message = 'No hay conexión con la base de datos. Verifique que MySQL/MariaDB esté iniciado.';
      }
    } else {
      console.error(`[ERROR NO CONTROLADO] en ${request.url}:`, exception);
    }

    // 3. Estructuramos la respuesta final que SIEMPRE recibirá el Frontend
    response.status(status).json({
      exito: false, // Bandera rápida para que el Frontend sepa que falló
      estado: status,
      mensaje: message,
      ruta: request.url,
      fecha: new Date().toISOString(),
    });
  }
}