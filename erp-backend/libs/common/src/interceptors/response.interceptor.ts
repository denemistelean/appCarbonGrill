import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        const res = context.switchToHttp().getResponse();
        if (res?.headersSent || res?.writableEnded) return data;

        // Solo listas paginadas (page/limit). No usar `total`: un pedido también trae items + total monetario.
        if (data && Array.isArray(data.items) && (data.page != null || data.limit != null)) {
          const { items, mensaje, page, limit, total, count, server_time } = data;
          return {
            success: true,
            message: mensaje || 'Operación exitosa',
            data: items,
            page,
            limit,
            total,
            count,
            server_time,
            timestamp: new Date().toISOString(),
          };
        }

        const message = (data && data.mensaje) ? data.mensaje : 'Operación exitosa';
        if (data && data.mensaje) delete data.mensaje;

        return {
          success: true,
          message: message,
          data: data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}