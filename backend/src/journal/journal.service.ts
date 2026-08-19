import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

// ── Input types ───────────────────────────────────────────────────────────────

export interface JournalLineInput {
  accountCode:    string;
  debit?:         number | string;
  credit?:        number | string;
  paymentMethod?: string;
  note?:          string;
  sortOrder?:     number;
}

export interface CreateJournalInput {
  tenantId:    string;
  branchId?:   string | null;
  entryDate:   Date;
  description: string;
  sourceType?: string | null;
  sourceId?:   string | null;
  sourceRef?:  string | null;
  postedById?: string | null;
  isBackfill?: boolean;
  lines:       JournalLineInput[];
}

export interface VoidJournalInput {
  reason:   string;
  actorId?: string | null;
}

export interface QueryJournalInput {
  tenantId:    string;
  branchId?:   string;
  startDate?:  Date;
  endDate?:    Date;
  sourceType?: string;
  sourceId?:   string;
  isVoided?:   boolean;
  page?:       number;
  limit?:      number;
}

export interface CreateJournalResult {
  journal:  Awaited<ReturnType<JournalService['_fetchWithLines']>>;
  created:  boolean;
}

// ── Source type constants for system-generated journals ──────────────────────
// JournalEntry.sourceType is TEXT (not a DB enum) — these are app-level constants only.
export const JOURNAL_SOURCE = {
  // Internal journal management
  REVERSAL: 'JOURNAL_REVERSAL',
  MANUAL:   'JOURNAL_MANUAL',
  // Repair accounting (Phase 4B.4C — not yet implemented)
  REPAIR_DEPOSIT:                  'REPAIR_DEPOSIT',
  REPAIR_FINAL_PAYMENT:            'REPAIR_FINAL_PAYMENT',
  REPAIR_DEPOSIT_SETTLE:           'REPAIR_DEPOSIT_SETTLE',
  REPAIR_COGS:                     'REPAIR_COGS',
  REPAIR_PAYMENT_REVERSAL:         'REPAIR_PAYMENT_REVERSAL',
  REPAIR_DEPOSIT_SETTLE_REVERSAL:  'REPAIR_DEPOSIT_SETTLE_REVERSAL',
  REPAIR_ADDITIONAL_PAYMENT:       'REPAIR_ADDITIONAL_PAYMENT',
  // Expense accounting (Phase 4B.4D — not yet implemented)
  EXPENSE_PAYMENT:                 'EXPENSE_PAYMENT',
  EXPENSE_REVERSAL:                'EXPENSE_REVERSAL',
  // Repair cancellation deposit refund (Phase 4B.4J)
  REPAIR_DEPOSIT_REFUND:           'REPAIR_DEPOSIT_REFUND',
  // Repair cancellation of DELIVERED repairs — reversals (Phase 4B.4L)
  REPAIR_COGS_REVERSAL:                 'REPAIR_COGS_REVERSAL',
  REPAIR_ADDITIONAL_PAYMENT_REVERSAL:   'REPAIR_ADDITIONAL_PAYMENT_REVERSAL',
} as const;

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Internal: full entry with lines + accounts ────────────────────────────

  async _fetchWithLines(id: string) {
    return this.prisma.journalEntry.findUniqueOrThrow({
      where:   { id },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
    });
  }

  // ── Entry number ─────────────────────────────────────────────────────────
  // Format: JE-{YYYYMMDD}-{8hex} (4 random bytes = 4 billion values/day).
  // Collision probability is negligible; the DB entryNumber @unique constraint
  // is the enforced safety net. Callers should catch P2002 if they need retry logic.

  private generateEntryNumber(): string {
    const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    return `JE-${date}-${suffix}`;
  }

  // ── Decimal helpers ───────────────────────────────────────────────────────

  private toDecimal(val: number | string | undefined | null): Prisma.Decimal {
    return new Prisma.Decimal(String(val ?? 0));
  }

  // ── Line validation ───────────────────────────────────────────────────────

  private validateLines(lines: JournalLineInput[]): void {
    if (!lines || lines.length < 2) {
      throw new BadRequestException('Journal entry must have at least 2 lines');
    }

    let totalDebit  = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (let i = 0; i < lines.length; i++) {
      const d = this.toDecimal(lines[i].debit);
      const c = this.toDecimal(lines[i].credit);

      if (d.isNegative()) {
        throw new BadRequestException(`Line ${i + 1}: debit must be >= 0`);
      }
      if (c.isNegative()) {
        throw new BadRequestException(`Line ${i + 1}: credit must be >= 0`);
      }
      // Use .gt(0) (strict greater-than) not .isPositive() —
      // Decimal.js treats +0 as positive (sign=1), so isPositive() returns true for 0.
      const dPos = d.gt(0);
      const cPos = c.gt(0);
      if (dPos && cPos) {
        throw new BadRequestException(`Line ${i + 1}: a line cannot have both debit and credit`);
      }
      if (!dPos && !cPos) {
        throw new BadRequestException(`Line ${i + 1}: debit or credit must be > 0`);
      }

      totalDebit  = totalDebit.plus(d);
      totalCredit = totalCredit.plus(c);
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit}`,
      );
    }
  }

  // ── Account resolution ────────────────────────────────────────────────────

  // Resolves each line's accountCode to an accountId, validating existence,
  // tenant ownership (via composite unique key), and active status.
  private async resolveAccounts(
    lines: JournalLineInput[],
    tenantId: string,
  ): Promise<string[]> {
    const accountIds = await Promise.all(
      lines.map(async (line, idx) => {
        const account = await this.prisma.accountingAccount.findUnique({
          where: { code_tenantId: { code: line.accountCode, tenantId } },
        });
        if (!account) {
          throw new NotFoundException(
            `Line ${idx + 1}: account code "${line.accountCode}" not found for tenant`,
          );
        }
        // Guard: the composite key already scopes to tenantId, but be explicit
        if (account.tenantId !== tenantId) {
          throw new ForbiddenException(
            `Line ${idx + 1}: account "${line.accountCode}" does not belong to this tenant`,
          );
        }
        if (!account.isActive) {
          throw new ConflictException(
            `Line ${idx + 1}: account "${line.accountCode}" is inactive`,
          );
        }
        return account.id;
      }),
    );
    return accountIds;
  }

  // ── Tenant + branch validation ────────────────────────────────────────────

  private async validateTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
  }

  private async validateBranch(branchId: string, tenantId: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where:  { id: branchId },
      select: { tenantId: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
    if (branch.tenantId !== tenantId) {
      throw new ForbiddenException(
        `Branch ${branchId} does not belong to tenant ${tenantId}`,
      );
    }
  }

  // ── Idempotency lookup by business source ─────────────────────────────────
  // NOTE: this is an application-level check only.
  // A @@unique([sourceType, sourceId, tenantId]) database constraint would be
  // needed to prevent duplicates under concurrent requests.
  // This limitation is documented in PHASE_4A_JOURNAL_ENGINE.md.

  async findBySource(sourceType: string, sourceId: string, tenantId: string) {
    return this.prisma.journalEntry.findFirst({
      where:   { sourceType, sourceId, tenantId },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(input: CreateJournalInput): Promise<CreateJournalResult> {
    // 1. Tenant must exist
    await this.validateTenant(input.tenantId);

    // 2. Branch must belong to tenant (if provided)
    if (input.branchId) {
      await this.validateBranch(input.branchId, input.tenantId);
    }

    // 3. Validate line amounts — throws on imbalance / zero / negative / both
    this.validateLines(input.lines);

    // 4. Idempotency: return existing if sourceType + sourceId already present for this tenant
    if (input.sourceType && input.sourceId) {
      const existing = await this.findBySource(
        input.sourceType, input.sourceId, input.tenantId,
      );
      if (existing) {
        this.logger.debug(
          `JournalService.create: idempotent hit sourceType=${input.sourceType} sourceId=${input.sourceId}`,
        );
        return { journal: existing, created: false };
      }
    }

    // 5. Resolve account codes → accountIds (validates tenant ownership + active)
    const accountIds = await this.resolveAccounts(input.lines, input.tenantId);

    // 6. Generate entry number (JE-{YYYYMMDD}-{8hex}, collision caught by @unique at DB)
    const entryNumber = this.generateEntryNumber();

    // 7. Atomic transaction: JournalEntry + JournalLines + audit
    // Wrap in try/catch: if a concurrent request wins the race and the DB partial
    // unique index fires (P2002 on JournalEntry_sourceType_sourceId_tenantId_unique),
    // re-fetch the winning journal and return it as idempotent result.
    let journal: Awaited<ReturnType<JournalService['_fetchWithLines']>>;
    try {
    journal = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          entryDate:   input.entryDate,
          description: input.description,
          sourceType:  input.sourceType  ?? null,
          sourceId:    input.sourceId    ?? null,
          sourceRef:   input.sourceRef   ?? null,
          postedById:  input.postedById  ?? null,
          postedAt:    new Date(),
          tenantId:    input.tenantId,
          branchId:    input.branchId    ?? null,
          isBackfill:  input.isBackfill  ?? false,
          isVoided:    false,
        },
      });

      await tx.journalLine.createMany({
        data: input.lines.map((line, idx) => ({
          entryId:       entry.id,
          accountId:     accountIds[idx],
          debit:         this.toDecimal(line.debit),
          credit:        this.toDecimal(line.credit),
          paymentMethod: line.paymentMethod ?? null,
          note:          line.note          ?? null,
          sortOrder:     line.sortOrder     ?? idx,
        })),
      });

      await this.auditLog.logWithTx(tx, {
        actorId:    input.postedById ?? null,
        action:     'JOURNAL_CREATED',
        entityType: 'JournalEntry',
        entityId:   entry.id,
        afterData:  {
          entryNumber,
          description: input.description,
          sourceType:  input.sourceType,
          sourceId:    input.sourceId,
          tenantId:    input.tenantId,
          lineCount:   input.lines.length,
        },
      });

      return tx.journalEntry.findUniqueOrThrow({
        where:   { id: entry.id },
        include: { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
      });
    });
    } catch (err: any) {
      // DB-level race: a concurrent request beat us to the insert and the partial unique
      // index (JournalEntry_sourceType_sourceId_tenantId_unique) fired (Prisma P2002).
      // Re-fetch the winner and return it as an idempotent result.
      if (err?.code === 'P2002' && input.sourceType && input.sourceId) {
        this.logger.warn(
          `JournalService.create: P2002 concurrent duplicate ` +
          `sourceType=${input.sourceType} sourceId=${input.sourceId} tenantId=${input.tenantId}`,
        );
        const winner = await this.findBySource(input.sourceType, input.sourceId, input.tenantId);
        if (winner) return { journal: winner, created: false };
      }
      throw err;
    }

    return { journal: journal!, created: true };
  }

  // ── Find by ID ────────────────────────────────────────────────────────────

  async findById(id: string, tenantId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where:   { id },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
    });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    if (entry.tenantId !== tenantId) throw new ForbiddenException('Cross-tenant access denied');
    return entry;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async findMany(query: QueryJournalInput) {
    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const skip  = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = { tenantId: query.tenantId };
    if (query.branchId)          where.branchId   = query.branchId;
    if (query.sourceType)        where.sourceType  = query.sourceType;
    if (query.sourceId)          where.sourceId    = query.sourceId;
    if (query.isVoided !== undefined) where.isVoided = query.isVoided;
    if (query.startDate || query.endDate) {
      where.entryDate = {
        ...(query.startDate ? { gte: query.startDate } : {}),
        ...(query.endDate   ? { lte: query.endDate   } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include:  { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
        orderBy:  { entryDate: 'desc' },
        skip,
        take:     limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ── Void ──────────────────────────────────────────────────────────────────

  async void(id: string, tenantId: string, input: VoidJournalInput) {
    const entry = await this.findById(id, tenantId);
    if (entry.isVoided) {
      throw new ConflictException(
        `Journal entry ${entry.entryNumber} is already voided`,
      );
    }

    const voided = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.journalEntry.update({
        where: { id },
        data:  {
          isVoided:   true,
          voidedAt:   new Date(),
          voidedById: input.actorId ?? null,
          voidReason: input.reason,
        },
        include: { lines: { orderBy: { sortOrder: 'asc' }, include: { account: true } } },
      });

      await this.auditLog.logWithTx(tx, {
        actorId:    input.actorId ?? null,
        action:     'JOURNAL_VOIDED',
        entityType: 'JournalEntry',
        entityId:   id,
        beforeData: { isVoided: false, entryNumber: entry.entryNumber },
        afterData:  { isVoided: true,  reason: input.reason },
      });

      return updated;
    });

    return voided;
  }

  // ── Reversal ──────────────────────────────────────────────────────────────
  // Links reversal to original via sourceType=JOURNAL_REVERSAL + sourceId=originalId
  // (no schema change required — existing sourceType/sourceId fields serve this purpose).

  async reverse(
    id:       string,
    tenantId: string,
    reason:   string,
    actorId?: string | null,
  ) {
    const original = await this.findById(id, tenantId);
    if (original.isVoided) {
      throw new ConflictException(
        `Cannot reverse a voided journal entry (${original.entryNumber})`,
      );
    }

    // Swap debit ↔ credit for every line
    const reversedLines: JournalLineInput[] = original.lines.map((line) => ({
      accountCode:   (line as any).account.code,
      debit:         line.credit.toString(),
      credit:        line.debit.toString(),
      paymentMethod: line.paymentMethod ?? undefined,
      note:          line.note          ?? undefined,
      sortOrder:     line.sortOrder,
    }));

    const result = await this.create({
      tenantId,
      branchId:    original.branchId,
      entryDate:   new Date(),
      description: `Reversal of ${original.entryNumber}: ${reason}`,
      sourceType:  JOURNAL_SOURCE.REVERSAL,
      sourceId:    original.id,
      sourceRef:   original.entryNumber,
      postedById:  actorId ?? null,
      lines:       reversedLines,
    });

    // Audit the reversal on the original entry
    await this.auditLog.log({
      actorId:    actorId ?? null,
      action:     'JOURNAL_REVERSED',
      entityType: 'JournalEntry',
      entityId:   id,
      afterData:  {
        reversalEntryId:     result.journal.id,
        reversalEntryNumber: result.journal.entryNumber,
        reason,
      },
    });

    return result.journal;
  }
}
