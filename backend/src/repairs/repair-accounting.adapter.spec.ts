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

function makeAdapter(jMock: JMock): RepairAccountingAdapter {
  return new RepairAccountingAdapter(jMock as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RepairAccountingAdapter', () => {
  let jMock:   JMock;
  let adapter: RepairAccountingAdapter;

  beforeEach(() => {
    jMock   = makeJournalMock();
    adapter = makeAdapter(jMock);
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

    expect(jMock.create).not.toHaveBeenCalled();
    expect(jMock.findBySource).not.toHaveBeenCalled();
  });

  it('K3: "*" sentinel → enabled for any tenant', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '*';

    expect(adapter.isEnabledForTenant('any-tenant')).toBe(true);
    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(true);
  });

  // ── L: Inactive account rejection ────────────────────────────────────────

  it('L: inactive account — journal.create throws ConflictException → caught by public method', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
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
