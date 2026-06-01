import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // BLK-4: probe the database so container healthchecks reflect real app state.
  // Returns 503 when DB is unreachable — prevents docker-compose from routing
  // traffic to a backend that cannot serve real requests.
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'unreachable',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
