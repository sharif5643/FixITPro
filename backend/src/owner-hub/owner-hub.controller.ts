import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OwnerHubService } from './owner-hub.service';

class DailySummaryDto {
  @IsBoolean()
  on!: boolean;
}

/** The owner hub: the shop's owner only, and only when the super admin switched it on */
@Controller('owner-hub')
@UseGuards(JwtAuthGuard, TenantActiveGuard, RolesGuard)
@Roles('OWNER')
export class OwnerHubController {
  constructor(private hub: OwnerHubService) {}

  @Get('today')
  async today(@CurrentUser('tenantId') tenantId: string, @Query('branchId') branchId?: string) {
    await this.hub.assertEnabled(tenantId);
    return this.hub.today(tenantId, branchId || undefined);
  }

  @Get('line')
  async line(@CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string) {
    await this.hub.assertEnabled(tenantId);
    return { ...(await this.hub.lineSettings(userId)), preview: await this.hub.previewText(tenantId) };
  }

  @Put('line/daily')
  async setDaily(@CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string, @Body() dto: DailySummaryDto) {
    await this.hub.assertEnabled(tenantId);
    return this.hub.setDailySummary(userId, dto.on);
  }

  @Post('line/test')
  async sendTest(@CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string) {
    await this.hub.assertEnabled(tenantId);
    return this.hub.sendToMe(userId, tenantId);
  }
}
