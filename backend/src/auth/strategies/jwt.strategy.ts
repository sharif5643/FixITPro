import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export const ALL_PERMISSIONS = [
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.view_cost',
  'sales.create', 'sales.discount', 'sales.refund',
  'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate',
  'stock.adjust',
  'purchase.create', 'purchase.receive',
  'supplier.pay',
  'reports.view',
  'settings.manage',
  'claims.manage',
  'serials.manage',
  'expenses.manage',
  'audit.view',
  'notification.view',
  'notification.manage',
  'system.backup',
  'warranty.view',
  'warranty.manage',
  'technician.view',
  'data.export',
  'data.import',
  'branches.manage',
  'stock.transfer',
];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Token invalid or user inactive');

    let permissions: string[];
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
      permissions = ALL_PERMISSIONS;
    } else {
      const rows = await this.prisma.rolePermission.findMany({
        where: { role: user.role },
        select: { permission: true },
      });
      permissions = rows.map((r) => r.permission);
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
      branchId: (user as any).branchId ?? null,
      permissions,
    };
  }
}
