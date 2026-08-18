import { Prisma } from '@prisma/client';
import {
  ExpenseAccountingAdapter,
  ExpenseForAccounting,
  expenseAccountCode,
} from './expense-accounting.adapter';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';
import { JOURNAL_SOURCE } from '../journal/journal.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-exp-1';
const BRANCH_ID  = 'branch-1';
const USER_ID    = 'user-1';
const EXPENSE_ID = 'exp-abc';

function makeExpense(overrides?: Partial<ExpenseForAccounting>): ExpenseForAccounting {
  return {
    id:            EXPENSE_ID,
    description:   'ค่าเช่าร้าน เดือนสิงหาคม',
    amount:        new Prisma.Decimal('3000'),
    paymentMethod: 'CASH',
    branchId:      BRANCH_ID,
    category:      { code: 'rent' },
    ...overrides,
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

function makeAdapter(jMock: JMock): ExpenseAccountingAdapter {
  return new ExpenseAccountingAdapter(jMock as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExpenseAccountingAdapter', () => {
  let jMock:   JMock;
  let adapter: ExpenseAccountingAdapter;

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

  // ── A: Cash expense ───────────────────────────────────────────────────────

  it('A: CASH expense → DR 6100 OperatingExpense / CR 1100 Cash', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ paymentMethod: 'CASH', category: { code: 'rent' } });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.EXPENSE_PAYMENT);
    expect(call.sourceId).toBe(EXPENSE_ID);
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, debit:  '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,              credit: '3000' });
  });

  // ── B: Transfer expense ───────────────────────────────────────────────────

  it('B: TRANSFER expense → DR 6100 / CR 1120 Clearing', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ paymentMethod: 'TRANSFER', category: { code: 'utilities' } });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, debit:  '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,          credit: '3000' });
  });

  // ── C: Card expense ───────────────────────────────────────────────────────

  it('C: CARD expense → DR 6100 / CR 1120 Clearing', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ paymentMethod: 'CARD', category: { code: 'supplies' } });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING, credit: '3000' });
  });

  // ── D: Category mapping — misc → 6200 ────────────────────────────────────

  it('D: category code "misc" → DR 6200 OtherExpenses', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ category: { code: 'misc' }, paymentMethod: 'CASH' });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.OTHER_EXPENSE, debit: '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,          credit: '3000' });
  });

  // ── D2-D8: All named categories → 6100 ───────────────────────────────────

  it.each([
    ['rent',        'ค่าเช่า'],
    ['utilities',   'ค่าไฟ'],
    ['salary',      'เงินเดือน'],
    ['marketing',   'การตลาด'],
    ['supplies',    'อุปกรณ์'],
    ['maintenance', 'ซ่อมบำรุง'],
    ['shipping',    'ค่าส่ง'],
  ])('D-named: category "%s" → 6100 Operating Expenses', async (code) => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ category: { code }, paymentMethod: 'CASH' });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, debit: '3000' });
  });

  // ── E: expenseAccountCode helper ─────────────────────────────────────────

  it('E: expenseAccountCode("misc") === 6200', () => {
    expect(expenseAccountCode('misc')).toBe(ACCOUNT_CODES.OTHER_EXPENSE);
  });

  it('E2: expenseAccountCode("rent") === 6100', () => {
    expect(expenseAccountCode('rent')).toBe(ACCOUNT_CODES.OPERATING_EXPENSE);
  });

  it('E3: expenseAccountCode(null) falls back to 6100', () => {
    expect(expenseAccountCode(null)).toBe(ACCOUNT_CODES.OPERATING_EXPENSE);
  });

  it('E4: expenseAccountCode(undefined) falls back to 6100', () => {
    expect(expenseAccountCode(undefined)).toBe(ACCOUNT_CODES.OPERATING_EXPENSE);
  });

  it('E5: unknown custom category code → 6100', () => {
    expect(expenseAccountCode('custom-tenant-category')).toBe(ACCOUNT_CODES.OPERATING_EXPENSE);
  });

  // ── F: null category ─────────────────────────────────────────────────────

  it('F: category=null → falls back to 6100 Operating Expenses', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ category: null, paymentMethod: 'CASH' });

    await adapter._recordExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, debit: '3000' });
  });

  // ── G: Missing account ────────────────────────────────────────────────────

  it('G: missing account — journal.create throws NotFoundException → caught, no rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.create.mockRejectedValue(new Error('account code "6100" not found for tenant'));

    await expect(
      adapter.recordExpenseJournal(makeExpense(), TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── H: Inactive account ───────────────────────────────────────────────────

  it('H: inactive account — ConflictException caught by public method', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.create.mockRejectedValue(new Error('account "6100" is inactive'));

    await expect(
      adapter.recordExpenseJournal(makeExpense(), TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── I: Invalid tenant (flag off / not in allowlist) ───────────────────────

  it('I: feature flag OFF → all public methods are no-ops', async () => {
    // flag not set
    await adapter.recordExpenseJournal(makeExpense(), TENANT_ID);
    await adapter.reverseExpenseJournal(makeExpense(), TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(jMock.findBySource).not.toHaveBeenCalled();
  });

  it('I2: flag ON, tenant absent from allowlist → no journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'pilot-only';

    await adapter.recordExpenseJournal(makeExpense(), TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  // ── J: Cross-tenant isolation ─────────────────────────────────────────────

  it('J: tenantId is passed through to every journal.create call', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const customTenant = 'tenant-x-isolated';

    await adapter._recordExpenseJournal(makeExpense(), customTenant, USER_ID);

    expect(jMock.create.mock.calls[0][0].tenantId).toBe(customTenant);
  });

  it('J2: "*" sentinel → all tenants enabled', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '*';

    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(true);
    expect(adapter.isEnabledForTenant('any-other-tenant')).toBe(true);
  });

  // ── K: Zero amount ────────────────────────────────────────────────────────

  it('K: amount=0 → warns and creates no journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const expense = makeExpense({ amount: new Prisma.Decimal('0') });

    await adapter._recordExpenseJournal(expense, TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amount=0'));
  });

  // ── L: Negative amount ────────────────────────────────────────────────────

  it('L: negative amount → treated as non-positive, skipped with warning', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const expense = makeExpense({ amount: new Prisma.Decimal('-500') });

    await adapter._recordExpenseJournal(expense, TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  // ── M: Idempotency ────────────────────────────────────────────────────────

  it('M: idempotency — journal.create returns {created:false} on duplicate, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    const expense = makeExpense();

    await expect(adapter._recordExpenseJournal(expense, TENANT_ID)).resolves.toBeUndefined();
    await expect(adapter._recordExpenseJournal(expense, TENANT_ID)).resolves.toBeUndefined();

    expect(jMock.create).toHaveBeenCalledTimes(2);
  });

  // ── L2: Concurrent duplicate ──────────────────────────────────────────────

  it('L2: concurrent duplicate — {created:false} returned (P2002 recovered by JournalService), no throw', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    await expect(
      adapter.recordExpenseJournal(makeExpense(), TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── N: Reversal ───────────────────────────────────────────────────────────

  it('N: reversal — finds EXPENSE_PAYMENT journal, creates EXPENSE_REVERSAL with swapped accounts', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const originalJe = makeJournal('je-orig');
    jMock.findBySource.mockResolvedValue(originalJe);

    const expense = makeExpense({ paymentMethod: 'CASH', category: { code: 'rent' } });

    await adapter._reverseExpenseJournal(expense, TENANT_ID, USER_ID);

    expect(jMock.findBySource).toHaveBeenCalledWith(
      JOURNAL_SOURCE.EXPENSE_PAYMENT, EXPENSE_ID, TENANT_ID,
    );
    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.EXPENSE_REVERSAL);
    expect(call.sourceId).toBe(EXPENSE_ID);
    // Reversal swaps: DR cash/clearing, CR expense account
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,              debit:  '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, credit: '3000' });
  });

  it('N2: reversal of misc expense → DR 1100 / CR 6200', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(makeJournal('je-misc'));

    const expense = makeExpense({ category: { code: 'misc' }, paymentMethod: 'CASH' });

    await adapter._reverseExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,          debit:  '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.OTHER_EXPENSE,  credit: '3000' });
  });

  it('N3: reversal of TRANSFER expense → DR 1120 Clearing / CR 6100', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(makeJournal('je-xfer'));

    const expense = makeExpense({ paymentMethod: 'TRANSFER', category: { code: 'salary' } });

    await adapter._reverseExpenseJournal(expense, TENANT_ID, USER_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,          debit:  '3000' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.OPERATING_EXPENSE, credit: '3000' });
  });

  it('N4: reversal — no prior EXPENSE_PAYMENT journal → warns, no create', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(null);
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});

    await expect(
      adapter._reverseExpenseJournal(makeExpense(), TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no EXPENSE_PAYMENT journal'));
  });

  it('N5: reversal failure caught by public method — no rethrow', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;
    jMock.findBySource.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      adapter.reverseExpenseJournal(makeExpense(), TENANT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  // ── O: Source ID determinism ──────────────────────────────────────────────

  it('O: EXPENSE_PAYMENT sourceId = Expense.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ id: 'exp-specific-999' });

    await adapter._recordExpenseJournal(expense, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.EXPENSE_PAYMENT);
    expect(call.sourceId).toBe('exp-specific-999');
  });

  it('O2: EXPENSE_REVERSAL sourceId = Expense.id (same id, different sourceType)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(makeJournal('je-orig'));

    const expense = makeExpense({ id: 'exp-specific-999' });

    await adapter._reverseExpenseJournal(expense, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe(JOURNAL_SOURCE.EXPENSE_REVERSAL);
    expect(call.sourceId).toBe('exp-specific-999');
  });

  // ── Reversal idempotency ──────────────────────────────────────────────────

  it('reversal idempotency — second call {created:false}, no duplicate', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(makeJournal('je-orig'));
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    const expense = makeExpense();

    await expect(adapter._reverseExpenseJournal(expense, TENANT_ID)).resolves.toBeUndefined();
    await expect(adapter._reverseExpenseJournal(expense, TENANT_ID)).resolves.toBeUndefined();

    expect(jMock.create).toHaveBeenCalledTimes(2);
  });

  // ── Balance verification ──────────────────────────────────────────────────

  it('balance: SUM(debit) === SUM(credit) for expense payment journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ amount: new Prisma.Decimal('1234.56') });

    await adapter._recordExpenseJournal(expense, TENANT_ID);

    const { lines } = jMock.create.mock.calls[0][0] as { lines: Array<{ debit?: string; credit?: string }> };
    const totalDebit  = lines.reduce((s, l) => s + parseFloat(l.debit  ?? '0'), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit ?? '0'), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  it('balance: SUM(debit) === SUM(credit) for expense reversal journal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(makeJournal('je-orig'));
    const expense = makeExpense({ amount: new Prisma.Decimal('750') });

    await adapter._reverseExpenseJournal(expense, TENANT_ID);

    const { lines } = jMock.create.mock.calls[0][0] as { lines: Array<{ debit?: string; credit?: string }> };
    const totalDebit  = lines.reduce((s, l) => s + parseFloat(l.debit  ?? '0'), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit ?? '0'), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  // ── branchId propagation ──────────────────────────────────────────────────

  it('branchId=null — adapter still creates journal (branchId=null passed through)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const expense = makeExpense({ branchId: null });

    await adapter._recordExpenseJournal(expense, TENANT_ID);

    expect(jMock.create.mock.calls[0][0].branchId).toBeNull();
  });
});
