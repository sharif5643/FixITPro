import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export const ALL_PERMISSIONS = [
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.view_cost',
  'sales.create', 'sales.discount', 'sales.refund',
  'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
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
  // Cash Drawer
  'cash_drawer.open_session',
  'cash_drawer.join_session',
  'cash_drawer.withdraw',
  'cash_drawer.deposit',
  'cash_drawer.view_balance',
  'cash_drawer.close_session',
  'cash_drawer.approve_difference',
  'cash_drawer.manual_open',
];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // CHB-01: capture logger in constructor scope for use inside the extractor closure
    const logger = new Logger(JwtStrategy.name);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: HttpOnly cookie (CHB-01)
        (req: any) => req?.cookies?.access_token ?? null,
        // Fallback: Bearer header — kept for 30-day APK transition window.
        // Remove this extractor after all SUNMI APKs are confirmed on cookie auth.
        (req: any) => {
          const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          if (token) {
            logger.warn(`[CHB-01] Bearer fallback used — IP: ${req?.ip ?? 'unknown'}, path: ${req?.url ?? 'unknown'}`);
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string; branchId?: string | null; tenantId?: string | null }) {
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
      branchId: user.branchId ?? null,
      permissions,
    };
  }
}
