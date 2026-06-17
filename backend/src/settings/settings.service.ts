import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private prisma:    PrismaService,
    private tenantSvc: TenantService,
    private auditLog:  AuditLogService,
    private notif:     NotificationsService,
  ) {}

  // Full settings — used by the settings management page.
  // SUPER_ADMIN (tenantId=null) gets an in-memory default; they don't own a shop.
  async getSettings(tenantId: string | null) {
    if (!tenantId) return this.defaultSettings();
    return this.prisma.shopSettings.upsert({
      where:  { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  // Lightweight read used by sidebar / navbar (no permission gate needed).
  async getShopInfo(tenantId: string | null) {
    if (!tenantId) return { shopName: 'FixITPro', logoUrl: null };
    const row = await this.prisma.shopSettings.findUnique({
      where:  { tenantId },
      select: { shopName: true, logoUrl: true },
    });
    return { shopName: row?.shopName ?? 'FixITPro', logoUrl: row?.logoUrl ?? null };
  }

  async updateSettings(
    dto:       UpdateSettingsDto,
    tenantId:  string | null,
    actorId?:  string,
    actorName?: string,
  ) {
    if (!tenantId) {
      // SUPER_ADMIN has no tenant — nothing to persist
      return this.defaultSettings();
    }

    const result = await this.prisma.shopSettings.upsert({
      where:  { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'SETTINGS_UPDATED',
      entityType: 'ShopSettings',
      entityId:   String(result.id),
      afterData:  { ...dto },
    });

    await this.notif.notify({
      type:     'SETTINGS_UPDATED',
      title:    'อัพเดทการตั้งค่าร้านค้า',
      message:  `${actorName ?? 'ผู้ดูแลระบบ'} แก้ไขการตั้งค่าระบบ`,
      severity: 'INFO',
      tenantId,
    });

    return result;
  }

  private defaultSettings() {
    return {
      id: 0,
      shopName:           'FixITPro',
      shopSubtitle:       null,
      shopPhone:          null,
      shopAddress:        null,
      shopEmail:          null,
      taxId:              null,
      logoUrl:            null,
      receiptFooter:      null,
      paperWidth:         '80mm',
      vatPercent:         0,
      defaultDeposit:     0,
      autoGenerateSku:    true,
      autoGenerateBarcode: false,
      autoPrint:          false,
      lowStockAlert:      5,
      repairWarrantyText: null,
      paymentQrUrl:       null,
      showTaxId:          true,
      showLogo:           true,
      tenantId:           null,
    };
  }
}
