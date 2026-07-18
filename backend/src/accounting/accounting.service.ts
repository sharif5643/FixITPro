import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CashDrawerPolicy, CashDrawerSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// ── Source types ──────────────────────────────────────────────────────────────
// Stored in the structured `sourceType` column (and kept in metadata for legacy).
// CashDrawerTransactionType DB enum: OPENING | DEPOSIT | WITHDRAWAL | BANK_DEPOSIT | REVERSAL.

export const ACCOUNTING_SOURCE = {
  OPENING:                   'OPENING',
  SALE_PAYMENT:              'SALE_PAYMENT',
  SALE_REFUND:               'SALE_REFUND',
  REPAIR_DEPOSIT:            'REPAIR_DEPOSIT',         // not yet wired — deposit DTO has no paymentMethod
  REPAIR_FINAL_PAYMENT:      'REPAIR_FINAL_PAYMENT',
  REPAIR_ADDITIONAL_PAYMENT: 'REPAIR_ADDITIONAL_PAYMENT',
  EXPENSE_PAYMENT:           'EXPENSE_PAYMENT',
  CASH_WITHDRAWAL:           'CASH_WITHDRAWAL',
  CASH_DEPOSIT:              'CASH_DEPOSIT',
  BANK_DEPOSIT:              'BANK_DEPOSIT',
  REVERSAL:                  'REVERSAL',
  MANUAL:                    'MANUAL',
} as const;

export type AccountingSource = (typeof ACCOUNTING_SOURCE)[keyof typeof ACCOUNTING_SOURCE];

// Extended payment methods — superset of the DB PaymentMethod enum.
// Only CASH triggers a CashDrawerTransaction write.
export type PaymentMethodExt = 'CASH' | 'QR' | 'BANK' | 'TRANSFER' | 'CREDIT' | 'CARD';

export interface AccountingEntry {
  sourceType:    AccountingSource;
  sourceId:      string;           // ID of the business record (Sale / Repair / Expense …)
  paymentMethod: PaymentMethodExt;
  amount:        number | Prisma.Decimal;
  direction:     'IN' | 'OUT';
  branchId:      string;
  tenantId:      string | null;
  actorUserId:   string;
  note?:         string;
  reversalOfId?: string;
}

type TxClient = Prisma.TransactionClient;

// Maps source type to the DB CashDrawerTransactionType enum value
const SOURCE_TO_DB_TYPE: Record<
  AccountingSource,
  'OPENING' | 'DEPOSIT' | 'WITHDRAWAL' | 'BANK_DEPOSIT' | 'REVERSAL'
> = {
  OPENING:                   'OPENING',
  SALE_PAYMENT:              'DEPOSIT',
  SALE_REFUND:               'WITHDRAWAL',
  REPAIR_DEPOSIT:            'DEPOSIT',
  REPAIR_FINAL_PAYMENT:      'DEPOSIT',
  REPAIR_ADDITIONAL_PAYMENT: 'DEPOSIT',
  EXPENSE_PAYMENT:           'WITHDRAWAL',
  CASH_WITHDRAWAL:           'WITHDRAWAL',
  CASH_DEPOSIT:              'DEPOSIT',
  BANK_DEPOSIT:              'BANK_DEPOSIT',
  REVERSAL:                  'REVERSAL',
  MANUAL:                    'DEPOSIT',
};

