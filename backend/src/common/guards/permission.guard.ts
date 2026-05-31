import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // OWNER and SUPER_ADMIN bypass all permission checks
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true;

    const has = await this.prisma.rolePermission.findUnique({
      where: { role_permission: { role: user.role, permission } },
    });

    if (!has) throw new ForbiddenException(`ไม่มีสิทธิ์: ${permission}`);
    return true;
  }
}
