import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter';

export const TEST_DB_URL =
  'postgresql://postgres:123456@localhost:5432/fixitpro_test';

/** Boot the full NestJS application against fixitpro_test. */
export async function createTestApp(): Promise<INestApplication> {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.NODE_ENV     = 'test';
  process.env.JWT_SECRET   = 'test_jwt_secret_at_least_32_chars_long_ok';
  process.env.JWT_EXPIRES_IN = '1h';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}

/** Extract Set-Cookie header values as a single cookie string. */
export function extractCookies(res: any): string {
  const raw: string[] = res.headers['set-cookie'] ?? [];
  return raw.map(c => c.split(';')[0]).join('; ');
}
