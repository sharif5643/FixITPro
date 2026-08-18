import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService, CreateJournalInput, JOURNAL_SOURCE } from './journal.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-1';
const TENANT_ID2 = 'tenant-2';
const BRANCH_ID  = 'branch-1';
const USER_ID    = 'user-1';
const ENTRY_ID   = 'je-1';
const ENTRY_NUM  = 'JE-20260817-ABCD1234';

const ACC = {
  CASH:    { id: 'acc-cash',    code: '1100', name: 'Cash on Hand',  tenantId: TENANT_ID, isActive: true, type: 'ASSET' },
  REVENUE: { id: 'acc-rev',     code: '4100', name: 'Sales Revenue', tenantId: TENANT_ID, isActive: true, type: 'REVENUE' },
  EXPENSE: { id: 'acc-exp',     code: '6100', name: 'Op Expenses',   tenantId: TENANT_ID, isActive: true, type: 'EXPENSE' },
  BANK:    { id: 'acc-bank',    code: '1110', name: 'Bank Deposit',  tenantId: TENANT_ID, isActive: true, type: 'ASSET' },
  INACTIVE:{ id: 'acc-inactive',code: '9999', name: 'Inactive Acct', tenantId: TENANT_ID, isActive: false,type: 'ASSET' },
};

