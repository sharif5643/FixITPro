import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService, ACCOUNTING_SOURCE, AccountingEntry } from './accounting.service';
import { PrismaService } from '../database/prisma.service';
import { CashDrawerPolicy, CashDrawerSessionStatus, Prisma } from '@prisma/client';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const BRANCH_ID  = 'branch-1';
const TENANT_ID  = 'tenant-1';
const ACTOR_ID   = 'user-1';
const SESSION_ID = 'session-1';
const DRAWER_ID  = 'drawer-1';
const SALE_ID    = 'sale-abc';
const IDEM_KEY   = `${TENANT_ID}:SALE_PAYMENT:${SALE_ID}:IN`;

const STRICT_BRANCH  = { cashDrawerPolicy: CashDrawerPolicy.STRICT };
const UNASSIGNED_BRANCH = { cashDrawerPolicy: CashDrawerPolicy.ALLOW_UNASSIGNED };

const OPEN_SESSION = {
  id:           SESSION_ID,
  cashDrawerId: DRAWER_ID,
  status:       CashDrawerSessionStatus.OPEN,
};

const CREATED_TX = {
  id:             'acctx-1',
  sessionId:      SESSION_ID,
  type:           'DEPOSIT',
  direction:      'IN',
  amount:         new Prisma.Decimal(500),
  idempotencyKey: IDEM_KEY,
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    cashDrawerTransaction: {
      findUnique: jest.fn(),
      create:     jest.fn(),
    },
    cashDrawerSession: {
      findFirst: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
    },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AccountingEntry> = {}): AccountingEntry {
  return {
    sourceType:    ACCOUNTING_SOURCE.SALE_PAYMENT,
    sourceId:      SALE_ID,
    paymentMethod: 'CASH',
    amount:        500,
    direction:     'IN',
    branchId:      BRANCH_ID,
    tenantId:      TENANT_ID,
    actorUserId:   ACTOR_ID,
    ...overrides,
  };
}

