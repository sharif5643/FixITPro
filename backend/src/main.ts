import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { createWinstonLogger } from './common/logger/winston.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  // P0-1: Fail fast on missing or insecure JWT_SECRET before any module loads.
  const jwtSecret = process.env.JWT_SECRET;
  const KNOWN_WEAK_JWT_SECRETS = new Set([
    'your_secret_key',
    'your-super-secret-jwt-key-change-this-in-production',
    'REPLACE_WITH_96_CHAR_HEX_SECRET',
    'dev_jwt_secret_not_for_production',
    'dev_placeholder_not_secure_replace_before_any_deployment',
    'secret',
    'changeme',
  ]);
  if (!jwtSecret) {
    throw new Error('FATAL: JWT_SECRET is not set. App startup aborted.');
  }
  if (jwtSecret.length < 32) {
    throw new Error(
      `FATAL: JWT_SECRET is too short (${jwtSecret.length} chars, minimum 32). ` +
      `Generate one: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`,
    );
  }
  if (isProd && KNOWN_WEAK_JWT_SECRETS.has(jwtSecret)) {
    throw new Error(
      `FATAL: JWT_SECRET is a known placeholder value. ` +
      `Generate a real secret: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" ` +
      `then set it in .env.production. App startup aborted.`,
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createWinstonLogger(),
  });

  // CHB-09 / BLK-1: security headers on every response, including direct LAN
  // access from the SUNMI APK that bypasses Nginx.
  app.use(helmet());

  // CHB-01: parse cookies so req.cookies.access_token is available in JwtStrategy
  app.use(cookieParser());

  // Exclude /health from the api/v1 prefix so uptime monitors can hit a clean URL.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

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
