import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { createWinstonLogger } from './common/logger/winston.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createWinstonLogger(),
  });

  // CHB-09 / BLK-1: security headers on every response, including direct LAN
  // access from the SUNMI APK that bypasses Nginx.
  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  // Serve uploaded repair images as static assets at /uploads/...
  // UPLOADS_BASE_DIR env var allows PROD and DEV to use separate folders.
  const uploadsBase = process.env.UPLOADS_BASE_DIR || join(__dirname, '..', 'uploads');
  app.useStaticAssets(uploadsBase, { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // BLK-2: CORS_ORIGIN is required in production — a missing value silently
  // opens the API to all origins. Fail loudly at startup instead.
  const corsOrigin = process.env.CORS_ORIGIN;
  if (isProd && !corsOrigin) {
    throw new Error('FATAL: CORS_ORIGIN must be set in production. App startup aborted.');
  }
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true,
  });

  const port = parseInt(process.env.PORT ?? (isProd ? '3000' : '4000'), 10);

  if (!isProd && port === 3000) {
    logger.warn('DEV mode is starting on port 3000 — possible PROD port collision! Check .env.development has PORT=4000');
  }

  await app.listen(port);
  logger.log(`[${isProd ? 'PROD' : 'DEV'}] FixITPro Backend running on http://localhost:${port}/api/v1`);
}

bootstrap();
