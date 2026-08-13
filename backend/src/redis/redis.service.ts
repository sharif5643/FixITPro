import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly fallback = new Map<string, { value: string; expiresAt: number }>();

  constructor(private config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url) {
      this.client = new Redis(url, {
        lazyConnect:          true,
        maxRetriesPerRequest: 3,
        enableReadyCheck:     true,
        reconnectOnError:     () => true,
      });
      this.client.on('error', (err) =>
        this.logger.warn(`Redis error — falling back to memory: ${err.message}`),
      );
      this.client.connect().catch((err) => {
        this.logger.warn(`Redis connect failed, in-memory fallback active: ${err.message}`);
        this.client = null;
      });
    } else {
      this.logger.warn('REDIS_URL not set — module cache running in-memory (single-process only)');
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => {});
  }

  // Returns null if key not found or expired.
  async get(key: string): Promise<string | null> {
    if (this.client) {
      try { return await this.client.get(key); } catch { /* fall through */ }
    }
    const entry = this.fallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.fallback.delete(key);
      return null;
    }
    return entry.value;
  }

  // ttlSeconds = 0 → no expiry (only for fallback; Redis always needs a TTL for memory safety)
  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    if (this.client) {
      try {
        if (ttlSeconds > 0) await this.client.set(key, value, 'EX', ttlSeconds);
        else                await this.client.set(key, value);
        return;
      } catch { /* fall through */ }
    }
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
    this.fallback.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      try { await this.client.del(key); return; } catch { /* fall through */ }
    }
    this.fallback.delete(key);
  }

  // Delete all keys matching a glob pattern (Redis SCAN; fallback iterates Map keys).
  async delByPattern(pattern: string): Promise<void> {
    if (this.client) {
      try {
        const keys = await this.scanAll(pattern);
        if (keys.length) await this.client.del(...keys);
        return;
      } catch { /* fall through */ }
    }
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const k of this.fallback.keys()) {
      if (re.test(k)) this.fallback.delete(k);
    }
  }

  private async scanAll(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
