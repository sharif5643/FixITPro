import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './redis/redis.service';

// RC2-002: skip all throttlers — Docker/Coolify healthchecks must never be rate-limited.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // BLK-4: probe DB + Redis so container healthchecks reflect real app state.
  // Returns 503 when DB is unreachable; Redis degraded is a warning, not fatal.
  @Get()
  async check() {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unreachable';
    }

    try {
      await this.redis.set('health:ping', '1', 10);
      const pong = await this.redis.get('health:ping');
      if (pong !== '1') redisStatus = 'degraded';
    } catch {
      redisStatus = 'degraded'; // non-fatal: in-memory fallback active
    }

    if (dbStatus !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'error',
        db: dbStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status:    'ok',
      db:        dbStatus,
      redis:     redisStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
