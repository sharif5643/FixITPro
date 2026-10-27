import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DatabaseModule } from '../database/database.module';
import { loadPlatformSecrets, PLATFORM_SECRET_KEYS, platformSecretSource, type PlatformSecretKey } from './platform-secrets';

@Injectable()
export class PlatformSecretsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSecretsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
    this.timer = setInterval(() => this.reload(), 5 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reload() {
    try {
      loadPlatformSecrets(await this.prisma.platformSecret.findMany({ select: { key: true, value: true } }));
    } catch (err) {
      this.logger.warn(`Could not load platform keys: ${(err as Error).message}`);
    }
  }

  /** Which keys are set and where from. Values never leave the server. */
  status() {
    return Object.fromEntries(PLATFORM_SECRET_KEYS.map((k) => [k, platformSecretSource(k)])) as Record<PlatformSecretKey, 'env' | 'web' | null>;
  }

  /** Save the keys given; an empty string removes that key. */
  async save(values: Partial<Record<PlatformSecretKey, string>>) {
    for (const key of PLATFORM_SECRET_KEYS) {
      const v = values[key];
      if (v === undefined) continue;
      if (v.trim()) {
        await this.prisma.platformSecret.upsert({ where: { key }, create: { key, value: v.trim() }, update: { value: v.trim() } });
      } else {
        await this.prisma.platformSecret.deleteMany({ where: { key } });
      }
    }
    await this.reload();
    return this.status();
  }
}

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [PlatformSecretsService],
  exports: [PlatformSecretsService],
})
export class PlatformSecretsModule {}
