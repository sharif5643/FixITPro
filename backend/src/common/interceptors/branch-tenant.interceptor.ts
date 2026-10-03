import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';

/**
 * A branchId sent by the client (query string or body) must belong to the caller's shop.
 *
 * Owners may pick a branch, and many services then filter by `{ branchId }` alone, so a
 * branch id from another shop returned that shop's dashboard, reports and stock, or created
 * records in it. Checking here covers every endpoint at once. Runs after the auth guards;
 * requests without a logged-in user (public routes) and SUPER_ADMIN are not affected.
 */
@Injectable()
export class BranchTenantInterceptor implements NestInterceptor {
  // A branch never moves to another shop, so its tenant can be cached.
  private readonly tenantOf = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req.user as { role?: string; tenantId?: string | null } | undefined;
    if (!user || user.role === 'SUPER_ADMIN' || !user.tenantId) return next.handle();

    const ids = new Set<string>();
    for (const v of [req.query?.branchId, req.body?.branchId]) {
      if (typeof v === 'string' && v && v !== 'all' && v !== 'null' && v !== 'undefined') ids.add(v);
    }
    for (const id of ids) {
      if (!this.tenantOf.has(id)) {
        const branch = await this.prisma.branch.findUnique({ where: { id }, select: { tenantId: true } });
        if (!branch) continue; // unknown id: the endpoint returns nothing / its own not-found
        this.tenantOf.set(id, branch.tenantId);
      }
      if (this.tenantOf.get(id) !== user.tenantId) {
        throw new ForbiddenException('สาขานี้ไม่ได้อยู่ในร้านของคุณ');
      }
    }
    return next.handle();
  }
}
