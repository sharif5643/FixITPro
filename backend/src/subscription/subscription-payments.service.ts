import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../database/prisma.service';
import { uploadsBaseDir } from '../common/storage-paths';

/** Plans a shop can pick itself on the renewal page; others (TRIAL, PRIVATE…) renew their own plan only. */
export const SELF_RENEW_PLANS = ['LITE', 'PRO', 'BUSINESS'] as const;

/** Lengths a shop can pay for. The discount is what the renewal page has always offered. */
export const RENEW_TERMS = [
  { months: 1,  days: 30,  discountPct: 0 },
  { months: 3,  days: 90,  discountPct: 5 },
  { months: 6,  days: 180, discountPct: 10 },
  { months: 12, days: 365, discountPct: 20 },
] as const;

export const SLIP_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
};
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;

/**
 * A shop sends its own renewal: plan, length, amount transferred and the slip. It becomes
 * a PENDING TenantPayment, the same record the Super Admin already verifies and activates;
 * nothing about the shop changes until the Super Admin does that.
 */
@Injectable()
export class SubscriptionPaymentsService {
  private readonly logger = new Logger(SubscriptionPaymentsService.name);

  constructor(private prisma: PrismaService) {}

  private async plansFor(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }, select: { plan: true, shopName: true, expiryDate: true, status: true },
    });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    const keys = new Set<string>(SELF_RENEW_PLANS);
    if (tenant.plan !== 'TRIAL') keys.add(tenant.plan);
    const packages = await this.prisma.package.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, name: true, description: true, price: true, isActive: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    const plans = [...keys]
      .map((key) => {
        const p = packages.find((x) => x.key === key);
        // A plan the Super Admin switched off is not offered, except the one the shop is on
        if (p && !p.isActive && key !== tenant.plan) return null;
        return {
          key,
          name:        p?.name ?? key,
          description: p?.description ?? null,
          monthlyPrice: p?.price != null ? Number(p.price) : null,
          current:     key === tenant.plan,
          sortOrder:   p?.sortOrder ?? 999,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { tenant, plans };
  }

  async options(tenantId: string) {
    const { tenant, plans } = await this.plansFor(tenantId);
    const pending = await this.prisma.tenantPayment.findFirst({
      where: { tenantId, status: 'PENDING' }, select: { id: true }, orderBy: { createdAt: 'desc' },
    });
    // Where to pay: the platform's own settings row, set by the Super Admin
    const platform = await this.prisma.shopSettings.findFirst({
      where: { tenantId: null }, orderBy: { id: 'asc' },
      select: { promptpayId: true, renewalBankInfo: true, shopName: true, shopPhone: true },
    });
    return {
      payTo: {
        promptpayId: platform?.promptpayId?.trim() || null,
        bankInfo:    platform?.renewalBankInfo?.trim() || null,
        contactPhone: platform?.shopPhone?.trim() || null,
      },
      shopName:   tenant.shopName,
      plan:       tenant.plan,
      status:     tenant.status,
      expiryDate: tenant.expiryDate?.toISOString() ?? null,
      plans:      plans.map(({ sortOrder: _s, ...p }) => p),
      terms:      RENEW_TERMS,
      hasPending: !!pending,
    };
  }

  async list(tenantId: string) {
    const rows = await this.prisma.tenantPayment.findMany({
      where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10,
      select: {
        id: true, plan: true, duration: true, paymentAmount: true, paymentDate: true, status: true,
        adminNote: true, activatedAt: true, createdAt: true, slipUrl: true,
      },
    });
    return rows.map((r) => ({ ...r, paymentAmount: r.paymentAmount != null ? Number(r.paymentAmount) : null }));
  }

  async submit(
    tenantId: string,
    userId: string,
    dto: { plan: string; months: number; amount: number; reference?: string; note?: string },
    slip: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ) {
    if (!slip) throw new BadRequestException('กรุณาแนบสลิปการโอนเงิน');
    const ext = SLIP_MIME_TO_EXT[slip.mimetype];
    if (!ext) throw new BadRequestException('สลิปต้องเป็นรูปภาพ (jpg, png, webp)');
    if (slip.size > SLIP_MAX_BYTES) throw new BadRequestException('ไฟล์สลิปใหญ่เกิน 5 MB');

    const term = RENEW_TERMS.find((t) => t.months === dto.months);
    if (!term) throw new BadRequestException('ระยะเวลาไม่ถูกต้อง');
    const { plans } = await this.plansFor(tenantId);
    if (!plans.some((p) => p.key === dto.plan)) throw new BadRequestException('แพ็กเกจนี้ต่ออายุเองไม่ได้ กรุณาติดต่อผู้ดูแลระบบ');

    const pending = await this.prisma.tenantPayment.findFirst({ where: { tenantId, status: 'PENDING' }, select: { id: true } });
    if (pending) throw new ConflictException('มีรายการชำระเงินรอตรวจสอบอยู่แล้ว กรุณารอทีมงานตรวจสอบก่อน');

    const dir = join(uploadsBaseDir, tenantId, 'slips');
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), slip.buffer);

    const payment = await this.prisma.tenantPayment.create({
      data: {
        tenantId,
        plan:             dto.plan as any,
        duration:         term.days,
        paymentAmount:    dto.amount,
        paymentDate:      new Date(),
        paymentReference: dto.reference?.trim() || null,
        paymentNote:      ['ร้านส่งสลิปเองจากหน้าต่ออายุ', `${term.months} เดือน`, dto.note?.trim()].filter(Boolean).join(' · '),
        slipUrl:          `/api/v1/files/${tenantId}/slips/${filename}`,
        submittedById:    userId,
      },
      select: { id: true, plan: true, duration: true, paymentAmount: true, status: true, createdAt: true },
    });
    this.logger.log(`Renewal payment sent by shop: ${payment.id} tenant=${tenantId} plan=${dto.plan} ${term.days}d ฿${dto.amount}`);
    return { ...payment, paymentAmount: Number(payment.paymentAmount) };
  }
}