const SOURCE_TO_REASON: Record<AccountingSource, string> = {
  OPENING:                   'เงินตั้งต้นเปิดรอบ',
  SALE_PAYMENT:              'ยอดขายเงินสด',
  SALE_REFUND:               'คืนเงิน',
  REPAIR_DEPOSIT:            'มัดจำงานซ่อม',
  REPAIR_FINAL_PAYMENT:      'ค่าซ่อม',
  REPAIR_ADDITIONAL_PAYMENT: 'ค่าบริการเพิ่มเติม',
  EXPENSE_PAYMENT:           'ค่าใช้จ่าย',
  CASH_WITHDRAWAL:           'เบิกเงิน',
  CASH_DEPOSIT:              'เติมเงิน',
  BANK_DEPOSIT:              'ฝากธนาคาร',
  REVERSAL:                  'ยกเลิกรายการ',
  MANUAL:                    'รายการเงินสด',
};

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Record a financial event in the Cash Drawer ledger.
   *
   * - Non-CASH payment methods: no-op (returns null), no DB touch.
   * - CASH + STRICT policy + no open session: throws BadRequestException (rolls back caller's tx).
   * - CASH + ALLOW_UNASSIGNED + no open session: creates unassigned ledger entry (sessionId=null)
   *   outside the caller's transaction so the business record is never rolled back.
   * - CASH + open session: creates ledger entry within the caller's `tx` (atomic).
   * - Duplicate idempotencyKey: returns existing record (safe under concurrent requests).
   *
   * Pass `tx` when calling from inside a `$transaction` so the ledger write is atomic
   * with the business record.
   */
  async record(
    entry: AccountingEntry,
    tx?: TxClient,
  ): Promise<Prisma.CashDrawerTransactionGetPayload<object> | null> {
    if (entry.paymentMethod !== 'CASH') return null;

    const client = tx ?? this.prisma;

    // Stable idempotency key: tenant:sourceType:sourceId:direction
    const idempotencyKey = [
      entry.tenantId ?? 'global',
      entry.sourceType,
      entry.sourceId,
      entry.direction,
    ].join(':');

    // Fast idempotency check — unique index on idempotencyKey
    const existing = await (client as any).cashDrawerTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`Accounting.record: idempotent hit key=${idempotencyKey}`);
      return existing;
    }

    // Read branch policy (STRICT is the default if branch not found)
    const branch = await (client as any).branch.findUnique({
      where:  { id: entry.branchId },
      select: { cashDrawerPolicy: true },
    });
    const policy: CashDrawerPolicy = branch?.cashDrawerPolicy ?? CashDrawerPolicy.STRICT;

    // Find the open session for this branch
    const session = await (client as any).cashDrawerSession.findFirst({
      where: {
        branchId: entry.branchId,
        tenantId: entry.tenantId ?? undefined,
        status:   CashDrawerSessionStatus.OPEN,
      },
      select: { id: true, cashDrawerId: true },
    });

    if (!session) {
      if (policy === CashDrawerPolicy.STRICT) {
        throw new BadRequestException('CASH_DRAWER_SESSION_REQUIRED');
      }
      // ALLOW_UNASSIGNED: record outside caller's tx so the business record succeeds
      return this.createUnassignedEntry(entry, idempotencyKey);
    }

    // Session found — write within caller's transaction (atomic with business record)
    return this.createSessionEntry(client, entry, session, idempotencyKey);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildEntryData(
    entry: AccountingEntry,
    idempotencyKey: string,
    sessionId: string | null,
    cashDrawerId: string | null,
  ) {
    const dbType = SOURCE_TO_DB_TYPE[entry.sourceType];
    const reason = SOURCE_TO_REASON[entry.sourceType] + (entry.note ? ` — ${entry.note}` : '');
    const amount = entry.amount instanceof Prisma.Decimal
      ? entry.amount
      : new Prisma.Decimal(entry.amount);

    return {
      sessionId,
      cashDrawerId,
      tenantId:      entry.tenantId ?? undefined,
      branchId:      entry.branchId,
      actorUserId:   entry.actorUserId,
      type:          dbType,
      direction:     entry.direction,
      amount,
      reason,
      sourceType:    entry.sourceType,
      referenceType: entry.sourceType,
      referenceId:   entry.sourceId,
      paymentMethod: 'CASH',
      idempotencyKey,
      metadata:      { sourceType: entry.sourceType, sourceId: entry.sourceId },
      ...(entry.reversalOfId ? { reversalOfId: entry.reversalOfId } : {}),
    };
  }

  /** Write ledger entry inside the caller's transaction (session must exist). */
  private async createSessionEntry(
    client: any,
    entry: AccountingEntry,
    session: { id: string; cashDrawerId: string },
    idempotencyKey: string,
  ) {
    const data = this.buildEntryData(entry, idempotencyKey, session.id, session.cashDrawerId);
    try {
      return await client.cashDrawerTransaction.create({ data });
    } catch (err: any) {
      // Concurrent duplicate: another request committed the same key first
      if (err?.code === 'P2002') {
        const raceExisting = await this.prisma.cashDrawerTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (raceExisting) return raceExisting;
      }
      this.logger.error(
        `Accounting.record failed for sourceType=${entry.sourceType} sourceId=${entry.sourceId}: ${err.message}`,
      );
      throw err;
    }
  }

  /** Write ALLOW_UNASSIGNED ledger entry outside the caller's tx (best-effort, never throws). */
  private async createUnassignedEntry(entry: AccountingEntry, idempotencyKey: string) {
    const data = this.buildEntryData(entry, idempotencyKey, null, null);
    try {
      return await this.prisma.cashDrawerTransaction.create({ data });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return this.prisma.cashDrawerTransaction.findUnique({ where: { idempotencyKey } });
      }
      this.logger.error(
        `Accounting.record ALLOW_UNASSIGNED write failed for sourceId=${entry.sourceId}: ${err.message}`,
      );
      return null;
    }
  }
}
