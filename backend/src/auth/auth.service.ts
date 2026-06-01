import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ALL_PERMISSIONS } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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
    // CHB-07: tenantId added to payload — downstream guards can scope tenant
    // isolation from the token without an extra DB round-trip.
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, branchId, tenantId });

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

    const redirectTo = user.role === 'SUPER_ADMIN' ? '/super-admin/tenants' : '/';

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        branchId,
        forcePasswordChange: user.forcePasswordChange,
      },
      permissions,
      redirectTo,
    };
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
        role: true, tenantId: true, createdAt: true, lastLoginAt: true,
      },
    });

    let permissions: string[] = [];
    if (user) {
      if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
        permissions = ALL_PERMISSIONS;
      } else {
        const rows = await this.prisma.rolePermission.findMany({
          where: { role: user.role as any },
          select: { permission: true },
        });
        permissions = rows.map((r) => r.permission);
      }
    }

    return { ...user, permissions };
  }
}
