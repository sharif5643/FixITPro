import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';

// ── Public types ──────────────────────────────────────────────────────────────

export type ReminderType =
  | 'VIP_REPAIR'
  | 'URGENT_REPAIR'
  | 'PARTS_REQUEST_PENDING'
  | 'TRANSFER_PENDING'
  | 'PICKUP_WAITING';

export interface ReminderItem {
  id:         string;
  type:       ReminderType;
  severity:   'CRITICAL' | 'WARNING' | 'INFO';
  title:      string;
  message:    string;
  entityType: 'Repair' | 'StockTransfer';
  entityId:   string;
  actionUrl:  string;
  ageMinutes: number;
  branchId:   string | null;
  branchName: string | null;
  canDismiss: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
const CAT_LIMIT = 10;

// Parts considered stale after this many hours in WAITING_PARTS
const PARTS_STALE_HOURS = 24;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class RemindersService implements OnModuleInit {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly tenantSvc:  TenantService,
    private readonly auditLog:   AuditLogService,
  ) {}

  // Run cleanup shortly after boot, then once per day
  onModuleInit() {
    setTimeout(() => this.purgeExpiredSnoozes(), 15_000);
    setInterval(() => this.purgeExpiredSnoozes(), 24 * 60 * 60_000);
  }

  private async purgeExpiredSnoozes(): Promise<void> {
    try {
      // 1-minute grace period so in-flight requests don't race with cleanup
      const cutoff = new Date(Date.now() - 60_000);
      await this.prisma.reminderSnooze.deleteMany({
        where: { snoozeUntil: { lt: cutoff } },
      });
    } catch { /* non-critical maintenance — swallow silently */ }
  }

  // ── Main query ───────────────────────────────────────────────────────────────

