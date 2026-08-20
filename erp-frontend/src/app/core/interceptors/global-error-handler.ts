import { ErrorHandler, Injectable } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    const errorString = error?.message || error?.toString() || '';
    
    // Expresiones regulares para detectar errores de Lazy Loading y Chunks
    const chunkFailedMessage = /Loading chunk [\d]+ failed/;
    const dynamicImportFailed = /Failed to fetch dynamically imported module/;

    if (chunkFailedMessage.test(errorString) || dynamicImportFailed.test(errorString)) {
      console.warn('🔄 Nueva versión detectada en el servidor. Recargando la aplicación...');
      // Recarga la página forzando la limpieza de caché (limpia la sesión actual del navegador)
      window.location.reload();
    } else {
      // Para los demás errores, imprimirlos en consola normalmente
      console.error(error);
    }
  }
}