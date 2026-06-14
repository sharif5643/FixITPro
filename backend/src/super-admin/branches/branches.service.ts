import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string, search?: string) {
    const where: Record<string, any> = {};

    if (tenantId) {
      where.users = { some: { tenantId } };
    }

    if (search) {
      const searchCondition = {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ],
      };
      where.AND = [searchCondition];
    }

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        include: {
          _count: { select: { users: true } },
          users: {
            where: { tenantId: { not: null } },
            select: {
              tenantId: true,
              tenant: { select: { id: true, shopName: true } },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      data: branches.map((b) => {
        const { users, ...rest } = b;
        return {
          ...rest,
          tenantId: users[0]?.tenantId ?? null,
          tenant: users[0]?.tenant ?? null,
        };
      }),
      total,
    };
  }

  async stats() {
    const [total, active, suspended] = await Promise.all([
      this.prisma.branch.count(),
      this.prisma.branch.count({ where: { isActive: true, status: 'ACTIVE' } }),
      this.prisma.branch.count({ where: { status: 'SUSPENDED' } }),
    ]);

    return { total, active, suspended };
  }
}