  async getActiveReminders(
    userId:   string,
    tenantId: string | null,
    branchId: string | null,
  ): Promise<{ items: ReminderItem[]; total: number }> {

    // 1. Upsert settings (creates with all defaults on first call for this user)
    const settings = await this.prisma.reminderSettings.upsert({
      where:  { userId },
      create: { userId },
      update: {},
    });
    if (!settings.enabled) return { items: [], total: 0 };

    // 2. Load every active snooze for this user
    const now = new Date();
    const activeSnoozes = await this.prisma.reminderSnooze.findMany({
      where:  { userId, snoozeUntil: { gt: now } },
      select: { entityType: true, entityId: true },
    });
    const snoozedRepairIds   = activeSnoozes.filter(s => s.entityType === 'Repair').map(s => s.entityId);
    const snoozedTransferIds = activeSnoozes.filter(s => s.entityType === 'StockTransfer').map(s => s.entityId);

    // Reusable where fragments
    const branchFilter       = branchId ? { branchId } : {};
    const tenantRepairFilter = tenantId ? { branch: { tenantId } } : {};
    const tenantXferFilter   = tenantId ? { fromBranch: { tenantId } } : {};
    const repairSnoozeFilter = snoozedRepairIds.length   ? { id: { notIn: snoozedRepairIds } }   : {};
    const xferSnoozeFilter   = snoozedTransferIds.length ? { id: { notIn: snoozedTransferIds } } : {};

    const allItems: ReminderItem[] = [];

    // ── [A] VIP_REPAIR ────────────────────────────────────────────────────────
    if (settings.vipRepairEnabled) {
      const rows = await this.prisma.repair.findMany({
        where: {
          status:   { notIn: ['DELIVERED', 'CANCELLED'] as any[] },
          customer: { tags: { hasSome: ['VIP', 'vip'] } },
          ...branchFilter,
          ...tenantRepairFilter,
          ...repairSnoozeFilter,
        } as any,
        include: {
          customer: { select: { name: true } },
          branch:   { select: { name: true } },
        },
        orderBy: { receivedAt: 'asc' },
        take:    CAT_LIMIT,
      });
      for (const r of rows) allItems.push(this.toVipRepairItem(r, now));
    }

    // Build set of VIP entityIds so URGENT_REPAIR can skip duplicates
    const vipRepairIds = new Set(
      allItems.filter(i => i.type === 'VIP_REPAIR').map(i => i.entityId),
    );

    // ── [B] URGENT_REPAIR ─────────────────────────────────────────────────────
    if (settings.urgentRepairEnabled) {
      const rows = await this.prisma.repair.findMany({
        where: {
          OR: [
            { status: 'WAITING_APPROVAL' as any },
            {
              dueDate: { lt: now },
              status:  { notIn: ['DELIVERED', 'CANCELLED'] as any[] },
            },
          ],
          ...branchFilter,
          ...tenantRepairFilter,
          ...repairSnoozeFilter,
        } as any,
        include: {
          customer: { select: { name: true } },
          branch:   { select: { name: true } },
        },
        orderBy: { receivedAt: 'asc' },
        take:    CAT_LIMIT + 10,
      });
      let urgentCount = 0;
      for (const r of rows) {
        if (vipRepairIds.has(r.id)) continue;
        allItems.push(this.toUrgentRepairItem(r, now));
        if (++urgentCount >= CAT_LIMIT) break;
      }
    }

    // ── [C] PARTS_REQUEST_PENDING ─────────────────────────────────────────────
    if (settings.partsRequestEnabled) {
      const cutoff = new Date(now.getTime() - PARTS_STALE_HOURS * 60 * 60_000);
      const rows = await this.prisma.repair.findMany({
        where: {
          status:    'WAITING_PARTS' as any,
          updatedAt: { lt: cutoff },
          ...branchFilter,
          ...tenantRepairFilter,
          ...repairSnoozeFilter,
        } as any,
        include: {
          customer: { select: { name: true } },
          branch:   { select: { name: true } },
          parts: {
            include: { product: { select: { name: true } } },
          },
        },
        orderBy: { updatedAt: 'asc' },
        take:    CAT_LIMIT,
      });
      for (const r of rows) allItems.push(this.toPartsRequestItem(r, now));
    }

    // ── [D] TRANSFER_PENDING ──────────────────────────────────────────────────
    if (settings.transferPendingEnabled) {
      const rows = await this.prisma.stockTransfer.findMany({
        where: {
          status: 'PENDING' as any,
          ...(branchId ? { fromBranchId: branchId } : {}),
          ...tenantXferFilter,
          ...xferSnoozeFilter,
        } as any,
        include: {
          fromBranch: { select: { name: true } },
          toBranch:   { select: { name: true } },
          product:    { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take:    CAT_LIMIT,
      });
      for (const t of rows) allItems.push(this.toTransferPendingItem(t, now));
    }

    // ── [E] PICKUP_WAITING ────────────────────────────────────────────────────
    if (settings.pickupWaitingEnabled) {
      const rows = await this.prisma.repair.findMany({
        where: {
          status: 'COMPLETED' as any,
          ...branchFilter,
          ...tenantRepairFilter,
          ...repairSnoozeFilter,
        } as any,
        include: {
          customer: { select: { name: true } },
          branch:   { select: { name: true } },
        },
        orderBy: { completedAt: 'asc' },
        take:    CAT_LIMIT,
      });
      for (const r of rows) allItems.push(this.toPickupWaitingItem(r, now));
    }

    // Sort: CRITICAL first, then WARNING, then INFO.
    // Within the same severity: oldest item first (largest ageMinutes).
    allItems.sort((a, b) => {
      const sevDiff = (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return b.ageMinutes - a.ageMinutes;
    });

    return { items: allItems, total: allItems.length };
  }

  // ── Snooze ────────────────────────────────────────────────────────────────

  async snooze(
    userId:     string,
    actorName:  string,
    entityType: string,
    entityId:   string,
    minutes:    number,
  ): Promise<{ ok: boolean; snoozeUntil: string }> {
    const snoozeUntil = new Date(Date.now() + minutes * 60_000);

    await this.prisma.reminderSnooze.upsert({
      where:  { userId_entityType_entityId: { userId, entityType, entityId } },
      create: { userId, entityType, entityId, snoozeUntil },
      update: { snoozeUntil },
    });

    await this.auditLog.log({
      actorId:    userId,
      actorName,
      action:     'REMINDER_SNOOZED',
      entityType,
      entityId,
      metadata:   { minutes, snoozeUntil: snoozeUntil.toISOString() },
    });

    return { ok: true, snoozeUntil: snoozeUntil.toISOString() };
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(userId: string) {
    return this.prisma.reminderSettings.upsert({
      where:  { userId },
      create: { userId },
      update: {},
    });
  }

  async updateSettings(
    userId:    string,
    actorName: string,
    dto:       UpdateReminderSettingsDto,
  ) {
    const result = await this.prisma.reminderSettings.upsert({
      where:  { userId },
      create: { userId, ...dto },
      update: dto,
    });

    await this.auditLog.log({
      actorId:    userId,
      actorName,
      action:     'REMINDER_SETTINGS_UPDATED',
      entityType: 'ReminderSettings',
      entityId:   userId,
      afterData:  { ...dto },
    });

    return result;
  }

  // ── Item mappers ─────────────────────────────────────────────────────────

  private toVipRepairItem(r: any, now: Date): ReminderItem {
    const ageMin  = this.ageMinutes(r.receivedAt, now);
    const ageDays = ageMin / 60 / 24;
    const dueDate = r.dueDate ? new Date(r.dueDate) : null;

    let severity: 'CRITICAL' | 'WARNING' | 'INFO';
    if      (dueDate && dueDate < now && ageDays >= 7)                        severity = 'CRITICAL';
    else if (dueDate && dueDate < now)                                        severity = 'WARNING';
    else if (['WAITING_APPROVAL', 'COMPLETED', 'WAITING_PARTS'].includes(r.status)) severity = 'WARNING';
    else if (ageDays >= 7)                                                    severity = 'WARNING';
    else                                                                      severity = 'INFO';

    const customerName = r.customer?.name ?? 'ไม่ระบุลูกค้า';

    return {
      id:         `vip-repair-${r.id}`,
      type:       'VIP_REPAIR',
      severity,
      title:      `VIP: ${customerName} — ${r.ticketNumber}`,
      message:    `${r.deviceBrand} ${r.deviceModel} · ${this.statusLabel(r.status)} · ${this.ageLabel(ageMin)}`,
      entityType: 'Repair',
      entityId:   r.id,
      actionUrl:  `/repairs?highlight=${r.id}`,
      ageMinutes: ageMin,
      branchId:   r.branchId   ?? null,
      branchName: r.branch?.name ?? null,
      canDismiss: severity !== 'CRITICAL',
    };
  }

  private toUrgentRepairItem(r: any, now: Date): ReminderItem {
    const ageMin  = this.ageMinutes(r.receivedAt, now);
    const ageDays = ageMin / 60 / 24;
    const dueDate = r.dueDate ? new Date(r.dueDate) : null;

    const severity: 'CRITICAL' | 'WARNING' =
      (dueDate && dueDate < now && ageDays >= 14) ? 'CRITICAL' : 'WARNING';

    const customerName = r.customer?.name;

    return {
      id:         `urgent-repair-${r.id}`,
      type:       'URGENT_REPAIR',
      severity,
      title:      `งานซ่อมด่วน: ${r.ticketNumber}`,
      message:    `${r.deviceBrand} ${r.deviceModel}${customerName ? ` · ${customerName}` : ''} · ${this.statusLabel(r.status)} · ${this.ageLabel(ageMin)}`,
      entityType: 'Repair',
      entityId:   r.id,
      actionUrl:  `/repairs?highlight=${r.id}`,
      ageMinutes: ageMin,
      branchId:   r.branchId   ?? null,
      branchName: r.branch?.name ?? null,
      canDismiss: severity !== 'CRITICAL',
    };
  }

  private toPartsRequestItem(r: any, now: Date): ReminderItem {
    const ageMin  = this.ageMinutes(r.updatedAt, now);
    const ageDays = ageMin / 60 / 24;

    let severity: 'CRITICAL' | 'WARNING' | 'INFO';
    if      (ageDays >= 3) severity = 'CRITICAL';
    else if (ageDays >= 2) severity = 'WARNING';
    else                   severity = 'INFO';

    const partNames = (r.parts ?? [])
      .map((p: any) => p.product?.name)
      .filter(Boolean)
      .join(', ');

    const customerName = r.customer?.name;

    return {
      id:         `parts-request-${r.id}`,
      type:       'PARTS_REQUEST_PENDING',
      severity,
      title:      `รอชิ้นส่วน: ${r.ticketNumber}`,
      message:    `${r.deviceBrand} ${r.deviceModel}${customerName ? ` · ${customerName}` : ''}${partNames ? ` — ${partNames}` : ''} · ${this.ageLabel(ageMin)}`,
      entityType: 'Repair',
      entityId:   r.id,
      actionUrl:  `/repairs?highlight=${r.id}`,
      ageMinutes: ageMin,
      branchId:   r.branchId   ?? null,
      branchName: r.branch?.name ?? null,
      canDismiss: severity !== 'CRITICAL',
    };
  }

  private toTransferPendingItem(t: any, now: Date): ReminderItem {
    const ageMin  = this.ageMinutes(t.createdAt, now);
    const ageHours = ageMin / 60;
    const severity: 'WARNING' | 'INFO' = ageHours > 24 ? 'WARNING' : 'INFO';

    return {
      id:         `transfer-pending-${t.id}`,
      type:       'TRANSFER_PENDING',
      severity,
      title:      `รอการอนุมัติโอนสต๊อก: ${t.transferNumber}`,
      message:    `${t.product?.name ?? '?'} × ${t.quantity} — ${t.toBranch?.name ?? '?'} ขอมา · ${this.ageLabel(ageMin)}`,
      entityType: 'StockTransfer',
      entityId:   t.id,
      actionUrl:  `/transfers?highlight=${t.id}`,
      ageMinutes: ageMin,
      branchId:   t.fromBranchId   ?? null,
      branchName: t.fromBranch?.name ?? null,
      canDismiss: true, // TRANSFER_PENDING max severity is WARNING
    };
  }

  private toPickupWaitingItem(r: any, now: Date): ReminderItem {
    const baseDate = r.completedAt ?? r.updatedAt;
    const ageMin   = this.ageMinutes(baseDate, now);
    const ageHours = ageMin / 60;
    const severity: 'WARNING' | 'INFO' = ageHours >= 72 ? 'WARNING' : 'INFO';

    const customerName = r.customer?.name ?? 'ไม่ระบุลูกค้า';

    return {
      id:         `pickup-waiting-${r.id}`,
      type:       'PICKUP_WAITING',
      severity,
      title:      `รอรับเครื่อง: ${r.ticketNumber}`,
      message:    `${r.deviceBrand} ${r.deviceModel} · ${customerName} · ซ่อมเสร็จแล้ว ${this.ageLabel(ageMin)}`,
      entityType: 'Repair',
      entityId:   r.id,
      actionUrl:  `/repairs?highlight=${r.id}`,
      ageMinutes: ageMin,
      branchId:   r.branchId   ?? null,
      branchName: r.branch?.name ?? null,
      canDismiss: true, // PICKUP_WAITING max severity is WARNING
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private ageMinutes(date: Date | string | null | undefined, now: Date): number {
    if (!date) return 0;
    return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60_000));
  }

  private ageLabel(minutes: number): string {
    if (minutes < 60)  return `${minutes} นาทีที่แล้ว`;
    const hours = Math.floor(minutes / 60);
    if (hours  < 24)   return `${hours} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hours / 24);
    return `${days} วันที่แล้ว`;
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      RECEIVED:         'รับเข้าซ่อม',
      DIAGNOSING:       'กำลังวินิจฉัย',
      WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
      APPROVED:         'ลูกค้าอนุมัติแล้ว',
      WAITING_PARTS:    'รอชิ้นส่วน',
      IN_PROGRESS:      'กำลังซ่อม',
      COMPLETED:        'ซ่อมเสร็จแล้ว',
      DELIVERED:        'ส่งมอบแล้ว',
      CANCELLED:        'ยกเลิก',
    };
    return map[status] ?? status;
  }
}
