import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

interface AuthUser {
  id?: string;
  tenantId?: string | null;
  branchId?: string | null;
}

/**
 * RC2-002: Global HTTP access log — logs every request/response with timing.
 *
 * Logs:  timestamp, method, path, status, latency (ms), userId, tenantId, branchId.
 * Never logs: request bodies, cookies, Authorization headers, or any token values.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req  = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const { method, url } = req;
    const t0 = Date.now();

    const finish = (status: number) => {
      const user = req.user;
      this.logger.log(
        JSON.stringify({
          ts:       new Date().toISOString(),
          method,
          path:     url,
          status,
          ms:       Date.now() - t0,
          uid:      user?.id       ?? null,
          tenantId: user?.tenantId ?? null,
          branchId: user?.branchId ?? null,
        }),
      );
    };

    return next.handle().pipe(
      tap({
        next:  () => finish(context.switchToHttp().getResponse<Response>().statusCode),
        error: (err: unknown) => finish((err as any)?.status ?? (err as any)?.statusCode ?? 500),
      }),
    );
  }
}