const BASE_ENTRY = {
  id:          ENTRY_ID,
  entryNumber: ENTRY_NUM,
  entryDate:   new Date('2026-08-17'),
  description: 'Test journal',
  sourceType:  'SALE_PAYMENT',
  sourceId:    'sale-1',
  sourceRef:   null,
  isVoided:    false,
  voidedAt:    null,
  voidedById:  null,
  voidReason:  null,
  isBackfill:  false,
  postedById:  USER_ID,
  postedAt:    new Date(),
  tenantId:    TENANT_ID,
  branchId:    BRANCH_ID,
  createdAt:   new Date(),
  lines: [
    {
      id: 'line-1', entryId: ENTRY_ID, accountId: 'acc-cash', sortOrder: 0,
      debit: new Prisma.Decimal('1000'), credit: new Prisma.Decimal('0'),
      paymentMethod: 'CASH', note: null,
      account: ACC.CASH,
    },
    {
      id: 'line-2', entryId: ENTRY_ID, accountId: 'acc-rev', sortOrder: 1,
      debit: new Prisma.Decimal('0'), credit: new Prisma.Decimal('1000'),
      paymentMethod: null, note: null,
      account: ACC.REVENUE,
    },
  ],
};

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeTx() {
  return {
    journalEntry: {
      create:             jest.fn().mockResolvedValue({ id: ENTRY_ID }),
      update:             jest.fn().mockResolvedValue({ ...BASE_ENTRY, isVoided: true }),
      findUniqueOrThrow:  jest.fn().mockResolvedValue(BASE_ENTRY),
    },
    journalLine: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeAccount(code: string, overrides: Partial<typeof ACC.CASH> = {}) {
  return { ...ACC.CASH, code, ...overrides };
}

function makePrisma(txOverrides: Partial<ReturnType<typeof makeTx>> = {}) {
  const tx = { ...makeTx(), ...txOverrides };
  return {
    tenant:           { findUnique: jest.fn().mockResolvedValue({ id: TENANT_ID }) },
    branch:           { findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }) },
    accountingAccount:{ findUnique: jest.fn() },
    journalEntry:     {
      findUnique:          jest.fn(),
      findFirst:           jest.fn().mockResolvedValue(null),
      findMany:            jest.fn().mockResolvedValue([]),
      findUniqueOrThrow:   jest.fn().mockResolvedValue(BASE_ENTRY),
      count:               jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn().mockImplementation(async (cb: (tx: any) => any) => cb(tx)),
    _tx: tx,
  };
}

async function build(prismaOverrides: Partial<ReturnType<typeof makePrisma>> = {}) {
  const prisma    = { ...makePrisma(), ...prismaOverrides };
  const auditLog  = {
    log:        jest.fn().mockResolvedValue(undefined),
    logWithTx:  jest.fn().mockResolvedValue(undefined),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      JournalService,
      { provide: PrismaService,   useValue: prisma   },
      { provide: AuditLogService, useValue: auditLog },
    ],
  }).compile();

  return {
    service:  module.get<JournalService>(JournalService),
    prisma,
    auditLog,
    tx:       (prisma as any)._tx,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function balancedInput(overrides: Partial<CreateJournalInput> = {}): CreateJournalInput {
  return {
    tenantId:    TENANT_ID,
    branchId:    BRANCH_ID,
    entryDate:   new Date('2026-08-17'),
    description: 'Test journal',
    sourceType:  'SALE_PAYMENT',
    sourceId:    'sale-1',
    postedById:  USER_ID,
    lines: [
      { accountCode: '1100', debit: 1000, credit: 0 },
      { accountCode: '4100', debit: 0,    credit: 1000 },
    ],
    ...overrides,
  };
}

function setupAccountMock(prisma: ReturnType<typeof makePrisma>) {
  prisma.accountingAccount.findUnique.mockImplementation(({ where }: any) => {
    const code = where?.code_tenantId?.code;
    switch (code) {
      case '1100': return Promise.resolve(ACC.CASH);
      case '1110': return Promise.resolve(ACC.BANK);
      case '4100': return Promise.resolve(ACC.REVENUE);
      case '6100': return Promise.resolve(ACC.EXPENSE);
      case '9999': return Promise.resolve(ACC.INACTIVE);
      default:     return Promise.resolve(null);
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JournalService', () => {

  // ── A: Balanced 2-line journal ────────────────────────────────────────────

  it('A: creates a balanced 2-line journal entry', async () => {
    const { service, prisma, auditLog } = await build();
    setupAccountMock(prisma);

    const result = await service.create(balancedInput());

    expect(result.created).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditLog.logWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'JOURNAL_CREATED', entityType: 'JournalEntry' }),
    );
  });

  // ── B: Balanced multi-line journal ───────────────────────────────────────

  it('B: creates a balanced multi-line journal entry (3 lines)', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    const input = balancedInput({
      lines: [
        { accountCode: '1100', debit: 600,  credit: 0 },
        { accountCode: '1110', debit: 400,  credit: 0 },
        { accountCode: '4100', debit: 0,    credit: 1000 },
      ],
    });
    (prisma as any)._tx.journalLine.createMany.mockResolvedValue({ count: 3 });

    const result = await service.create(input);

    expect(result.created).toBe(true);
    const createManyCall = (prisma as any)._tx.journalLine.createMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(3);
  });

  // ── C: Unbalanced journal rejected ───────────────────────────────────────

  it('C: rejects unbalanced journal (debit ≠ credit)', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '1100', debit: 1000, credit: 0 },
          { accountCode: '4100', debit: 0,    credit: 900 }, // mismatch!
        ],
      })),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── D: Negative amount rejected ───────────────────────────────────────────

  it('D: rejects negative debit', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '1100', debit: -100, credit: 0 },
          { accountCode: '4100', debit: 0,    credit: 0 },
        ],
      })),
    ).rejects.toThrow(BadRequestException);
  });

  it('D2: rejects negative credit', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '1100', debit: 100, credit: -100 },
          { accountCode: '4100', debit: 0,   credit: 0    },
        ],
      })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── E: Both debit and credit on same line rejected ────────────────────────

  it('E: rejects line with both debit > 0 and credit > 0', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '1100', debit: 500, credit: 500 }, // invalid!
          { accountCode: '4100', debit: 0,   credit: 0   },
        ],
      })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── F: Zero line rejected ─────────────────────────────────────────────────

  it('F: rejects line where both debit and credit are 0', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '1100', debit: 1000, credit: 0 },
          { accountCode: '4100', debit: 0,    credit: 1000 },
          { accountCode: '6100', debit: 0,    credit: 0    }, // zero line!
        ],
      })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── G: Less than 2 lines rejected ────────────────────────────────────────

  it('G: rejects single-line journal', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({ lines: [{ accountCode: '1100', debit: 1000, credit: 0 }] })),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('G2: rejects empty lines array', async () => {
    const { service, prisma } = await build();
    await expect(
      service.create(balancedInput({ lines: [] })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── H: Inactive account rejected ─────────────────────────────────────────

  it('H: rejects journal referencing an inactive account', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '9999', debit: 1000, credit: 0 },    // inactive!
          { accountCode: '4100', debit: 0,    credit: 1000 },
        ],
      })),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── I: Missing account rejected ───────────────────────────────────────────

  it('I: rejects journal referencing a non-existent account code', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma); // returns null for unknown codes

    await expect(
      service.create(balancedInput({
        lines: [
          { accountCode: '8888', debit: 1000, credit: 0 },    // not found!
          { accountCode: '4100', debit: 0,    credit: 1000 },
        ],
      })),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── J: Cross-tenant account rejected ─────────────────────────────────────

  it('J: rejects account that belongs to a different tenant', async () => {
    const { service, prisma } = await build();
    // accountingAccount.findUnique returns null when queried with caller's tenantId
    // (because composite key code_tenantId won't match the other tenant's account)
    prisma.accountingAccount.findUnique.mockResolvedValue(null);

    await expect(
      service.create(balancedInput({
        tenantId: TENANT_ID,    // caller is TENANT_ID
        lines: [
          { accountCode: '1100', debit: 1000, credit: 0 },    // account exists for TENANT_ID2 only
          { accountCode: '4100', debit: 0,    credit: 1000 },
        ],
      })),
    ).rejects.toThrow(NotFoundException); // findUnique returns null → NotFoundException
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── K: Cross-tenant branch rejected ──────────────────────────────────────

  it('K: rejects journal for branch belonging to a different tenant', async () => {
    const { service, prisma } = await build();
    prisma.branch.findUnique.mockResolvedValue({ tenantId: TENANT_ID2 }); // wrong tenant!
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({ branchId: BRANCH_ID, tenantId: TENANT_ID })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── L: Duplicate source returns existing journal ──────────────────────────

  it('L: returns existing journal when sourceType+sourceId already exists for tenant', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);
    prisma.journalEntry.findFirst.mockResolvedValue(BASE_ENTRY); // idempotent hit

    const result = await service.create(balancedInput({
      sourceType: 'SALE_PAYMENT',
      sourceId:   'sale-1',
    }));

    expect(result.created).toBe(false);
    expect(result.journal.id).toBe(ENTRY_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled(); // no new entry created
  });

  // ── M: Concurrent duplicate — application-level idempotency behavior ──────
  // NOTE: Without @@unique([sourceType, sourceId, tenantId]) at DB level,
  // true concurrent requests could both pass this check and both create a journal.
  // This test verifies sequential idempotency; the DB migration limitation is
  // documented in PHASE_4A_JOURNAL_ENGINE.md.

  it('M: sequential calls with same source return existing on second call', async () => {
    const { service, prisma, tx } = await build();
    setupAccountMock(prisma);

    // First call: findFirst returns null → creates
    prisma.journalEntry.findFirst.mockResolvedValueOnce(null);
    const first = await service.create(balancedInput({ sourceType: 'SALE_PAYMENT', sourceId: 'sale-x' }));
    expect(first.created).toBe(true);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);

    // Second call: findFirst returns existing → skips
    prisma.journalEntry.findFirst.mockResolvedValueOnce(BASE_ENTRY);
    const second = await service.create(balancedInput({ sourceType: 'SALE_PAYMENT', sourceId: 'sale-x' }));
    expect(second.created).toBe(false);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1); // still only 1 from first call
  });

  // ── N: Transaction rollback ───────────────────────────────────────────────

  it('N: rolls back if journalLine.createMany throws inside transaction', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);

    // Simulate $transaction propagating the inner error
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB constraint violation'));

    await expect(service.create(balancedInput())).rejects.toThrow('DB constraint violation');
  });

  // ── O: Void journal ───────────────────────────────────────────────────────

  it('O: voids a journal entry and sets voidedAt, voidReason', async () => {
    const { service, prisma, auditLog, tx } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue(BASE_ENTRY);
    tx.journalEntry.update.mockResolvedValue({ ...BASE_ENTRY, isVoided: true, voidReason: 'Typo' });

    const voided = await service.void(ENTRY_ID, TENANT_ID, { reason: 'Typo', actorId: USER_ID });

    expect(tx.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENTRY_ID },
        data:  expect.objectContaining({ isVoided: true, voidReason: 'Typo' }),
      }),
    );
    expect(voided.isVoided).toBe(true);
    expect(auditLog.logWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'JOURNAL_VOIDED' }),
    );
  });

  it('O2: cannot void an already-voided journal entry', async () => {
    const { service, prisma } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue({ ...BASE_ENTRY, isVoided: true });

    await expect(
      service.void(ENTRY_ID, TENANT_ID, { reason: 'Re-void attempt', actorId: USER_ID }),
    ).rejects.toThrow(ConflictException);
  });

  // ── P: Reversal journal ───────────────────────────────────────────────────

  it('P: creates a reversal journal with swapped debit/credit lines', async () => {
    const { service, prisma, tx } = await build();
    setupAccountMock(prisma);
    // mockResolvedValueOnce: first call (findById) returns BASE_ENTRY;
    // subsequent calls (generateEntryNumber) fall back to undefined (treated as "not found" → unique)
    prisma.journalEntry.findUnique.mockResolvedValueOnce(BASE_ENTRY);
    prisma.journalEntry.findFirst.mockResolvedValue(null); // no existing reversal

    await service.reverse(ENTRY_ID, TENANT_ID, 'Incorrect entry', USER_ID);

    const createManyCall = tx.journalLine.createMany.mock.calls[0][0];
    // Original: DR Cash 1000, CR Revenue 1000
    // Reversal: DR Revenue 1000, CR Cash 1000
    const lines: any[] = createManyCall.data;
    const cashLine    = lines.find((l: any) => l.accountId === ACC.CASH.id);
    const revLine     = lines.find((l: any) => l.accountId === ACC.REVENUE.id);

    expect(new Prisma.Decimal(cashLine.credit).toNumber()).toBe(1000);
    expect(new Prisma.Decimal(cashLine.debit).toNumber()).toBe(0);
    expect(new Prisma.Decimal(revLine.debit).toNumber()).toBe(1000);
    expect(new Prisma.Decimal(revLine.credit).toNumber()).toBe(0);
  });

  it('P2: reversal sourceType is JOURNAL_REVERSAL and sourceId is original entry ID', async () => {
    const { service, prisma, tx } = await build();
    setupAccountMock(prisma);
    prisma.journalEntry.findUnique.mockResolvedValueOnce(BASE_ENTRY);
    prisma.journalEntry.findFirst.mockResolvedValue(null);

    await service.reverse(ENTRY_ID, TENANT_ID, 'Incorrect entry', USER_ID);

    const createCall = tx.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.sourceType).toBe(JOURNAL_SOURCE.REVERSAL);
    expect(createCall.data.sourceId).toBe(ENTRY_ID);
    expect(createCall.data.sourceRef).toBe(ENTRY_NUM);
  });

  it('P3: cannot reverse a voided journal entry', async () => {
    const { service, prisma } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue({ ...BASE_ENTRY, isVoided: true });

    await expect(
      service.reverse(ENTRY_ID, TENANT_ID, 'Reverse attempt'),
    ).rejects.toThrow(ConflictException);
  });

  // ── Q: Decimal precision ──────────────────────────────────────────────────

  it('Q: validates balance using Decimal arithmetic, not floating-point', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);
    (prisma as any)._tx.journalLine.createMany.mockResolvedValue({ count: 3 });

    // 0.1 + 0.2 === 0.3 fails in IEEE 754 but passes with Decimal
    const input = balancedInput({
      lines: [
        { accountCode: '1100', debit: '0.10', credit: '0.00' },
        { accountCode: '1110', debit: '0.20', credit: '0.00' },
        { accountCode: '4100', debit: '0.00', credit: '0.30' },
      ],
    });

    const result = await service.create(input);
    expect(result.created).toBe(true); // would fail with JS floating-point
  });

  it('Q2: Decimal values are stored as Prisma.Decimal in createMany data', async () => {
    const { service, prisma, tx } = await build();
    setupAccountMock(prisma);

    await service.create(balancedInput());

    const createManyData = tx.journalLine.createMany.mock.calls[0][0].data;
    const debitLine = createManyData[0];
    expect(debitLine.debit).toBeInstanceOf(Prisma.Decimal);
    expect(debitLine.credit).toBeInstanceOf(Prisma.Decimal);
  });

  // ── R: Audit log ──────────────────────────────────────────────────────────

  it('R: logWithTx called with JOURNAL_CREATED inside transaction on create', async () => {
    const { service, prisma, auditLog } = await build();
    setupAccountMock(prisma);

    await service.create(balancedInput());

    expect(auditLog.logWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action:     'JOURNAL_CREATED',
        entityType: 'JournalEntry',
        afterData:  expect.objectContaining({ tenantId: TENANT_ID }),
      }),
    );
  });

  it('R2: logWithTx called with JOURNAL_VOIDED inside transaction on void', async () => {
    const { service, prisma, auditLog, tx } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue(BASE_ENTRY);
    tx.journalEntry.update.mockResolvedValue({ ...BASE_ENTRY, isVoided: true });

    await service.void(ENTRY_ID, TENANT_ID, { reason: 'Error', actorId: USER_ID });

    expect(auditLog.logWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'JOURNAL_VOIDED' }),
    );
  });

  it('R3: auditLog.log called with JOURNAL_REVERSED after reversal', async () => {
    const { service, prisma, auditLog } = await build();
    setupAccountMock(prisma);
    prisma.journalEntry.findUnique.mockResolvedValueOnce(BASE_ENTRY);
    prisma.journalEntry.findFirst.mockResolvedValue(null);

    await service.reverse(ENTRY_ID, TENANT_ID, 'Correcting error', USER_ID);

    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action:     'JOURNAL_REVERSED',
        entityType: 'JournalEntry',
        entityId:   ENTRY_ID,
      }),
    );
  });

  // ── S: Tenant isolation ───────────────────────────────────────────────────

  it('S: findById throws ForbiddenException when entry belongs to different tenant', async () => {
    const { service, prisma } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue({
      ...BASE_ENTRY, tenantId: TENANT_ID2,
    });

    await expect(service.findById(ENTRY_ID, TENANT_ID))
      .rejects.toThrow(ForbiddenException);
  });

  it('S2: void throws ForbiddenException when entry belongs to different tenant', async () => {
    const { service, prisma } = await build();
    prisma.journalEntry.findUnique.mockResolvedValue({
      ...BASE_ENTRY, tenantId: TENANT_ID2,
    });

    await expect(
      service.void(ENTRY_ID, TENANT_ID, { reason: 'Unauthorized', actorId: USER_ID }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('S3: create fails when tenant does not exist', async () => {
    const { service, prisma } = await build();
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.create(balancedInput())).rejects.toThrow(NotFoundException);
  });

  // ── T: Branch isolation ───────────────────────────────────────────────────

  it('T: create fails when branch belongs to a different tenant', async () => {
    const { service, prisma } = await build();
    prisma.branch.findUnique.mockResolvedValue({ tenantId: TENANT_ID2 });
    setupAccountMock(prisma);

    await expect(
      service.create(balancedInput({ branchId: 'branch-other' })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('T2: create fails when branch does not exist', async () => {
    const { service, prisma } = await build();
    prisma.branch.findUnique.mockResolvedValue(null);

    await expect(service.create(balancedInput({ branchId: 'branch-missing' })))
      .rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── M-DB: DB-level concurrent duplicate protection (P2002 handler) ──────

  it('M-DB: catches P2002 from DB unique constraint and returns existing journal', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);
    // The app-level findFirst check passes (no existing found yet)
    prisma.journalEntry.findFirst
      .mockResolvedValueOnce(null)             // idempotency pre-check: not found
      .mockResolvedValueOnce(BASE_ENTRY);      // re-fetch after P2002: found the winner

    // Simulate the DB partial unique index firing during $transaction
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.$transaction as jest.Mock).mockRejectedValue(p2002);

    const result = await service.create(balancedInput({
      sourceType: 'SALE_PAYMENT',
      sourceId:   'sale-concurrent',
    }));

    // Must return the existing journal (created: false), not throw
    expect(result.created).toBe(false);
    expect(result.journal.id).toBe(ENTRY_ID);
    // Verify findBySource was called to retrieve the winner
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledTimes(2);
  });

  it('M-DB: re-throws P2002 if sourceType/sourceId are not set (manual journal)', async () => {
    const { service, prisma } = await build();
    setupAccountMock(prisma);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.$transaction as jest.Mock).mockRejectedValue(p2002);

    // Manual journal without sourceType+sourceId: P2002 should propagate
    await expect(
      service.create(balancedInput({ sourceType: null, sourceId: null })),
    ).rejects.toThrow('Unique constraint failed');
  });

  // ── Extra: findMany scoped to tenantId ────────────────────────────────────

  it('Extra: findMany passes tenantId filter and returns paginated results', async () => {
    const { service, prisma } = await build();
    prisma.journalEntry.findMany.mockResolvedValue([BASE_ENTRY]);
    prisma.journalEntry.count.mockResolvedValue(1);

    const result = await service.findMany({ tenantId: TENANT_ID, page: 1, limit: 10 });

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  // ── Extra: reversal is idempotent if called twice ────────────────────────

  it('Extra: reversing same entry twice returns existing reversal on second call', async () => {
    const { service, prisma, tx } = await build();
    setupAccountMock(prisma);
    // Use mockImplementation to discriminate by argument:
    // findById calls with { id: ENTRY_ID } → BASE_ENTRY; all others → null
    prisma.journalEntry.findUnique.mockImplementation(({ where }: any) =>
      where?.id === ENTRY_ID ? Promise.resolve(BASE_ENTRY) : Promise.resolve(null),
    );

    // First reversal: no existing reversal
    prisma.journalEntry.findFirst.mockResolvedValueOnce(null);
    const first = await service.reverse(ENTRY_ID, TENANT_ID, 'First reversal');
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);

    // Second reversal: existing reversal found via idempotency check
    const reversalEntry = { ...BASE_ENTRY, id: 'je-rev', sourceType: JOURNAL_SOURCE.REVERSAL, sourceId: ENTRY_ID };
    prisma.journalEntry.findFirst.mockResolvedValueOnce(reversalEntry);
    const second = await service.reverse(ENTRY_ID, TENANT_ID, 'Duplicate reversal');
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1); // not called again
    expect(second.id).toBe(reversalEntry.id);
  });
});
