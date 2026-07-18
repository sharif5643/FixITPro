import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions, ThrottlerGetTrackerFunction, ThrottlerGenerateKeyFunction } from '@nestjs/throttler';

/**
 * RC2-002: Global rate-limit guard registered as APP_GUARD.
 *
 * Enforces ONLY the 'default' throttler (300 req/min per IP) on every route.
 * Named throttlers (auth_login, auth_register, auth_change_pwd, public_tracking)
 * are intentionally skipped here so they remain per-route opt-in via explicit
 * @UseGuards(ThrottlerGuard) / @UseGuards(AuthThrottlerGuard) decorators on
 * the specific controllers that need them — preventing overly tight limits from
 * leaking onto general API endpoints.
 */
@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    if ((throttler as any).name !== 'default') return true;
    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
  }
}
