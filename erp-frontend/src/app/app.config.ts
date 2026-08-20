import { ApplicationConfig, provideAppInitializer, inject, ErrorHandler } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { NgSelectConfig } from '@ng-select/ng-select';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth/auth-interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

import { PermissionsService } from './core/services/seguridad/permissions.service';
import { AuthService } from './core/services/auth.service';
import { GlobalErrorHandler } from './core/interceptors/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, errorInterceptor])
    ),

    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    // ng-select: búsqueda habilitada por defecto en todos los combos
    {
      provide: NgSelectConfig,
      useFactory: () => {
        const config = new NgSelectConfig();
        config.notFoundText = 'Sin resultados';
        config.typeToSearchText = 'Escribe para buscar...';
        config.loadingText = 'Cargando...';
        config.clearAllText = 'Limpiar';
        // searchable = true es el default de la lib; se deja explícito vía convención en templates
        return config;
      },
    },

    provideAppInitializer(() => {
      const authService = inject(AuthService);
      const permsService = inject(PermissionsService);

      if (authService.isLoggedIn()) {
        return firstValueFrom(permsService.loadPermissions().pipe(
          catchError(() => {
            permsService.clear();
            return of(null);
          })
        ));
      }

      return Promise.resolve();
    })
  ]
};
