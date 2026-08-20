process.env.TZ = 'America/Lima';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express'; // 🔥 NUEVO: Para servir archivos estáticos
import { join } from 'path'; // 🔥 NUEVO: Para manejar las rutas de las carpetas
import helmet from 'helmet';
import { ApiModule } from './api.module';
import { AllExceptionsFilter, TransformInterceptor } from '@app/common';
import { winstonConfig } from '@app/logger';
import { WinstonModule } from 'nest-winston';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { KdsIoAdapter } from './erp/pedidos/kds-io.adapter';

async function bootstrap() {
  // 🔥 Usamos NestExpressApplication para habilitar la exposición de la carpeta 'uploads'
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });
  
  app.enableShutdownHooks();

  const globalPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(globalPrefix);

  // 🔥 AJUSTADO: Helmet bloquea la visualización de imágenes/PDFs externos por defecto. 
  // Esto lo flexibiliza para que el frontend pueda mostrar los archivos del ERP.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const corsOriginSet = new Set(corsOrigins);
  for (const origin of corsOrigins) {
    corsOriginSet.add(origin.replace('localhost', '127.0.0.1'));
    corsOriginSet.add(origin.replace('127.0.0.1', 'localhost'));
  }
  const corsOriginList = [...corsOriginSet];

  app.enableCors({
    origin: corsOriginList.length > 0 ? corsOriginList : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.useWebSocketAdapter(new KdsIoAdapter(app, corsOriginList.length > 0 ? corsOriginList : true));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new DatabaseExceptionFilter(), new AllExceptionsFilter());

  // 🔥 NUEVO: Exponer la carpeta "uploads" para que el frontend pueda descargar/ver los archivos
  // Se asume que la carpeta 'uploads' estará en la raíz del backend
  app.useStaticAssets(join(__dirname, '..', '..', '..', 'uploads'), {
    prefix: '/uploads/',
  });

  const port = process.env.PORT || 3777;
  await app.listen(port);
  console.log(`🚀 ERP API corriendo en puerto: ${port} con prefijo: ${globalPrefix}`);
}
bootstrap();