import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ALL_PERMISSIONS } from './strategies/jwt.strategy';
import { ModulesService } from '../modules/modules.service';

const REFRESH_TOKEN_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private modulesService: ModulesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredRefreshTokens() {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Cleaned up ${count} expired refresh tokens`);
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000);

    await this.prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } });
    return raw;
  }

  private buildPayload(user: { id: string; email: string; role: string; branchId?: string | null; tenantId?: string | null }) {
    return {
      sub:      user.id,
      email:    user.email,
      role:     user.role,
      branchId: (user as any).branchId ?? null,
      tenantId: (user as any).tenantId ?? null,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const branchId = (user as any).branchId ?? null;
    const tenantId = (user as any).tenantId ?? null;
    const token = this.jwtService.sign(this.buildPayload(user));
    const refreshToken = await this.issueRefreshToken(user.id);

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

    let tenantExpiryDate: string | null = null;
    let shopName: string | null = null;
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { expiryDate: true, shopName: true },
      });
      tenantExpiryDate = tenant?.expiryDate?.toISOString() ?? null;
      shopName = tenant?.shopName ?? null;
    }

    const enabledModules = await this.modulesService.getEnabledModules(tenantId);
    const redirectTo = user.role === 'SUPER_ADMIN' ? '/super-admin/tenants' : '/dashboard';

    return {
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        branchId,
        forcePasswordChange: user.forcePasswordChange,
        tenantExpiryDate,
        shopName,
      },
      permissions,
      enabledModules,
      redirectTo,
    };
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true, role: true, branchId: true, tenantId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    // Rotate: revoke old token and issue new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date() },
    });

    const accessToken  = this.jwtService.sign(this.buildPayload(user));
    const refreshToken = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  async revokeRefreshToken(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  }

  async register(dto: RegisterDto) {
    // B-5: Public registration disabled unless explicitly opted-in via env flag.
    // Even when enabled, OWNER and SUPER_ADMIN roles are never allowed publicly.
    const allowPublic = process.env.ALLOW_PUBLIC_REGISTER === 'true';
    if (!allowPublic) {
      throw new ForbiddenException(
        'Public registration is disabled. Contact an administrator to create an account.',
      );
    }

    const FORBIDDEN_ROLES = ['OWNER', 'SUPER_ADMIN'];
    if (dto.role && FORBIDDEN_ROLES.includes(dto.role)) {
      throw new ForbiddenException('Cannot self-register with elevated role');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        phone: dto.phone,
        role: (dto.role as any) || 'CASHIER',
        isActive: false, // Pending activation by an admin
      },
    });

    // B-6: Use identical JWT payload shape as login() — include branchId + tenantId (CHB-07)
    const branchId = (user as any).branchId ?? null;
    const tenantId = (user as any).tenantId ?? null;
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, branchId, tenantId });
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: null, branchId },
      permissions: [],
      redirectTo: '/',
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        forcePasswordChange: false,
        lastPasswordChangedAt: new Date(),
      },
    });

    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, tenantId: true, branchId: true,
        forcePasswordChange: true,
        createdAt: true, lastLoginAt: true,
      },
    });

    if (!user) return null;

    let permissions: string[] = [];
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
      permissions = ALL_PERMISSIONS;
    } else {
      const rows = await this.prisma.rolePermission.findMany({
        where: { role: user.role as any },
        select: { permission: true },
      });
      permissions = rows.map((r) => r.permission);
    }

    let tenantExpiryDate: string | null = null;
    let shopName: string | null = null;
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { expiryDate: true, shopName: true },
      });
      tenantExpiryDate = tenant?.expiryDate?.toISOString() ?? null;
      shopName = tenant?.shopName ?? null;
    }

    const enabledModules = await this.modulesService.getEnabledModules(user.tenantId ?? null);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
      forcePasswordChange: user.forcePasswordChange,
      tenantExpiryDate,
      shopName,
      permissions,
      enabledModules,
    };
  }
}
