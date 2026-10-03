import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../audit-log/audit-log.service';

const SECRET_KEYS = /pass(word)?|secret|token|key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

/**
 * Records every successful Super Admin write (shops, payments, plans, password resets,
 * system settings) in the audit log. Before, tenants, payments and settings wrote none, so
 * nobody could tell who suspended a shop, confirmed a payment or reset an owner's password.
 * Request bodies are stored with password/secret/token/key fields redacted; the temporary
 * password a reset returns is never stored.
 */
@Injectable()
export class SuperAdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next.handle();

    const controller = context.getClass().name.replace(/Controller$/, '');
    const handler = context.getHandler().name;
    return next.handle().pipe(
      tap(() => {
        void this.auditLog.log({
          actorId: req.user?.id ?? null,
          actorName: req.user?.name ?? null,
          action: `SUPER_ADMIN_${controller}_${handler}`.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
          entityType: controller,
          entityId: req.params?.id ?? null,
          afterData: (redact(req.body ?? {}) as Record<string, unknown>) ?? null,
          metadata: { method: req.method, path: req.originalUrl ?? req.url },
          ipAddress: req.ip ?? null,
          userAgent: req.headers?.['user-agent'] ?? null,
        });
      }),
    );
  }
}
