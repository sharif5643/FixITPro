import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { ModulesService } from '../../modules/modules.service';

/**
 * Lets a request through only when the shop has the module (any one, when several are named): its
 * package, plus what the super admin switched on, minus what the super admin switched off. This holds
 * for the owner too — a shop sold only some modules gets only those. The super admin is not checked.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private modulesService: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const raw = this.reflector.getAllAndOverride<string | string[]>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const keys = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
    if (keys.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role === 'SUPER_ADMIN') return true;

    const enabled = await this.modulesService.getModulesFor(user.role, user.tenantId ?? null);
    if (!keys.some((k) => enabled.includes(k))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MODULE_NOT_ENABLED',
        moduleKey: keys[0],
        message: `โมดูล '${keys[0]}' ไม่ได้เปิดให้ร้านของท่าน`,
      });
    }
    return true;
  }
}
