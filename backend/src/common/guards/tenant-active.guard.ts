import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const GRACE_DAYS = 2;

@Injectable()
export class TenantActiveGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role === 'SUPER_ADMIN') return true;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (!user.tenantId) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { expiryDate: true },
    });

    if (!tenant?.expiryDate) return true;

    const gracePeriodEnd = new Date(tenant.expiryDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_DAYS);

    if (new Date() > gracePeriodEnd) {
      throw new ForbiddenException('แพ็กเกจหมดอายุแล้ว กรุณาต่ออายุก่อนใช้งาน');
    }

    return true;
  }
}
