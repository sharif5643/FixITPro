import { Prisma } from '@prisma/client';
import {
  RepairAccountingAdapter,
  RepairForAccounting,
  RepairWithPartsForAccounting,
  RepairPartForAccounting,
  AdditionalPaymentForAccounting,
} from './repair-accounting.adapter';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';
import { JOURNAL_SOURCE } from '../journal/journal.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-repair-1';
const BRANCH_ID  = 'branch-1';
const USER_ID    = 'user-1';
const REPAIR_ID  = 'repair-abc';
const TICKET     = 'TKT-20260818-001';
const PART_ID_1  = 'part-111';
const PART_ID_2  = 'part-222';
const PMT_ID     = 'addl-pmt-1';

function makeRepair(overrides?: Partial<RepairWithPartsForAccounting>): RepairWithPartsForAccounting {
  return {
    id:            REPAIR_ID,
    ticketNumber:  TICKET,
    paidAmount:    new Prisma.Decimal('500'),
    paymentMethod: 'CASH',
    deposit:       new Prisma.Decimal('200'),
    branchId:      BRANCH_ID,
    parts:         [],
    ...overrides,
  };
}

function makePart(overrides?: Partial<RepairPartForAccounting>): RepairPartForAccounting {
  return {
    id:        PART_ID_1,
    costPrice: new Prisma.Decimal('150'),
    quantity:  1,
    isVoided:  false,
    ...overrides,
  };
}

function makePayment(overrides?: Partial<AdditionalPaymentForAccounting>): AdditionalPaymentForAccounting {
  return {
    id:            PMT_ID,
    amount:        new Prisma.Decimal('300'),
    paymentMethod: 'CASH',
    ...overrides,
  };
}

// A fake JournalEntry with lines carrying account.code and debit/credit Decimals.
function makeJournalWithLines(id: string, drCode: string, crCode: string, amount: string) {
  return {
    id,
    entryNumber: `JE-FAKE-${id}`,
    isVoided:    false,
    lines: [
      {
        account: { code: drCode },
        debit:   new Prisma.Decimal(amount),
        credit:  new Prisma.Decimal('0'),
      },
      {
        account: { code: crCode },
        debit:   new Prisma.Decimal('0'),
        credit:  new Prisma.Decimal(amount),
      },
    ],
  };
}

function makeJournal(id = 'je-1') {
  return { id, entryNumber: 'JE-20260818-FAKE', isVoided: false, lines: [] };
}

// ── Mock factory ──────────────────────────────────────────────────────────────

type JMock = { create: jest.Mock; findBySource: jest.Mock; reverse: jest.Mock };

function makeJournalMock(): JMock {
  return {
    create:       jest.fn().mockResolvedValue({ journal: makeJournal(), created: true }),
    findBySource: jest.fn().mockResolvedValue(null),
    reverse:      jest.fn().mockResolvedValue(makeJournal('je-rev')),
  };
}

type MockModules = { isAccountingEnabled: jest.Mock };

function makeModulesMock(enabled = false): MockModules {
  return { isAccountingEnabled: jest.fn().mockResolvedValue(enabled) };
}

