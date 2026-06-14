import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    const shop = await this.prisma.shopSettings.findFirst({ where: { id: 1 } });

    return {
      platform: {
        name: 'FixITPro',
        version: 'v2.0.0',
        environment: (process.env.NODE_ENV ?? 'development').trim(),
        timezone: 'Asia/Bangkok (UTC+7)',
        language: 'Thai (TH)',
      },
      security: {
        jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
        cookieMode: 'HttpOnly (CHB-01)',
        cookieSameSite: process.env.COOKIE_SAMESITE ?? 'lax',
        cookieSecure: process.env.COOKIE_SECURE === 'true',
        corsOrigins: process.env.CORS_ORIGIN?.trim() || 'ใช้ค่าเริ่มต้นของระบบ',
      },
      database: {
        provider: 'PostgreSQL',
        orm: 'Prisma 5.x',
        host: process.env.DB_HOST ?? 'localhost',
        name: process.env.DB_NAME ?? 'fixitpro',
      },
      shop: shop
        ? {
            shopName: shop.shopName,
            shopSubtitle: shop.shopSubtitle ?? null,
            shopPhone: shop.shopPhone ?? null,
            shopEmail: shop.shopEmail ?? null,
            shopAddress: shop.shopAddress ?? null,
            taxId: shop.taxId ?? null,
            receiptFooter: shop.receiptFooter ?? null,
            paperWidth: shop.paperWidth,
            paymentQrUrl: shop.paymentQrUrl ?? null,
            vatPercent: Number(shop.vatPercent),
            defaultDeposit: Number(shop.defaultDeposit),
            lowStockAlert: shop.lowStockAlert,
            autoGenerateSku: shop.autoGenerateSku,
            autoGenerateBarcode: shop.autoGenerateBarcode,
            autoPrint: shop.autoPrint,
            showTaxId: shop.showTaxId,
            showLogo: shop.showLogo,
          }
        : null,
    };
  }

  async updateSettings(dto: UpdateSettingsDto) {
    await this.prisma.shopSettings.upsert({
      where: { id: 1 },
      update: { ...dto },
      create: { id: 1, shopName: dto.shopName ?? 'FixITPro', ...dto },
    });
    return this.getSettings();
  }
}