describe('AccountingService', () => {
  let service: AccountingService;
  let prisma:  ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AccountingService>(AccountingService);
  });

  // ── 1. Non-CASH: immediate no-op ─────────────────────────────────────────

  it('returns null without touching DB for TRANSFER', async () => {
    const result = await service.record(makeEntry({ paymentMethod: 'TRANSFER' }));
    expect(result).toBeNull();
    expect(prisma.cashDrawerTransaction.findUnique).not.toHaveBeenCalled();
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for QR', async () => {
    expect(await service.record(makeEntry({ paymentMethod: 'QR' }))).toBeNull();
  });

  it('returns null for CARD', async () => {
    expect(await service.record(makeEntry({ paymentMethod: 'CARD' }))).toBeNull();
  });

  it('returns null for BANK', async () => {
    expect(await service.record(makeEntry({ paymentMethod: 'BANK' }))).toBeNull();
  });

  it('returns null for CREDIT', async () => {
    expect(await service.record(makeEntry({ paymentMethod: 'CREDIT' }))).toBeNull();
  });

  // ── 2. Idempotency: existing record returned immediately ─────────────────

  it('returns existing record when idempotencyKey already exists (no duplicate insert)', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(CREATED_TX);

    const result = await service.record(makeEntry());

    expect(result).toEqual(CREATED_TX);
    expect(prisma.cashDrawerTransaction.create).not.toHaveBeenCalled();
    expect(prisma.branch.findUnique).not.toHaveBeenCalled(); // exits before policy check
  });

  // ── 3. STRICT mode: no session → unassigned entry (drawer is optional) ─────

  it('creates unassigned entry in STRICT mode when no open session (drawer is optional)', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, sessionId: null, cashDrawerId: null });

    const result = await service.record(makeEntry());

    expect(result).not.toBeNull();
    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null, cashDrawerId: null }),
      }),
    );
  });

  it('creates unassigned entry in STRICT mode for CASH repair payment with no session', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, sessionId: null, cashDrawerId: null });

    const result = await service.record(
      makeEntry({ sourceType: ACCOUNTING_SOURCE.REPAIR_FINAL_PAYMENT, sourceId: 'repair-1' }),
    );

    expect(result).not.toBeNull();
    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null }),
      }),
    );
  });

  it('creates unassigned entry in STRICT mode for CASH expense with no session', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, sessionId: null, cashDrawerId: null });

    const result = await service.record(
      makeEntry({ sourceType: ACCOUNTING_SOURCE.EXPENSE_PAYMENT, sourceId: 'exp-1', direction: 'OUT' }),
    );

    expect(result).not.toBeNull();
    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null }),
      }),
    );
  });

  // ── 4. ALLOW_UNASSIGNED: no session → creates unassigned entry ───────────

  it('creates unassigned entry (sessionId=null) when ALLOW_UNASSIGNED and no session', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(UNASSIGNED_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
    // The service uses `this.prisma` directly for unassigned entries
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, sessionId: null });

    const result = await service.record(makeEntry());

    expect(result).not.toBeNull();
    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: null, cashDrawerId: null }),
      }),
    );
  });

  // ── 5. Non-CASH passes through even with no session ──────────────────────

  it('non-cash succeeds without checking session even in STRICT mode', async () => {
    const result = await service.record(makeEntry({ paymentMethod: 'QR' }));
    expect(result).toBeNull();
    expect(prisma.cashDrawerSession.findFirst).not.toHaveBeenCalled();
  });

  // ── 6. CASH + open session → creates ledger entry ────────────────────────

  it('creates CashDrawerTransaction when CASH and session is open', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    const result = await service.record(makeEntry());

    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(CREATED_TX);
  });

  // ── 7. Structured columns written correctly ───────────────────────────────

  it('writes sourceType, referenceType, referenceId, paymentMethod to proper columns', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ sourceType: ACCOUNTING_SOURCE.SALE_PAYMENT, sourceId: 'sale-99' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.sourceType).toBe('SALE_PAYMENT');
    expect(data.referenceType).toBe('SALE_PAYMENT');
    expect(data.referenceId).toBe('sale-99');
    expect(data.paymentMethod).toBe('CASH');
  });

  it('writes idempotencyKey as tenant:sourceType:sourceId:direction', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ sourceId: 'sale-99', direction: 'IN' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.idempotencyKey).toBe(`${TENANT_ID}:SALE_PAYMENT:sale-99:IN`);
  });

  it('uses "global" prefix in idempotencyKey when tenantId is null', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ tenantId: null, sourceId: 'sale-99' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.idempotencyKey).toMatch(/^global:/);
  });

  // ── 8. DB-type mapping per source type ────────────────────────────────────

  it('SALE_PAYMENT → type=DEPOSIT direction=IN', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ sourceType: ACCOUNTING_SOURCE.SALE_PAYMENT, direction: 'IN' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('DEPOSIT');
    expect(data.direction).toBe('IN');
  });

  it('SALE_REFUND → type=WITHDRAWAL direction=OUT', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, type: 'WITHDRAWAL', direction: 'OUT' });

    await service.record(makeEntry({
      sourceType: ACCOUNTING_SOURCE.SALE_REFUND,
      sourceId:   'refund-1',
      direction:  'OUT',
    }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('WITHDRAWAL');
    expect(data.direction).toBe('OUT');
  });

  it('EXPENSE_PAYMENT → type=WITHDRAWAL direction=OUT', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue({ ...CREATED_TX, type: 'WITHDRAWAL', direction: 'OUT' });

    await service.record(makeEntry({ sourceType: ACCOUNTING_SOURCE.EXPENSE_PAYMENT, direction: 'OUT' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('WITHDRAWAL');
  });

  it('REPAIR_FINAL_PAYMENT → type=DEPOSIT direction=IN', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ sourceType: ACCOUNTING_SOURCE.REPAIR_FINAL_PAYMENT }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('DEPOSIT');
  });

  // ── 9. Amount stored as Prisma.Decimal ────────────────────────────────────

  it('stores amount as Prisma.Decimal when number is passed', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ amount: 1234.56 }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.amount).toBeInstanceOf(Prisma.Decimal);
    expect(data.amount.toNumber()).toBeCloseTo(1234.56);
  });

  it('stores amount as Prisma.Decimal when Decimal is passed', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ amount: new Prisma.Decimal('999.99'), sourceId: 'sale-2' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.amount).toBeInstanceOf(Prisma.Decimal);
    expect(data.amount.toNumber()).toBeCloseTo(999.99);
  });

  // ── 10. P2002 race condition: returns existing record ─────────────────────

  it('returns existing record on P2002 unique constraint violation (race condition)', async () => {
    const p2002 = Object.assign(new Error('Unique constraint violation'), {
      code: 'P2002',
      meta: { target: ['idempotencyKey'] },
    });

    prisma.cashDrawerTransaction.findUnique
      .mockResolvedValueOnce(null)          // first check — no existing
      .mockResolvedValueOnce(CREATED_TX);   // race recovery — found it
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockRejectedValue(p2002);

    const result = await service.record(makeEntry());

    expect(result).toEqual(CREATED_TX);
    expect(prisma.cashDrawerTransaction.create).toHaveBeenCalledTimes(1);
  });

  // ── 11. tx parameter forwarded to DB calls ────────────────────────────────

  it('uses provided tx client instead of PrismaService', async () => {
    const txClient = {
      cashDrawerTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create:     jest.fn().mockResolvedValue(CREATED_TX),
      },
      cashDrawerSession: { findFirst: jest.fn().mockResolvedValue(OPEN_SESSION) },
      branch:            { findUnique: jest.fn().mockResolvedValue(STRICT_BRANCH) },
    };

    await service.record(makeEntry(), txClient as any);

    expect(txClient.cashDrawerTransaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.cashDrawerTransaction.create).not.toHaveBeenCalled();
  });

  // ── 12. metadata JSON still written for audit trail ──────────────────────

  it('stores sourceType and sourceId in metadata JSON', async () => {
    prisma.cashDrawerTransaction.findUnique.mockResolvedValue(null);
    prisma.branch.findUnique.mockResolvedValue(STRICT_BRANCH);
    prisma.cashDrawerSession.findFirst.mockResolvedValue(OPEN_SESSION);
    prisma.cashDrawerTransaction.create.mockResolvedValue(CREATED_TX);

    await service.record(makeEntry({ sourceType: ACCOUNTING_SOURCE.REPAIR_FINAL_PAYMENT, sourceId: 'repair-42' }));

    const data = prisma.cashDrawerTransaction.create.mock.calls[0][0].data;
    expect(data.metadata).toEqual({ sourceType: 'REPAIR_FINAL_PAYMENT', sourceId: 'repair-42' });
  });
});
