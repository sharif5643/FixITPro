import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string, role?: string, search?: string) {
    const where: Record<string, any> = {
      role: { not: 'SUPER_ADMIN' },
    };

    if (tenantId) where.tenantId = tenantId;
    if (role) where.role = role;

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          tenantId: true,
          branchId: true,
          tenant: { select: { id: true, shopName: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total };
  }

  async stats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, active, owners, managers, activeToday] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      this.prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' }, isActive: true } }),
      this.prisma.user.count({ where: { role: 'OWNER' } }),
      this.prisma.user.count({ where: { role: 'MANAGER' } }),
      this.prisma.user.count({
        where: { role: { not: 'SUPER_ADMIN' }, lastLoginAt: { gte: today } },
      }),
    ]);

    return { total, active, owners, managers, activeToday };
  }
}
