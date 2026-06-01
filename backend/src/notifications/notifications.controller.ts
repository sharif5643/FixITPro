import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  getUnreadCount(
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.getUnreadCount(branchId, role);
  }

  @Get()
  findAll(
    @Query() query: Record<string, string>,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.findAll(query, branchId, role);
  }

  @RequirePermission('notification.manage')
  @Patch('read-all')
  markAllRead(
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.markAllRead(branchId, role);
  }

  @RequirePermission('notification.view')
  @Patch(':id/read')
  markRead(
    @Param('id')             id: string,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.notificationsService.markRead(id, branchId, role);
  }
}
