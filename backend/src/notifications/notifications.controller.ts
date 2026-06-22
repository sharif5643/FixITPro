import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  getUnreadCount(
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.getUnreadCount(tenantId, branchId, role);
  }

  @Get()
  findAll(
    @Query()                 query: Record<string, string>,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.findAll(query, tenantId, branchId, role);
  }

  @RequirePermission('notification.manage')
  @Patch('read-all')
  markAllRead(
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.markAllRead(tenantId, branchId, role);
  }

  @RequirePermission('notification.view')
  @Patch(':id/read')
  markRead(
    @Param('id')             id: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.markRead(id, tenantId, branchId, role);
  }
}