function makeAdapter(jMock: JMock, modulesMock: MockModules): RepairAccountingAdapter {
  return new RepairAccountingAdapter(jMock as any, modulesMock as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RepairAccountingAdapter', () => {
  let jMock:       JMock;
  let modulesMock: MockModules;
  let adapter:     RepairAccountingAdapter;

  beforeEach(() => {
    jMock       = makeJournalMock();
    modulesMock = makeModulesMock();
    adapter     = makeAdapter(jMock, modulesMock);
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  afterEach(() => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  // ── A: Cash deposit ───────────────────────────────────────────────────────

  it('A: CASH deposit → DR 1100 / CR 2110, sourceType=REPAIR_DEPOSIT, sourceId=repair.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });

    await adapter._recordDepositJournal(repair, 'CASH', TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_DEPOSIT);
    expect(call.sourceId).toBe(REPAIR_ID);
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,             debit:  '200' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, credit: '200' });
  });

  // ── B: Transfer deposit ───────────────────────────────────────────────────

  it('B: TRANSFER deposit → DR 1120 Clearing / CR 2110 CustomerDeposit', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const repair = makeRepair({ deposit: new Prisma.Decimal('300') });

    await adapter._recordDepositJournal(repair, 'TRANSFER', TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,         debit:  '300' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, credit: '300' });
  });

  // ── C: Final payment without deposit ─────────────────────────────────────

  it('C: final payment, no deposit → 1 REPAIR_FINAL_PAYMENT journal, no REPAIR_DEPOSIT_SETTLE', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // deposit=0 → no settlement check at all
    const repair = makeRepair({ deposit: new Prisma.Decimal('0'), paidAmount: new Prisma.Decimal('750') });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    // findBySource should NOT be called (deposit=0 skip)
    expect(jMock.findBySource).not.toHaveBeenCalled();
    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,           debit:  '750' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.REPAIR_REVENUE, credit: '750' });
  });

  // ── D: Final payment with deposit (no prior deposit journal) ─────────────

  it('D: final payment with deposit, but REPAIR_DEPOSIT never posted → only REPAIR_FINAL_PAYMENT created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(null); // no deposit JE

    const repair = makeRepair({ deposit: new Prisma.Decimal('200'), paidAmount: new Prisma.Decimal('500') });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    // findBySource called once (checking for REPAIR_DEPOSIT)
    expect(jMock.findBySource).toHaveBeenCalledWith(JOURNAL_SOURCE.REPAIR_DEPOSIT, REPAIR_ID, TENANT_ID);
    // Only REPAIR_FINAL_PAYMENT created — no settlement
    expect(jMock.create).toHaveBeenCalledTimes(1);
    expect(jMock.create.mock.calls[0][0].sourceType).toBe(JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT);
  });

  // ── E: Deposit settlement ─────────────────────────────────────────────────

  it('E: deposit settlement — REPAIR_DEPOSIT exists → REPAIR_DEPOSIT_SETTLE created: DR 2110 / CR 4200', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // REPAIR_DEPOSIT journal exists for this repair
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return makeJournal('je-deposit');
      return null;
    });

    const repair = makeRepair({
      deposit:       new Prisma.Decimal('200'),
      paidAmount:    new Prisma.Decimal('500'),
      paymentMethod: 'CASH',
      parts:         [],
    });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    // Should create REPAIR_FINAL_PAYMENT + REPAIR_DEPOSIT_SETTLE
    expect(jMock.create).toHaveBeenCalledTimes(2);
    const settleCalls = jMock.create.mock.calls.filter(
      (c) => c[0].sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE,
    );
    expect(settleCalls).toHaveLength(1);
    const settle = settleCalls[0][0];
    expect(settle.sourceId).toBe(REPAIR_ID);
    expect(settle.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, debit:  '200' });
    expect(settle.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.REPAIR_REVENUE,   credit: '200' });
  });

  // ── F: Repair COGS — single part ─────────────────────────────────────────

  it('F: repair COGS — single part, costPrice=150, qty=1 → DR 5200=150 / CR 1310=150', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const part = makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('150'), quantity: 1, isVoided: false });
    const repair = makeRepair({ paidAmount: new Prisma.Decimal('0'), deposit: new Prisma.Decimal('0'), parts: [part] });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    const cogsCalls = jMock.create.mock.calls.filter(
      (c) => c[0].sourceType === JOURNAL_SOURCE.REPAIR_COGS,
    );
    expect(cogsCalls).toHaveLength(1);
    const cogs = cogsCalls[0][0];
    expect(cogs.sourceId).toBe(PART_ID_1);
    expect(cogs.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.REPAIR_COGS,     debit:  '150' });
    expect(cogs.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.PARTS_INVENTORY, credit: '150' });
  });

  // ── G: Multiple repair items ──────────────────────────────────────────────

  it('G: multiple parts — active with cost, voided, zero-cost — only active+costed get COGS', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const parts: RepairPartForAccounting[] = [
      { id: 'p1', costPrice: new Prisma.Decimal('100'), quantity: 2, isVoided: false },  // → COGS 200
      { id: 'p2', costPrice: new Prisma.Decimal('50'),  quantity: 1, isVoided: true  },  // → skipped (voided)
      { id: 'p3', costPrice: new Prisma.Decimal('0'),   quantity: 3, isVoided: false },  // → skipped (zero cost)
      { id: 'p4', costPrice: new Prisma.Decimal('75'),  quantity: 2, isVoided: false },  // → COGS 150
    ];
    const repair = makeRepair({ deposit: new Prisma.Decimal('0'), paidAmount: new Prisma.Decimal('500'), parts });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    const cogsCalls = jMock.create.mock.calls.filter(
      (c) => c[0].sourceType === JOURNAL_SOURCE.REPAIR_COGS,
    );
    expect(cogsCalls).toHaveLength(2);
    const sourceIds = cogsCalls.map((c) => c[0].sourceId);
    expect(sourceIds).toContain('p1');
    expect(sourceIds).toContain('p4');
    expect(sourceIds).not.toContain('p2');
    expect(sourceIds).not.toContain('p3');

    const p1Call = cogsCalls.find((c) => c[0].sourceId === 'p1')![0];
    const p4Call = cogsCalls.find((c) => c[0].sourceId === 'p4')![0];
    expect(p1Call.lines[0]).toMatchObject({ debit: '200' });
    expect(p4Call.lines[0]).toMatchObject({ debit: '150' });
  });

  // ── H: Additional / debt payment ─────────────────────────────────────────

  it('H: additional CASH payment → DR 1100 / CR 1200, sourceType=REPAIR_ADDITIONAL_PAYMENT, sourceId=payment.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const payment = makePayment({ id: PMT_ID, amount: new Prisma.Decimal('300'), paymentMethod: 'CASH' });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };

    await adapter._recordAdditionalPaymentJournal(payment, repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT);
    expect(call.sourceId).toBe(PMT_ID);
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,      debit:  '300' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.REPAIR_AR, credit: '300' });
  });

  it('H2: additional TRANSFER payment → DR 1120 Clearing / CR 1200 RepairAR', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const payment = makePayment({ paymentMethod: 'TRANSFER', amount: new Prisma.Decimal('500') });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };

    await adapter._recordAdditionalPaymentJournal(payment, repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,  debit:  '500' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.REPAIR_AR, credit: '500' });
  });

  // ── I: Idempotency ────────────────────────────────────────────────────────

  it('I: idempotency — journal.create returns {created:false} on duplicate call, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });

    // Call twice — both should resolve without error
    await expect(adapter._recordDepositJournal(repair, 'CASH', TENANT_ID)).resolves.toBeUndefined();
    await expect(adapter._recordDepositJournal(repair, 'CASH', TENANT_ID)).resolves.toBeUndefined();

    // journal.create called twice — idempotency handled internally by JournalService
    expect(jMock.create).toHaveBeenCalledTimes(2);
  });

  // ── J: Concurrent duplicate protection ───────────────────────────────────

  it('J: concurrent duplicate — journal.create returns {created:false} (P2002 recovered), adapter does not throw', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // JournalService handles P2002 internally and returns the winner as {created:false}
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    const repair = makeRepair({ deposit: new Prisma.Decimal('500') });

    await expect(
      adapter.recordDepositJournal(repair, 'CASH', TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── K: Tenant isolation ───────────────────────────────────────────────────

  it('K: feature flag ON but tenant not in allowlist → no journal created (cross-tenant blocked)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'pilot-tenant-only';

    await adapter.recordDepositJournal(makeRepair(), 'CASH', TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('K2: feature flag OFF → complete no-op for all public methods', async () => {
    // No env vars set
    await adapter.recordDepositJournal(makeRepair(), 'CASH', TENANT_ID);
    await adapter.recordFinalPaymentJournal(makeRepair(), TENANT_ID);
    await adapter.reversePaymentJournal(makeRepair(), TENANT_ID);
    await adapter.recordAdditionalPaymentJournal(
      makePayment(), { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID }, TENANT_ID,
    );
    await adapter.recordCogsReversalJournal(makeRepair(), TENANT_ID);
    await adapter.recordAdditionalPaymentReversalJournal(
      makePayment(), { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID }, TENANT_ID,
    );

    expect(jMock.create).not.toHaveBeenCalled();
    expect(jMock.findBySource).not.toHaveBeenCalled();
  });

  it('K3: isEnabledForTenant enabled (mock=true) → returns true for any tenant', async () => {
    modulesMock.isAccountingEnabled.mockResolvedValue(true);

    expect(await adapter.isEnabledForTenant('any-tenant')).toBe(true);
    expect(await adapter.isEnabledForTenant(TENANT_ID)).toBe(true);
  });

  // ── L: Inactive account rejection ────────────────────────────────────────

  it('L: inactive account — journal.create throws ConflictException → caught by public method', async () => {
    modulesMock.isAccountingEnabled.mockResolvedValue(true);
    jMock.create.mockRejectedValue(new Error('account "1100" is inactive'));

    await expect(
      adapter.recordDepositJournal(makeRepair({ deposit: new Prisma.Decimal('200') }), 'CASH', TENANT_ID),
    ).resolves.toBeUndefined();  // no rethrow
  });

  // ── M: Missing account ────────────────────────────────────────────────────

  it('M: missing account — journal.create throws NotFoundException → caught, adapter does not rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.create.mockRejectedValue(new Error('account code "2110" not found for tenant'));

    await expect(
      adapter.recordDepositJournal(makeRepair({ deposit: new Prisma.Decimal('200') }), 'CASH', TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── N: Zero / negative amount rejection ──────────────────────────────────

  it('N: deposit=0 → warns and creates no journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const repair  = makeRepair({ deposit: new Prisma.Decimal('0') });

    await adapter._recordDepositJournal(repair, 'CASH', TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deposit=0'));
  });

  it('N2: paidAmount=0 → final payment skipped, COGS still proceeds', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const part    = makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('100'), quantity: 1 });
    const repair  = makeRepair({
      paidAmount: new Prisma.Decimal('0'),
      deposit:    new Prisma.Decimal('0'),
      parts:      [part],
    });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('paidAmount=0'));
    // COGS should still run for the part
    const cogsCalls = jMock.create.mock.calls.filter(
      (c) => c[0].sourceType === JOURNAL_SOURCE.REPAIR_COGS,
    );
    expect(cogsCalls).toHaveLength(1);
  });

  it('N3: additional payment amount=0 → warns and creates no journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const payment = makePayment({ amount: new Prisma.Decimal('0') });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };

    await adapter._recordAdditionalPaymentJournal(payment, repair, TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amount=0'));
  });

  // ── O: Reversal ───────────────────────────────────────────────────────────

  it('O: reversal — finds REPAIR_FINAL_PAYMENT, creates REPAIR_PAYMENT_REVERSAL with swapped lines', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const finalJe = makeJournalWithLines('je-final', ACCOUNT_CODES.CASH, ACCOUNT_CODES.REPAIR_REVENUE, '500');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT) return finalJe;
      return null;  // no settle JE
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('0') });

    await adapter._reversePaymentJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_PAYMENT_REVERSAL);
    expect(call.sourceId).toBe(REPAIR_ID);
    // Lines should be swapped: original DR 1100→CR 1100, original CR 4200→DR 4200
    expect(call.lines).toMatchObject([
      { accountCode: ACCOUNT_CODES.CASH,           credit: '500' },
      { accountCode: ACCOUNT_CODES.REPAIR_REVENUE, debit:  '500' },
    ]);
  });

  it('O2: reversal — also reverses REPAIR_DEPOSIT_SETTLE when present', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const finalJe  = makeJournalWithLines('je-final',  ACCOUNT_CODES.CASH,             ACCOUNT_CODES.REPAIR_REVENUE, '500');
    const settleJe = makeJournalWithLines('je-settle', ACCOUNT_CODES.CUSTOMER_DEPOSIT, ACCOUNT_CODES.REPAIR_REVENUE, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT)  return finalJe;
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE) return settleJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });

    await adapter._reversePaymentJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(2);
    const types = jMock.create.mock.calls.map((c) => c[0].sourceType);
    expect(types).toContain(JOURNAL_SOURCE.REPAIR_PAYMENT_REVERSAL);
    expect(types).toContain(JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE_REVERSAL);

    const settleReversalCall = jMock.create.mock.calls.find(
      (c) => c[0].sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE_REVERSAL,
    )![0];
    expect(settleReversalCall.sourceId).toBe(REPAIR_ID);
    // Original settle: DR 2110 / CR 4200 → reversed: DR 4200 / CR 2110
    expect(settleReversalCall.lines).toMatchObject([
      { accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, credit: '200' },
      { accountCode: ACCOUNT_CODES.REPAIR_REVENUE,   debit:  '200' },
    ]);
  });

  it('O3: reversal — no REPAIR_FINAL_PAYMENT journal → warns, does not throw', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(null);
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});

    await expect(
      adapter._reversePaymentJournal(makeRepair(), TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no REPAIR_FINAL_PAYMENT journal'));
  });

  it('O4: reversal failure caught by public method — no rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.findBySource.mockRejectedValue(new Error('DB timeout'));

    await expect(
      adapter.reversePaymentJournal(makeRepair(), TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  // ── P: Source ID determinism ──────────────────────────────────────────────

  it('P: source IDs are deterministic and match the expected model IDs', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournal('je-dep');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const part1 = makePart({ id: 'p-aaa', costPrice: new Prisma.Decimal('100'), quantity: 1 });
    const part2 = makePart({ id: 'p-bbb', costPrice: new Prisma.Decimal('50'),  quantity: 2, isVoided: false });
    const repair = makeRepair({
      id:            REPAIR_ID,
      deposit:       new Prisma.Decimal('200'),
      paidAmount:    new Prisma.Decimal('500'),
      paymentMethod: 'TRANSFER',
      parts:         [part1, part2],
    });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    const allCalls = jMock.create.mock.calls.map((c) => ({
      sourceType: c[0].sourceType as string,
      sourceId:   c[0].sourceId as string,
    }));

    // REPAIR_FINAL_PAYMENT → Repair.id
    expect(allCalls).toContainEqual({
      sourceType: JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT,
      sourceId:   REPAIR_ID,
    });
    // REPAIR_DEPOSIT_SETTLE → Repair.id
    expect(allCalls).toContainEqual({
      sourceType: JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE,
      sourceId:   REPAIR_ID,
    });
    // REPAIR_COGS → RepairPart.id (one per part)
    expect(allCalls).toContainEqual({
      sourceType: JOURNAL_SOURCE.REPAIR_COGS,
      sourceId:   'p-aaa',
    });
    expect(allCalls).toContainEqual({
      sourceType: JOURNAL_SOURCE.REPAIR_COGS,
      sourceId:   'p-bbb',
    });
  });

  it('P2: deposit sourceId=repair.id; additional payment sourceId=payment.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const repair  = makeRepair({ deposit: new Prisma.Decimal('200') });
    const payment = makePayment({ id: PMT_ID });

    await adapter._recordDepositJournal(repair, 'CASH', TENANT_ID);
    const depositCall = jMock.create.mock.calls[0][0];
    expect(depositCall.sourceId).toBe(REPAIR_ID);

    jMock.create.mockClear();

    await adapter._recordAdditionalPaymentJournal(
      payment,
      { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID },
      TENANT_ID,
    );
    const pmtCall = jMock.create.mock.calls[0][0];
    expect(pmtCall.sourceId).toBe(PMT_ID);
  });

  // ── tenantId propagation ──────────────────────────────────────────────────

  // ── H: Deposit refund on cancellation ────────────────────────────────────

  it('H01: CASH deposit refund → DR 2110 / CR 1100, sourceType=REPAIR_DEPOSIT_REFUND, sourceId=repair.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // Original REPAIR_DEPOSIT journal with DR 1100 (CASH)
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_DEPOSIT_REFUND);
    expect(call.sourceId).toBe(REPAIR_ID);
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, debit:  '200' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,             credit: '200' });
  });

  it('H02: TRANSFER deposit refund → DR 2110 / CR 1120 (Clearing)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // Original REPAIR_DEPOSIT journal with DR 1120 (TRANSFER/CARD)
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CLEARING, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '300');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('300') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_DEPOSIT_REFUND);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, debit:  '300' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,         credit: '300' });
  });

  it('H03: deposit=0 → warns, no journal created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const repair = makeRepair({ deposit: new Prisma.Decimal('0') });

    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deposit=0'));
  });

  it('H04: no REPAIR_DEPOSIT journal found → warns, no refund journal created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    jMock.findBySource.mockResolvedValue(null);  // no deposit JE in DB

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no REPAIR_DEPOSIT journal'));
  });

  it('H05: idempotency — JournalService returns {created:false} on duplicate, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });
    // Second call: JournalService signals idempotent hit
    jMock.create.mockResolvedValue({ journal: makeJournal('je-refund'), created: false });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });

    // Call twice — both should resolve without error
    await expect(adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID)).resolves.toBeUndefined();
    await expect(adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID)).resolves.toBeUndefined();
    expect(jMock.create).toHaveBeenCalledTimes(2);
  });

  it('H06: public method swallows internal errors — no rethrow to caller', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.findBySource.mockRejectedValue(new Error('DB connection lost'));

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });

    await expect(
      adapter.recordDepositRefundJournal(repair, TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  it('H07: tenant not in allowlist → no-op, no journal created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'other-tenant';

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter.recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(jMock.findBySource).not.toHaveBeenCalled();
  });

  it('H08: feature flag OFF → complete no-op', async () => {
    // No env vars set
    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter.recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('H09: sourceId is repair.id (not part.id or payment.id)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '150');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ id: 'repair-xyz', deposit: new Prisma.Decimal('150') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceId).toBe('repair-xyz');
  });

  it('H10: tenantId propagated to journal.create', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '100');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const OTHER_TENANT = 'other-t';
    const repair = makeRepair({ deposit: new Prisma.Decimal('100') });
    await adapter._recordDepositRefundJournal(repair, OTHER_TENANT, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.tenantId).toBe(OTHER_TENANT);
  });

  it('H11: findBySource called with REPAIR_DEPOSIT + repair.id + tenantId', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.findBySource).toHaveBeenCalledWith(
      JOURNAL_SOURCE.REPAIR_DEPOSIT, REPAIR_ID, TENANT_ID,
    );
  });

  it('H12: journal balanced — debit = credit = deposit amount', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '500');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('500') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    const totalDebit  = call.lines.reduce((s: number, l: any) => s + Number(l.debit  ?? 0), 0);
    const totalCredit = call.lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
    expect(totalDebit).toBe(500);
    expect(totalCredit).toBe(500);
    expect(totalDebit).toBe(totalCredit);
  });

  it('H13: deposit with parts — refund journal still only DR 2110 / CR 1100, no COGS in refund', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    // Repair with parts — parts do NOT affect deposit refund journal
    const repair = makeRepair({
      deposit: new Prisma.Decimal('200'),
      parts:   [{ id: 'p-111', costPrice: new Prisma.Decimal('80'), quantity: 1, isVoided: false }],
    });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    // Only ONE journal created (the refund) — no COGS reversal
    expect(jMock.create).toHaveBeenCalledTimes(1);
    expect(jMock.create.mock.calls[0][0].sourceType).toBe(JOURNAL_SOURCE.REPAIR_DEPOSIT_REFUND);
  });

  it('H14: deposit journal with no debit line → warns, no refund created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    // Malformed deposit JE with no debit line (should never happen in practice)
    const badDepositJe = { id: 'je-bad', entryNumber: 'JE-BAD', isVoided: false, lines: [] };
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return badDepositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no debit line'));
  });

  it('H15: description contains ticket number', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournalWithLines('je-dep', ACCOUNT_CODES.CASH, ACCOUNT_CODES.CUSTOMER_DEPOSIT, '200');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const repair = makeRepair({ deposit: new Prisma.Decimal('200') });
    await adapter._recordDepositRefundJournal(repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.description).toContain(TICKET);
    expect(call.sourceRef).toBe(TICKET);
  });

  // ── L: COGS reversal (Phase 4B.4L) ──────────────────────────────────────────

  it('L01: COGS reversal — single part with REPAIR_COGS JE → DR 1310 / CR 5200, sourceType=REPAIR_COGS_REVERSAL, sourceId=part.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const cogsJe = makeJournalWithLines('je-cogs', ACCOUNT_CODES.REPAIR_COGS, ACCOUNT_CODES.PARTS_INVENTORY, '150');
    jMock.findBySource.mockImplementation(async (sourceType: string, sourceId: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_COGS && sourceId === PART_ID_1) return cogsJe;
      return null;
    });

    const repair = makeRepair({
      parts: [makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('150'), quantity: 1, isVoided: false })],
    });
    await adapter._recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_COGS_REVERSAL);
    expect(call.sourceId).toBe(PART_ID_1);
    expect(call.tenantId).toBe(TENANT_ID);
    // Original DR 5200 / CR 1310 → reversed: CR 5200 / DR 1310
    expect(call.lines).toMatchObject([
      { accountCode: ACCOUNT_CODES.REPAIR_COGS,     credit: '150' },
      { accountCode: ACCOUNT_CODES.PARTS_INVENTORY, debit:  '150' },
    ]);
  });

  it('L02: COGS reversal — multiple parts → one REPAIR_COGS_REVERSAL journal per part with a COGS JE', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const cogsJe1 = makeJournalWithLines('je-cogs-1', ACCOUNT_CODES.REPAIR_COGS, ACCOUNT_CODES.PARTS_INVENTORY, '200');
    const cogsJe2 = makeJournalWithLines('je-cogs-2', ACCOUNT_CODES.REPAIR_COGS, ACCOUNT_CODES.PARTS_INVENTORY, '75');
    jMock.findBySource.mockImplementation(async (sourceType: string, sourceId: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_COGS && sourceId === PART_ID_1) return cogsJe1;
      if (sourceType === JOURNAL_SOURCE.REPAIR_COGS && sourceId === PART_ID_2) return cogsJe2;
      return null;
    });

    const repair = makeRepair({
      parts: [
        makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('100'), quantity: 2, isVoided: false }),
        makePart({ id: PART_ID_2, costPrice: new Prisma.Decimal('75'),  quantity: 1, isVoided: false }),
      ],
    });
    await adapter._recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(2);
    const sourceIds = jMock.create.mock.calls.map((c) => c[0].sourceId);
    expect(sourceIds).toContain(PART_ID_1);
    expect(sourceIds).toContain(PART_ID_2);
    const sourceTypes = jMock.create.mock.calls.map((c) => c[0].sourceType);
    sourceTypes.forEach((t) => expect(t).toBe(JOURNAL_SOURCE.REPAIR_COGS_REVERSAL));
  });

  it('L03: COGS reversal — no REPAIR_COGS JE found for a part → skip without creating reversal journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(null);

    const repair = makeRepair({
      parts: [makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('150'), quantity: 1 })],
    });
    await adapter._recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('L04: COGS reversal — voided part (isVoided=true) with existing REPAIR_COGS JE → still reverses', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const cogsJe = makeJournalWithLines('je-cogs', ACCOUNT_CODES.REPAIR_COGS, ACCOUNT_CODES.PARTS_INVENTORY, '120');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_COGS) return cogsJe;
      return null;
    });

    const repair = makeRepair({
      parts: [makePart({ id: PART_ID_1, costPrice: new Prisma.Decimal('120'), quantity: 1, isVoided: true })],
    });
    await adapter._recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    // Voided parts are NOT skipped — their historical COGS must still be reversed
    expect(jMock.create).toHaveBeenCalledTimes(1);
    expect(jMock.create.mock.calls[0][0].sourceType).toBe(JOURNAL_SOURCE.REPAIR_COGS_REVERSAL);
    expect(jMock.create.mock.calls[0][0].sourceId).toBe(PART_ID_1);
  });

  it('L05: COGS reversal — no parts → no journals created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';

    const repair = makeRepair({ parts: [] });
    await adapter._recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.findBySource).not.toHaveBeenCalled();
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('L06: COGS reversal — public wrapper swallows errors, does not rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.findBySource.mockRejectedValue(new Error('DB timeout'));

    const repair = makeRepair({
      parts: [makePart({ id: PART_ID_1 })],
    });
    await expect(
      adapter.recordCogsReversalJournal(repair, TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  it('L07: COGS reversal — tenant not in allowlist → no-op', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'other-tenant';

    const repair = makeRepair({ parts: [makePart({ id: PART_ID_1 })] });
    await adapter.recordCogsReversalJournal(repair, TENANT_ID, USER_ID);

    expect(jMock.findBySource).not.toHaveBeenCalled();
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('L08: COGS reversal — idempotent: JournalService returns {created:false}, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const cogsJe = makeJournalWithLines('je-cogs', ACCOUNT_CODES.REPAIR_COGS, ACCOUNT_CODES.PARTS_INVENTORY, '150');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_COGS) return cogsJe;
      return null;
    });
    jMock.create.mockResolvedValue({ journal: makeJournal('je-rev'), created: false });

    const repair = makeRepair({ parts: [makePart({ id: PART_ID_1 })] });

    await expect(adapter._recordCogsReversalJournal(repair, TENANT_ID)).resolves.toBeUndefined();
    await expect(adapter._recordCogsReversalJournal(repair, TENANT_ID)).resolves.toBeUndefined();
    expect(jMock.create).toHaveBeenCalledTimes(2);  // both calls hit create; idempotency inside JournalService
  });

  // ── L: Additional payment reversal (Phase 4B.4L) ─────────────────────────────

  it('L09: additional payment reversal — CASH → DR 1200 / CR 1100 (swapped from original DR 1100 / CR 1200)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // Original REPAIR_ADDITIONAL_PAYMENT: DR 1100 / CR 1200
    const addlJe = makeJournalWithLines('je-addl', ACCOUNT_CODES.CASH, ACCOUNT_CODES.REPAIR_AR, '300');
    jMock.findBySource.mockImplementation(async (sourceType: string, sourceId: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT && sourceId === PMT_ID) return addlJe;
      return null;
    });

    const payment = makePayment({ id: PMT_ID, amount: new Prisma.Decimal('300'), paymentMethod: 'CASH' });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };
    await adapter._recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT_REVERSAL);
    expect(call.sourceId).toBe(PMT_ID);
    expect(call.tenantId).toBe(TENANT_ID);
    // Original DR 1100 / CR 1200 → reversed: CR 1100 / DR 1200
    expect(call.lines).toMatchObject([
      { accountCode: ACCOUNT_CODES.CASH,      credit: '300' },
      { accountCode: ACCOUNT_CODES.REPAIR_AR, debit:  '300' },
    ]);
  });

  it('L10: additional payment reversal — TRANSFER → CR 1120 / DR 1200', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const addlJe = makeJournalWithLines('je-addl', ACCOUNT_CODES.CLEARING, ACCOUNT_CODES.REPAIR_AR, '500');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT) return addlJe;
      return null;
    });

    const payment = makePayment({ id: PMT_ID, amount: new Prisma.Decimal('500'), paymentMethod: 'TRANSFER' });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };
    await adapter._recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines).toMatchObject([
      { accountCode: ACCOUNT_CODES.CLEARING,  credit: '500' },
      { accountCode: ACCOUNT_CODES.REPAIR_AR, debit:  '500' },
    ]);
  });

  it('L11: additional payment reversal — no REPAIR_ADDITIONAL_PAYMENT JE found → warns, no reversal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    jMock.findBySource.mockResolvedValue(null);

    const payment = makePayment({ id: PMT_ID });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };
    await adapter._recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no REPAIR_ADDITIONAL_PAYMENT journal'));
  });

  it('L12: additional payment reversal — public wrapper swallows errors, does not rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.findBySource.mockRejectedValue(new Error('DB timeout'));

    const payment = makePayment({ id: PMT_ID });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };
    await expect(
      adapter.recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  it('L13: additional payment reversal — idempotent: JournalService returns {created:false}, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const addlJe = makeJournalWithLines('je-addl', ACCOUNT_CODES.CASH, ACCOUNT_CODES.REPAIR_AR, '300');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT) return addlJe;
      return null;
    });
    jMock.create.mockResolvedValue({ journal: makeJournal('je-rev'), created: false });

    const payment = makePayment({ id: PMT_ID });
    const repair  = { id: REPAIR_ID, ticketNumber: TICKET, branchId: BRANCH_ID };

    await expect(adapter._recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID)).resolves.toBeUndefined();
    await expect(adapter._recordAdditionalPaymentReversalJournal(payment, repair, TENANT_ID)).resolves.toBeUndefined();
    expect(jMock.create).toHaveBeenCalledTimes(2);
  });

  it('all create calls carry the correct tenantId', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const depositJe = makeJournal('je-dep');
    jMock.findBySource.mockImplementation(async (sourceType: string) => {
      if (sourceType === JOURNAL_SOURCE.REPAIR_DEPOSIT) return depositJe;
      return null;
    });

    const part   = makePart({ id: 'p-x', costPrice: new Prisma.Decimal('80'), quantity: 1 });
    const repair = makeRepair({ deposit: new Prisma.Decimal('100'), paidAmount: new Prisma.Decimal('400'), parts: [part] });

    await adapter._recordFinalPaymentJournal(repair, TENANT_ID, USER_ID);

    for (const call of jMock.create.mock.calls) {
      expect(call[0].tenantId).toBe(TENANT_ID);
    }
  });
});
