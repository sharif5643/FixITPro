import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // OWNER and SUPER_ADMIN bypass all permission checks
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true;

    // req.user.permissions already merges role grants + user-specific grants (from JwtStrategy)
    if (!(user.permissions as string[])?.includes(permission)) {
      throw new ForbiddenException(`ไม่มีสิทธิ์: ${permission}`);
    }
    return true;
  }
}
