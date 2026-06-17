import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  // Lightweight endpoint: only shopName + logoUrl.
  // Used by sidebar/navbar — no settings.manage permission required.
  @Get('shop')
  getShopInfo(@CurrentUser('tenantId') tenantId: string | null) {
    return this.settingsService.getShopInfo(tenantId);
  }

  @Get()
  getSettings(@CurrentUser('tenantId') tenantId: string | null) {
    return this.settingsService.getSettings(tenantId);
  }

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('settings.manage')
  updateSettings(
    @Body()                  dto: UpdateSettingsDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.settingsService.updateSettings(dto, tenantId, actorId, actorName);
  }
}
