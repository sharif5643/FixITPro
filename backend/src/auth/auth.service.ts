import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ALL_PERMISSIONS } from './strategies/jwt.strategy';
import { ModulesService } from '../modules/modules.service';
import { loadRolePermissions } from '../permissions/role-permissions';

const REFRESH_TOKEN_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private modulesService: ModulesService,
  ) {}

  @Cron('0 30 3 * * *', { timeZone: 'Asia/Bangkok' })
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

  private buildPayload(user: { id: string; email?: string | null; role: string; branchId?: string | null; tenantId?: string | null }) {
    return {
      sub:      user.id,
      email:    user.email ?? null,
      role:     user.role,
      branchId: user.branchId ?? null,
      tenantId: user.tenantId ?? null,
    };
  }

  async login(dto: LoginDto) {
    const identifier = dto.email; // dto.email holds email OR username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const branchId = user.branchId ?? null;
    const tenantId = user.tenantId ?? null;
    const token = this.jwtService.sign(this.buildPayload(user));
    const refreshToken = await this.issueRefreshToken(user.id);

    let permissions: string[];
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
      permissions = ALL_PERMISSIONS;
    } else {
      const [roleRows, userRows] = await Promise.all([
        loadRolePermissions(this.prisma, user.role, user.tenantId),
        this.prisma.userPermission.findMany({ where: { userId: user.id }, select: { permission: true } }),
      ]);
      permissions = [...new Set([...roleRows, ...userRows.map((r) => r.permission)])];
    }

    let tenantExpiryDate: string | null = null;
    let shopName: string | null = null;
    let tenantStatus: string | null = null;
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { expiryDate: true, shopName: true, status: true },
      });
      tenantExpiryDate = tenant?.expiryDate?.toISOString() ?? null;
      shopName = tenant?.shopName ?? null;
      tenantStatus = tenant?.status ?? null;
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
        tenantStatus,
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
    const branchId = user.branchId ?? null;
    const tenantId = user.tenantId ?? null;
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, branchId, tenantId });
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: null, branchId },
      permissions: [],
      redirectTo: '/',
    };
  }

  // Self-service reset must not change the password: the request is unauthenticated, so
  // anyone who knew an email could lock that account out (the temp password was never
  // shown to anyone). Instead the shop owner is notified and resets it from Users, which
  // shows them the temporary password.
  async forgotPassword(email: string) {
    const GENERIC_MSG = 'ส่งคำขอถึงเจ้าของร้านแล้ว — ให้เจ้าของร้านรีเซ็ตรหัสผ่านให้ที่เมนู ผู้ใช้งาน';

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isActive: true, tenantId: true, branchId: true },
    });
    if (user?.isActive && user.tenantId) {
      const pending = await this.prisma.notification.findFirst({
        where: { type: 'PASSWORD_RESET_REQUEST', entityId: user.id, isRead: false, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!pending) {
        await this.prisma.notification.create({
          data: {
            type:       'PASSWORD_RESET_REQUEST',
            title:      'คำขอรีเซ็ตรหัสผ่าน',
            message:    `${user.name} (${user.email}) ลืมรหัสผ่าน — รีเซ็ตให้ได้ที่ ผู้ใช้งาน > รีเซ็ตรหัสผ่าน`,
            severity:   'WARNING',
            entityType: 'User',
            entityId:   user.id,
            branchId:   user.branchId ?? null,
            tenantId:   user.tenantId,
          },
        });
      }
    }
    // Always return the same response — prevents user enumeration via email
    return { message: GENERIC_MSG };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, keepRefreshToken?: string) {
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
    // Signed in elsewhere (another phone, or someone who took the password): signed out there.
    // This device stays signed in.
    const keep = keepRefreshToken ? this.hashToken(keepRefreshToken) : null;
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(keep ? { NOT: { tokenHash: keep } } : {}) },
      data:  { revokedAt: new Date() },
    });

    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  }

  async mySignature(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { signatureImage: true } });
    return { image: u?.signatureImage ?? null };
  }

  async saveMySignature(userId: string, image: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { signatureImage: image } });
    return { image };
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
      // Role grants plus this person's own grants, the same set login() and the guards use
      const [roleRows, userRows] = await Promise.all([
        loadRolePermissions(this.prisma, user.role, user.tenantId),
        this.prisma.userPermission.findMany({ where: { userId: user.id }, select: { permission: true } }),
      ]);
      permissions = [...new Set([...roleRows, ...userRows.map((r) => r.permission)])];
    }

    let tenantExpiryDate: string | null = null;
    let shopName: string | null = null;
    let tenantStatus: string | null = null;
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { expiryDate: true, shopName: true, status: true },
      });
      tenantExpiryDate = tenant?.expiryDate?.toISOString() ?? null;
      shopName = tenant?.shopName ?? null;
      tenantStatus = tenant?.status ?? null;
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
      tenantStatus,
      shopName,
      permissions,
      enabledModules,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Social OAuth — find-or-create user, then issue tokens exactly like login()
  // ──────────────────────────────────────────────────────────────────────────────

  async loginOrCreateSocialUser(opts: {
    provider: 'google' | 'line';
    externalId: string;
    email: string;
    /** The provider says this person owns the email (Google email_verified, LINE id_token email) */
    emailVerified: boolean;
    name: string;
  }) {
    const idField = opts.provider === 'google' ? 'googleId' : 'lineUserId';

    // 1. Find by social ID
    let user = await this.prisma.user.findFirst({
      where: { [idField]: opts.externalId },
    });

    if (!user && opts.emailVerified) {
      // 2. Link to the account with this email — only when the provider verified the email,
      //    otherwise anyone could put a shop owner's address on their profile and sign in as them
      user = await this.prisma.user.findUnique({ where: { email: opts.email } });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { [idField]: opts.externalId },
        });
      }
    }

    // No account is ever created here: a new sign-in used to make an active cashier with no shop,
    // which some screens read as "every shop". Staff accounts come from the owner or sign-up.
    if (!user) throw new UnauthorizedException('ยังไม่มีบัญชีนี้ในระบบ — สมัครร้านใหม่ หรือให้เจ้าของร้านเพิ่มบัญชีให้');
    if (!user.isActive) throw new UnauthorizedException('บัญชีนี้ถูกปิดใช้งาน');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken  = this.jwtService.sign(this.buildPayload(user));
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user };
  }
}
