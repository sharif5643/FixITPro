import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Prisma } from '@prisma/client';

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
    const result = await this.prisma.shopSettings.upsert({
      where:  { tenantId },
      create: { tenantId },
      update: {},
    });
    // Mask LINE token — never expose the raw token to the frontend
    if ((result as any).lineChannelAccessToken) {
      const raw: string = (result as any).lineChannelAccessToken;
      (result as any).lineChannelAccessToken = `****${raw.slice(-6)}`;
    }
    return result;
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

    // If the frontend echoes back a masked token (starts with ****), skip updating it
    const updateData = { ...dto };
    if (updateData.lineChannelAccessToken?.startsWith('****')) {
      delete updateData.lineChannelAccessToken;
    }
    // Treat empty string as "clear token"
    if (updateData.lineChannelAccessToken === '') {
      updateData.lineChannelAccessToken = undefined;
    }

    const result = await this.prisma.shopSettings.upsert({
      where:  { tenantId },
      create: { tenantId, ...updateData },
      update: updateData,
    });

    // Mask token in response — same rule as getSettings
    if ((result as any).lineChannelAccessToken) {
      const raw: string = (result as any).lineChannelAccessToken;
      (result as any).lineChannelAccessToken = `****${raw.slice(-6)}`;
    }

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'SETTINGS_UPDATED',
      entityType: 'ShopSettings',
      entityId:   String(result.id),
      afterData:  { ...updateData, lineChannelAccessToken: updateData.lineChannelAccessToken ? '****' : undefined },
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

  async resetTenantData(tenantId: string): Promise<void> {
    // Collect anchor IDs before the transaction to scope all deletes to this tenant only.
    const branchIds = (await this.prisma.branch.findMany({
      where: { tenantId }, select: { id: true },
    })).map(b => b.id);

    const userIds = (await this.prisma.user.findMany({
      where: { tenantId }, select: { id: true },
    })).map(u => u.id);

    const productIds = (await this.prisma.product.findMany({
      where: { tenantId }, select: { id: true },
    })).map(p => p.id);

    const customerIds = (await this.prisma.customer.findMany({
      where: { tenantId }, select: { id: true },
    })).map(c => c.id);

    await this.prisma.$transaction(async (tx) => {
      // Sub-IDs
      const repairIds = branchIds.length
        ? (await tx.repair.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })).map(r => r.id)
        : [];

      const saleIds = branchIds.length
        ? (await tx.sale.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })).map(s => s.id)
        : [];

      const sessionIds = (await tx.cashDrawerSession.findMany({
        where: { tenantId }, select: { id: true },
      })).map(s => s.id);

      const poIds = (await tx.purchaseOrder.findMany({
        where: { supplier: { tenantId } }, select: { id: true },
      })).map(p => p.id);

      const claimOrConditions: Prisma.ClaimWhereInput[] = [];
      if (customerIds.length) claimOrConditions.push({ customerId: { in: customerIds } });
      if (repairIds.length)   claimOrConditions.push({ repairId:   { in: repairIds   } });
      const claimIds = claimOrConditions.length
        ? (await tx.claim.findMany({ where: { OR: claimOrConditions }, select: { id: true } })).map(c => c.id)
        : [];

      const refundIds = saleIds.length
        ? (await tx.saleRefund.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map(r => r.id)
        : [];

      // 1. Repair leaf tables (repairAdditionalPayment has shiftId — must go before Shift)
      if (repairIds.length) {
        await tx.repairReview.deleteMany({ where: { repairId: { in: repairIds } } });
        await tx.repairQc.deleteMany({ where: { repairId: { in: repairIds } } });
        await tx.repairMessage.deleteMany({ where: { repairId: { in: repairIds } } });
        await tx.repairImage.deleteMany({ where: { repairId: { in: repairIds } } });
        await tx.repairAdditionalPayment.deleteMany({ where: { repairId: { in: repairIds } } });
        await tx.repairPaymentReversal.deleteMany({ where: { repairId: { in: repairIds } } });
      }

      // 2. Claim history
      if (claimIds.length) {
        await tx.claimStatusHistory.deleteMany({ where: { claimId: { in: claimIds } } });
      }

      // 3. Sale refund items
      if (refundIds.length) {
        await tx.saleRefundItem.deleteMany({ where: { refundId: { in: refundIds } } });
      }

      // 4. Customer notes
      if (customerIds.length) {
        await tx.customerNote.deleteMany({ where: { customerId: { in: customerIds } } });
      }

      // 5. Cash drawer leaves
      if (sessionIds.length) {
        await tx.cashDrawerParticipant.deleteMany({ where: { sessionId: { in: sessionIds } } });
      }
      await tx.cashDrawerTransaction.deleteMany({ where: { tenantId } });

      // 6. User-linked leaves + notifications (packageSale.shiftId / walletMovement.shiftId — before Shift)
      if (userIds.length) {
        await tx.reminderSnooze.deleteMany({ where: { userId: { in: userIds } } });
        await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.packageSale.deleteMany({ where: { createdById: { in: userIds } } });
        await tx.carrierWalletMovement.deleteMany({ where: { createdById: { in: userIds } } });
      }
      await tx.notification.deleteMany({ where: { tenantId } });

      // 7. Claims and warranties (warranty.serialNumberId → must go before serialNumber)
      if (claimIds.length) {
        await tx.claim.deleteMany({ where: { id: { in: claimIds } } });
      }
      const warrantyOr: Prisma.WarrantyWhereInput[] = [];
      if (customerIds.length) warrantyOr.push({ customerId: { in: customerIds } });
      if (repairIds.length)   warrantyOr.push({ repairId:   { in: repairIds   } });
      if (warrantyOr.length) {
        await tx.warranty.deleteMany({ where: { OR: warrantyOr } });
      }

      // 8. Sale refunds
      if (refundIds.length) {
        await tx.saleRefund.deleteMany({ where: { id: { in: refundIds } } });
      }

      // 9. Stock movements — before repairPart (stockMovement.repairPartId) and before saleItem (stockMovement.saleItemId)
      if (productIds.length) {
        await tx.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
      }

      // 10. Serial numbers — before saleItem and purchaseOrderItem
      if (productIds.length) {
        await tx.serialNumber.deleteMany({ where: { productId: { in: productIds } } });
      }

      // 11. Repair parts — before repair
      if (repairIds.length) {
        await tx.repairPart.deleteMany({ where: { repairId: { in: repairIds } } });
      }

      // 12. Sale items — before sale
      if (saleIds.length) {
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      }

      // 13. PO sub-tables — before purchaseOrder
      if (poIds.length) {
        await tx.supplierPayment.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
      }

      // 14. Cash drawer sessions
      await tx.cashDrawerSession.deleteMany({ where: { tenantId } });

      // 15. Stock transfers
      if (branchIds.length) {
        await tx.stockTransfer.deleteMany({
          where: { OR: [{ fromBranchId: { in: branchIds } }, { toBranchId: { in: branchIds } }] },
        });
      }

      // 16-19. Main entities: repair/sale/expense must go before shift (they have shiftId FK)
      if (repairIds.length) {
        await tx.repair.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      if (saleIds.length) {
        await tx.sale.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      if (branchIds.length) {
        await tx.expense.deleteMany({ where: { branchId: { in: branchIds } } });
        await tx.shift.deleteMany({ where: { branchId: { in: branchIds } } });
        await tx.branchStock.deleteMany({ where: { branchId: { in: branchIds } } });
      }
      if (poIds.length) {
        await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
      }

      // 20. Catalog
      await tx.customer.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.supplier.deleteMany({ where: { tenantId } });
      await tx.expenseCategory.deleteMany({ where: { tenantId } });

      // 21. Reset carrier wallet balance (global table — clear and reset to zero)
      await tx.carrierWallet.updateMany({ data: { balance: 0 } });

    }, { timeout: 120_000 });

    await this.auditLog.log({
      action:     'TENANT_DATA_RESET',
      entityType: 'Tenant',
      entityId:   tenantId,
      afterData:  { reset: true, resetAt: new Date().toISOString() },
    });
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
