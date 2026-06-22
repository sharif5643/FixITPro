import {
  Controller, Get, Post, Patch,
  Body, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard }      from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard }   from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser }       from '../common/decorators/current-user.decorator';
import { RemindersService }  from './reminders.service';
import { SnoozeReminderDto }           from './dto/snooze-reminder.dto';
import { UpdateReminderSettingsDto }   from './dto/update-reminder-settings.dto';

@Controller('reminders')
@UseGuards(JwtAuthGuard, TenantActiveGuard)
export class RemindersController {
  constructor(private readonly svc: RemindersService) {}

  /**
   * Returns active reminders for the requesting user.
   * - Non-OWNER: scoped to their JWT branchId (cannot override).
   * - OWNER/SUPER_ADMIN default: all branches (or specific via ?branchId=).
   * - OWNER/SUPER_ADMIN with ?scope=branch: scoped to their own JWT branchId.
   */
  @Get('active')
  @UseGuards(PermissionGuard)
  @RequirePermission('notification.view')
  getActiveReminders(
    @CurrentUser('id')       userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     role: string,
    @Query('branchId')       queryBranchId?: string,
    @Query('scope')          scope?: string,
  ) {
    const isPrivileged = role === 'OWNER' || role === 'SUPER_ADMIN';
    let effectiveBranchId: string | null;
    if (!isPrivileged) {
      effectiveBranchId = userBranchId ?? null;
    } else if (scope === 'branch') {
      effectiveBranchId = queryBranchId ?? userBranchId ?? null;
    } else {
      effectiveBranchId = queryBranchId ?? null;
    }
    return this.svc.getActiveReminders(userId, tenantId, effectiveBranchId);
  }

  /**
   * Snooze one reminder for 5, 15, or 30 minutes.
   * Persisted server-side so it survives page refreshes.
   * Writes REMINDER_SNOOZED audit log entry.
   */
  @Post('snooze')
  @UseGuards(PermissionGuard)
  @RequirePermission('notification.view')
  snooze(
    @CurrentUser('id')   userId: string,
    @CurrentUser('name') actorName: string,
    @Body() dto: SnoozeReminderDto,
  ) {
    return this.svc.snooze(userId, actorName, dto.entityType, dto.entityId, dto.minutes);
  }

  /**
   * Returns this user's reminder preferences.
   * Creates a row with all defaults on first access (upsert).
   * No permission gate — every authenticated user owns their own settings.
   */
  @Get('settings')
  getSettings(@CurrentUser('id') userId: string) {
    return this.svc.getSettings(userId);
  }

  /**
   * Updates this user's reminder preferences.
   * Writes REMINDER_SETTINGS_UPDATED audit log entry.
   * No permission gate — every authenticated user owns their own settings.
   */
  @Patch('settings')
  updateSettings(
    @CurrentUser('id')   userId: string,
    @CurrentUser('name') actorName: string,
    @Body() dto: UpdateReminderSettingsDto,
  ) {
    return this.svc.updateSettings(userId, actorName, dto);
  }
}
