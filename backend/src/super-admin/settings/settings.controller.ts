import { Controller, Get, Patch, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { SuperAdminAuditInterceptor } from '../super-admin-audit.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto, UpdatePlatformKeysDto } from './dto/update-settings.dto';
import { PlatformSecretsService } from '../../platform-secrets/platform-secrets.service';
import { siteOrigin } from '../../line-messaging/line-central';

@Controller('super-admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@UseInterceptors(SuperAdminAuditInterceptor)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly keys: PlatformSecretsService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  /** FixITPro's LINE account and AI key: which are set (never the values) and the webhook URL. */
  @Get('platform-keys')
  platformKeys() {
    return { keys: this.keys.status(), webhookUrl: `${siteOrigin()}/api/v1/public/line/webhook` };
  }

  @Patch('platform-keys')
  async savePlatformKeys(@Body() dto: UpdatePlatformKeysDto) {
    return { keys: await this.keys.save(dto), webhookUrl: `${siteOrigin()}/api/v1/public/line/webhook` };
  }
}
