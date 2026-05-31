import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 1;

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  async getSettings() {
    return this.prisma.shopSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  async updateSettings(
    dto: UpdateSettingsDto,
    actorId?: string,
    actorName?: string,
  ) {
    const result = await this.prisma.shopSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'SETTINGS_UPDATED',
      entityType: 'ShopSettings',
      entityId:   String(SETTINGS_ID),
      afterData:  { ...dto },
    });

    await this.notif.notify({
      type:     'SETTINGS_UPDATED',
      title:    'อัพเดทการตั้งค่าร้านค้า',
      message:  `${actorName ?? 'ผู้ดูแลระบบ'} แก้ไขการตั้งค่าระบบ`,
      severity: 'INFO',
    });

    return result;
  }
}
