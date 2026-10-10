import { HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Wrong passwords allowed from one address in the window before logins from it wait. */
export const LOGIN_FAIL_LIMIT = 10;
export const LOGIN_FAIL_WINDOW_SEC = 15 * 60;

/**
 * Counts only failed logins per address. The old limit counted every login, so a shop whose
 * staff share one internet connection was locked out after 10 correct logins in 15 minutes and
 * told it had entered the password wrongly too often.
 */
export class LoginFailures {
  constructor(private readonly redis: RedisService) {}

  private key(ip: string) { return `login-fail:${ip}`; }

  private async read(ip: string): Promise<{ n: number; since: number }> {
    const raw = await this.redis.get(this.key(ip)).catch(() => null);
    const [n, since] = (raw ?? '').split(':').map(Number);
    return n > 0 && since > 0 ? { n, since } : { n: 0, since: 0 };
  }

  /** Refuse while the address has used up its wrong attempts. */
  async assertAllowed(ip: string): Promise<void> {
    const { n, since } = await this.read(ip);
    if (n < LOGIN_FAIL_LIMIT) return;
    const retryAfter = Math.max(1, LOGIN_FAIL_WINDOW_SEC - Math.floor((Date.now() - since) / 1000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: 'ใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordFailure(ip: string): Promise<void> {
    const { n, since } = await this.read(ip);
    const start = n > 0 ? since : Date.now();
    const left = Math.max(1, LOGIN_FAIL_WINDOW_SEC - Math.floor((Date.now() - start) / 1000));
    await this.redis.set(this.key(ip), `${n + 1}:${start}`, left).catch(() => undefined);
  }
}
