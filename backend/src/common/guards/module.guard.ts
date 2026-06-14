import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { ModulesService } from '../../modules/modules.service';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private modulesService: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!moduleKey) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role === 'SUPER_ADMIN') return true;

    const enabled = await this.modulesService.getEnabledModules(user.tenantId ?? null);
    if (!enabled.includes(moduleKey)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MODULE_NOT_ENABLED',
        moduleKey,
        message: `โมดูล '${moduleKey}' ไม่รวมอยู่ในแพ็กเกจของท่าน`,
      });
    }
    return true;
  }
}
