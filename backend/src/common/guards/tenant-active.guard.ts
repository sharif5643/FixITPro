import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TENANT_BLOCK, TENANT_BLOCK_MESSAGE, tenantWriteBlock } from '../tenant-access';

@Injectable()
export class TenantActiveGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role === 'SUPER_ADMIN') return true;
    if (!user.tenantId) return true;
    // GET requests are read-only — allow even for expired or suspended shops so users can view their data
    if (request.method === 'GET') return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { expiryDate: true, status: true },
    });

    const block = tenantWriteBlock(tenant);
    if (block) {
      throw new ForbiddenException({ message: TENANT_BLOCK_MESSAGE[block], code: TENANT_BLOCK[block] });
    }
    return true;
  }
}
