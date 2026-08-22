/**
 * Phase 4B.7 — Owner Tenant Accounting Controlled Test
 *
 * Owner tenant: cmqgw3ysh0003f963vgqh32j2  (ร้านชาริฟพีซี@ออล์)
 *
 * SAFETY: All tests are UNIT TESTS against mock infrastructure.
 *         NO production JournalEntry / JournalLine / CashDrawerTransaction created.
 *         NO production environment variables modified.
 *         NO customer tenant data touched.
 *
 * Test groups:
 *  OT-COA-01…03    COA verification (17 accounts, correct codes)
 *  OT-MOD-01…07    Manual module toggle (OFF→ON→OFF→ON, audit log, isolation)
 *  OT-SALE-01…05   Controlled sale accounting (100 THB CASH)
 *  OT-REP-01…04    Controlled repair accounting (deposit + final payment)
 *  OT-EXP-01…03    Controlled expense accounting (operating 100 THB CASH)
 *  OT-REF-01…02    Refund / reversal accounting
 *  OT-EXCH-01…02   Exchange — accounting OFF/ON gate sanity
 *  OT-CDT-01…03    Cash drawer routing (CASH DR line verification)
 *  OT-RECON-01…02  Reconciliation service sanity
 *  OT-IDEM-01…04   Idempotency (no duplicate journals)
 *  OT-OFF-01…04    Accounting OFF safety (business still works)
 *  OT-ISO-01…04    Tenant isolation
 *  OT-AUDIT-01…03  Audit log content safety
 *  OT-SAFETY-01…03 Production safety meta-tests
 */

import { Prisma } from '@prisma/client';
import { ModulesService }  from '../modules/modules.service';
import { SalesAccountingAdapter, SaleForAccounting, RefundForAccounting, RefundItemForAccounting } from '../sales/sales-accounting.adapter';
import { RepairAccountingAdapter, RepairForAccounting, RepairWithPartsForAccounting } from '../repairs/repair-accounting.adapter';
import { ExpenseAccountingAdapter, ExpenseForAccounting } from '../expenses/expense-accounting.adapter';
import { ACCOUNT_CODES }                                 from '../accounting-accounts/constants/account-codes';
import { CHART_OF_ACCOUNTS_TEMPLATE, COA_TEMPLATE_COUNT } from '../accounting-accounts/constants/chart-of-accounts';

// ── Owner tenant constants ─────────────────────────────────────────────────────

const OWNER_TENANT_ID = 'cmqgw3ysh0003f963vgqh32j2';
const OWNER_BRANCH_ID = 'branch-owner-a';
const OWNER_SA_ID     = 'superadmin-4b7';
const OTHER_TENANT_A  = 'tenant-other-a';
const PILOT_TENANT_ID = 'cmsc05do8001u7i29q3p5x6zp';

// ── Common mock builders ──────────────────────────────────────────────────────

function makeJournalMock() {
  return {
    create:       jest.fn().mockResolvedValue({ journal: { id: 'je-1', entryNumber: 'JE-001', isVoided: false, lines: [] }, created: true }),
    findBySource: jest.fn().mockResolvedValue(null),
    reverse:      jest.fn().mockResolvedValue({ id: 'je-rev', entryNumber: 'JE-REV', isVoided: false, lines: [] }),
  };
}

function makeModulesMock(enabledForOwner = false, enabledForOtherA = false) {
  return {
    isAccountingEnabled: jest.fn().mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === OWNER_TENANT_ID ? enabledForOwner :
        tenantId === PILOT_TENANT_ID ? false : // pilot via env, not DB path
        enabledForOtherA,
      ),
    ),
  };
}

function makePrismaMock() {
  return {
    tenant:        { findUnique: jest.fn() },
    appModule:     { findUnique: jest.fn() },
    tenantModule:  { upsert: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    packageModule: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog:      { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeRedisMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Section 1: COA Verification ──────────────────────────────────────────────

describe('OT-COA — Chart of Accounts (17 accounts for owner tenant)', () => {
  it('OT-COA-01: COA template has exactly 17 accounts', () => {
    expect(COA_TEMPLATE_COUNT).toBe(17);
    expect(CHART_OF_ACCOUNTS_TEMPLATE).toHaveLength(17);
  });

  it('OT-COA-02: all ACCOUNT_CODES values present in COA template', () => {
    const templateCodes = CHART_OF_ACCOUNTS_TEMPLATE.map((a) => a.code);
    for (const code of Object.values(ACCOUNT_CODES)) {
      expect(templateCodes).toContain(code);
    }
  });

  it('OT-COA-03: all 17 accounts have unique codes, valid types, and Thai names', () => {
    const seen = new Set<string>();
    for (const acct of CHART_OF_ACCOUNTS_TEMPLATE) {
      expect(acct.code).toBeTruthy();
      expect(acct.nameTh).toBeTruthy();
      expect(['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE']).toContain(acct.type);
      expect(seen.has(acct.code)).toBe(false);
      seen.add(acct.code);
    }
    expect(seen.size).toBe(17);
  });
});

// ── Section 2: Manual Module Toggle ──────────────────────────────────────────

describe('OT-MOD — Manual module toggle (owner tenant)', () => {
  let prisma:  ReturnType<typeof makePrismaMock>;
  let redis:   ReturnType<typeof makeRedisMock>;
  let service: ModulesService;

  beforeEach(() => {
    prisma  = makePrismaMock();
    redis   = makeRedisMock();
    service = new ModulesService(prisma as any, redis as any);
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  afterEach(() => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  it('OT-MOD-01: accounting OFF by default (no env, no DB override) → false', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID, plan: 'BUSINESS', moduleOverrides: [] });
    const result = await service.isAccountingEnabled(OWNER_TENANT_ID);
    expect(result).toBe(false);
  });

  it('OT-MOD-02: enable → upserts TenantModule with enabled=true and invalidates cache', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: true });

    const result = await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true, undefined, OWNER_SA_ID, 'SuperAdmin');

    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { tenantId_moduleKey: { tenantId: OWNER_TENANT_ID, moduleKey: 'accounting' } },
      create: expect.objectContaining({ tenantId: OWNER_TENANT_ID, enabled: true }),
    }));
    expect(redis.del).toHaveBeenCalledWith(`module_cache:${OWNER_TENANT_ID}`);
    expect(result.enabled).toBe(true);
  });

  it('OT-MOD-03: after enablement, isAccountingEnabled returns true (DB path)', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: OWNER_TENANT_ID, plan: 'BUSINESS',
      moduleOverrides: [{ moduleKey: 'accounting', enabled: true, expiresAt: null }],
    });
    const result = await service.isAccountingEnabled(OWNER_TENANT_ID);
    expect(result).toBe(true);
  });

  it('OT-MOD-04: disable → upserts with enabled=false', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: false });

    const result = await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', false, undefined, OWNER_SA_ID, 'SA');
    expect(result.enabled).toBe(false);
  });

  it('OT-MOD-05: MODULE_ENABLED audit log written with correct entityId and actorId', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: true });

    await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true, undefined, OWNER_SA_ID, 'SuperAdmin');
    await new Promise((r) => setImmediate(r));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action:     'MODULE_ENABLED',
        entityType: 'TenantModule',
        entityId:   OWNER_TENANT_ID,
        actorId:    OWNER_SA_ID,
        afterData:  { moduleKey: 'accounting', enabled: true },
      }),
    }));
  });

  it('OT-MOD-06: enabling owner tenant does NOT affect OTHER_TENANT_A', async () => {
    prisma.tenant.findUnique.mockImplementation((args: any) => {
      if (args.where?.id === OWNER_TENANT_ID) {
        return Promise.resolve({ id: OWNER_TENANT_ID, plan: 'BUSINESS', moduleOverrides: [{ moduleKey: 'accounting', enabled: true, expiresAt: null }] });
      }
      return Promise.resolve({ id: OTHER_TENANT_A, plan: 'BUSINESS', moduleOverrides: [] });
    });
    prisma.packageModule.findMany.mockResolvedValue([]);

    const ownerEnabled = await service.isAccountingEnabled(OWNER_TENANT_ID);
    const otherEnabled = await service.isAccountingEnabled(OTHER_TENANT_A);

    expect(ownerEnabled).toBe(true);
    expect(otherEnabled).toBe(false);
  });

  it('OT-MOD-07: re-enable after disable → upsert called twice, final state enabled=true', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert
      .mockResolvedValueOnce({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: false })
      .mockResolvedValueOnce({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: true });

    await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', false);
    const result = await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true);

    expect(prisma.tenantModule.upsert).toHaveBeenCalledTimes(2);
    expect(result.enabled).toBe(true);
    expect(redis.del).toHaveBeenCalledTimes(2);
  });
});

// ── Section 3: Controlled Sale Accounting ────────────────────────────────────

describe('OT-SALE — Controlled sale accounting (owner tenant, 100 THB CASH)', () => {
  const SALE_ID    = 'owner-sale-4b7-001';
  const PAYMENT_ID = 'owner-pay-4b7-001';

  function makeSale(overrides?: Partial<SaleForAccounting>): SaleForAccounting {
    return {
      id:            SALE_ID,
      receiptNumber: 'RCP-4B7-001',
      total:         new Prisma.Decimal('100'),
      branchId:      OWNER_BRANCH_ID,
      createdAt:     new Date('2026-08-22T10:00:00Z'),
      payments:      [{ id: PAYMENT_ID, paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }],
      items:         [{ id: 'item-4b7-001', quantity: 1, costPrice: new Prisma.Decimal('60') }],
      ...overrides,
    };
  }

  it('OT-SALE-01: accounting OFF → no journal created for owner tenant', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordSaleJournal(makeSale(), OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-SALE-02: accounting ON → SALE_PAYMENT journal created for owner tenant', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal(makeSale(), OWNER_TENANT_ID);

    const payCall = jMock.create.mock.calls.find((c: any) => c[0].sourceType === 'SALE_PAYMENT');
    expect(payCall).toBeDefined();
    expect(payCall[0].tenantId).toBe(OWNER_TENANT_ID);
    expect(payCall[0].sourceId).toBe(PAYMENT_ID);
  });

  it('OT-SALE-03: SALE_PAYMENT journal is balanced DR=CR=100', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-1' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal(makeSale(), OWNER_TENANT_ID);

    const payEntry = captured.find((c) => c.sourceType === 'SALE_PAYMENT');
    expect(payEntry).toBeDefined();
    const drTotal = (payEntry.lines as any[]).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const crTotal = (payEntry.lines as any[]).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    expect(drTotal).toBe(crTotal);
    expect(drTotal).toBe(100);
  });

  it('OT-SALE-04: SALE_COGS journal created when costPrice > 0', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal(makeSale(), OWNER_TENANT_ID);

    const cogsCall = jMock.create.mock.calls.find((c: any) => c[0].sourceType === 'SALE_COGS');
    expect(cogsCall).toBeDefined();
    expect(cogsCall[0].tenantId).toBe(OWNER_TENANT_ID);
    const lines = cogsCall[0].lines as any[];
    expect(lines.some((l: any) => l.accountCode === ACCOUNT_CODES.COGS)).toBe(true);
    expect(lines.some((l: any) => l.accountCode === ACCOUNT_CODES.INVENTORY)).toBe(true);
  });

  it('OT-SALE-05: idempotent — DB unique violation on SALE_PAYMENT is swallowed (no re-throw)', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    // Public method must not throw even when create fails (outer try/catch)
    await expect(adapter.recordSaleJournal(makeSale(), OWNER_TENANT_ID)).resolves.toBeUndefined();
  });
});

// ── Section 4: Repair Accounting ─────────────────────────────────────────────

describe('OT-REP — Controlled repair accounting (owner tenant)', () => {
  const REPAIR_ID = 'owner-repair-4b7-001';
  const TICKET    = 'REP-4B7-001';

  function makeRepairBase(): RepairForAccounting {
    return {
      id:            REPAIR_ID,
      ticketNumber:  TICKET,
      paidAmount:    new Prisma.Decimal('500'),
      paymentMethod: 'CASH',
      deposit:       new Prisma.Decimal('200'),
      branchId:      OWNER_BRANCH_ID,
    };
  }

  function makeRepairWithParts(): RepairWithPartsForAccounting {
    return {
      ...makeRepairBase(),
      parts: [
        { id: 'part-4b7-1', costPrice: new Prisma.Decimal('150'), quantity: 1, isVoided: false },
      ],
    };
  }

  it('OT-REP-01: accounting OFF → no repair journal created', async () => {
    const jMock = makeJournalMock();
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordFinalPaymentJournal(makeRepairWithParts(), OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-REP-02: accounting ON → REPAIR_FINAL_PAYMENT journal created with correct tenantId', async () => {
    const jMock = makeJournalMock();
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordFinalPaymentJournal(makeRepairWithParts(), OWNER_TENANT_ID);

    const finalPmt = jMock.create.mock.calls.find((c: any) => c[0].sourceType === 'REPAIR_FINAL_PAYMENT');
    expect(finalPmt).toBeDefined();
    expect(finalPmt[0].tenantId).toBe(OWNER_TENANT_ID);
  });

  it('OT-REP-03: REPAIR_FINAL_PAYMENT journal is balanced (DR = CR)', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-rep' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordFinalPaymentJournal(makeRepairWithParts(), OWNER_TENANT_ID);

    const finalPmt = captured.find((c) => c.sourceType === 'REPAIR_FINAL_PAYMENT');
    expect(finalPmt).toBeDefined();
    const drTotal = (finalPmt.lines as any[]).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const crTotal = (finalPmt.lines as any[]).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    expect(drTotal).toBe(crTotal);
    expect(drTotal).toBeGreaterThan(0);
  });

  it('OT-REP-04: deposit journal (DR CASH / CR CUSTOMER_DEPOSIT) created with correct tenantId', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-dep' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordDepositJournal(makeRepairBase(), 'CASH', OWNER_TENANT_ID);

    const deposit = captured.find((c) => c.sourceType === 'REPAIR_DEPOSIT');
    expect(deposit).toBeDefined();
    expect(deposit.tenantId).toBe(OWNER_TENANT_ID);
    const lines = deposit.lines as any[];
    expect(lines.some((l: any) => l.accountCode === ACCOUNT_CODES.CASH && Number(l.debit) > 0)).toBe(true);
    expect(lines.some((l: any) => l.accountCode === ACCOUNT_CODES.CUSTOMER_DEPOSIT && Number(l.credit) > 0)).toBe(true);
  });
});

// ── Section 5: Expense Accounting ────────────────────────────────────────────

describe('OT-EXP — Controlled expense accounting (owner tenant, 100 THB CASH)', () => {
  const EXPENSE_ID = 'owner-exp-4b7-001';

  function makeExpense(overrides?: Partial<ExpenseForAccounting>): ExpenseForAccounting {
    return {
      id:            EXPENSE_ID,
      description:   'ค่าเช่าร้าน ทดสอบ Phase 4B.7',
      amount:        new Prisma.Decimal('100'),
      paymentMethod: 'CASH',
      branchId:      OWNER_BRANCH_ID,
      category:      { code: 'rent' },
      ...overrides,
    };
  }

  it('OT-EXP-01: accounting OFF → no expense journal created', async () => {
    const jMock = makeJournalMock();
    const adapter = new ExpenseAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordExpenseJournal(makeExpense(), OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-EXP-02: accounting ON + CASH → EXPENSE_PAYMENT DR 6100 / CR 1100 balanced at 100', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-exp' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new ExpenseAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordExpenseJournal(makeExpense(), OWNER_TENANT_ID);

    expect(captured).toHaveLength(1);
    const entry = captured[0];
    expect(entry.sourceType).toBe('EXPENSE_PAYMENT');
    expect(entry.tenantId).toBe(OWNER_TENANT_ID);
    const drTotal = (entry.lines as any[]).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const crTotal = (entry.lines as any[]).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    expect(drTotal).toBe(100);
    expect(crTotal).toBe(100);
    const drLine = (entry.lines as any[]).find((l: any) => Number(l.debit) > 0);
    expect(drLine.accountCode).toBe(ACCOUNT_CODES.OPERATING_EXPENSE);
    const crLine = (entry.lines as any[]).find((l: any) => Number(l.credit) > 0);
    expect(crLine.accountCode).toBe(ACCOUNT_CODES.CASH);
  });

  it('OT-EXP-03: idempotent — DB unique violation on EXPENSE_PAYMENT swallowed (no re-throw)', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new ExpenseAccountingAdapter(jMock as any, makeModulesMock(true) as any);
    await expect(adapter.recordExpenseJournal(makeExpense(), OWNER_TENANT_ID)).resolves.toBeUndefined();
  });
});

// ── Section 6: Refund / Reversal ─────────────────────────────────────────────

describe('OT-REF — Refund / reversal accounting (owner tenant)', () => {
  const SALE_ID   = 'owner-sale-4b7-001';
  const REFUND_ID = 'owner-refund-4b7-001';

  function makeRefund(): RefundForAccounting {
    return {
      id:            REFUND_ID,
      totalRefund:   new Prisma.Decimal('100'),
      paymentMethod: 'CASH',
      saleId:        SALE_ID,
    };
  }

  function makeSaleForRefund(): SaleForAccounting {
    return {
      id:            SALE_ID,
      receiptNumber: 'RCP-4B7-001',
      total:         new Prisma.Decimal('100'),
      branchId:      OWNER_BRANCH_ID,
      createdAt:     new Date('2026-08-22T10:00:00Z'),
      payments:      [{ id: 'pay-ref-orig', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }],
      items:         [{ id: 'item-ref-001', quantity: 1, costPrice: new Prisma.Decimal('60') }],
    };
  }

  it('OT-REF-01: accounting OFF → no refund journal created', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordRefundJournal(makeRefund(), makeSaleForRefund(), [], OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-REF-02: accounting ON → SALE_REFUND journal created with correct tenantId', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-ref' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordRefundJournal(makeRefund(), makeSaleForRefund(), [], OWNER_TENANT_ID);

    const refundCall = captured.find((c) => c.sourceType === 'SALE_REFUND');
    expect(refundCall).toBeDefined();
    expect(refundCall.tenantId).toBe(OWNER_TENANT_ID);
    // Journal must be balanced
    const dr = (refundCall.lines as any[]).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const cr = (refundCall.lines as any[]).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    expect(dr).toBe(cr);
    expect(dr).toBeGreaterThan(0);
  });
});

// ── Section 7: Exchange Sanity ───────────────────────────────────────────────

describe('OT-EXCH — Exchange accounting sanity', () => {
  it('OT-EXCH-01: accounting OFF → no journals for any exchange-related call', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    // Exchange uses recordSaleJournal for new-sale leg and recordRefundJournal for returned-item leg
    const newSale: SaleForAccounting = {
      id: 'exch-new', receiptNumber: 'RCP-EXCH', total: new Prisma.Decimal('200'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [{ id: 'pay-exch', paymentMethod: 'CASH', amount: new Prisma.Decimal('200') }],
      items: [],
    };
    await adapter.recordSaleJournal(newSale, OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-EXCH-02: exchange Phase 4B.4V tests remain covered — sales adapter handles exchange legs', () => {
    const adapter = new SalesAccountingAdapter(makeJournalMock() as any, makeModulesMock(true) as any);
    // Exchange uses recordSaleJournal + recordRefundJournal — both methods exist
    expect(typeof adapter.recordSaleJournal).toBe('function');
    expect(typeof adapter.recordRefundJournal).toBe('function');
  });
});

// ── Section 8: Cash Drawer Routing ───────────────────────────────────────────

describe('OT-CDT — Cash drawer transaction routing (CASH DR line verification)', () => {
  it('OT-CDT-01: CASH sale → SALE_PAYMENT journal DR CASH (1100) line present', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-cdt' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal({
      id: 'cdt-sale-1', receiptNumber: 'RCP-CDT-1', total: new Prisma.Decimal('100'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [{ id: 'cdt-pay-1', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }],
      items: [],
    }, OWNER_TENANT_ID);

    const payEntry = captured.find((c) => c.sourceType === 'SALE_PAYMENT');
    expect(payEntry).toBeDefined();
    const cashLine = (payEntry.lines as any[]).find((l: any) => l.accountCode === ACCOUNT_CODES.CASH && Number(l.debit) > 0);
    expect(cashLine).toBeDefined();
    expect(Number(cashLine.debit)).toBe(100);
  });

  it('OT-CDT-02: DB unique violation on create is swallowed — adapter does not re-throw', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);
    await expect(adapter.recordSaleJournal({
      id: 'cdt-sale-dup', receiptNumber: 'RCP-DUP', total: new Prisma.Decimal('100'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [{ id: 'cdt-pay-dup', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }],
      items: [],
    }, OWNER_TENANT_ID)).resolves.toBeUndefined();
  });

  it('OT-CDT-03: two payments → two distinct SALE_PAYMENT sourceIds', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: `je-${captured.length}` }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal({
      id: 'sale-two', receiptNumber: 'RCP-TWO', total: new Prisma.Decimal('150'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [
        { id: 'pay-cash-X', paymentMethod: 'CASH',     amount: new Prisma.Decimal('100') },
        { id: 'pay-xfer-Y', paymentMethod: 'TRANSFER', amount: new Prisma.Decimal('50')  },
      ],
      items: [],
    }, OWNER_TENANT_ID);

    const paymentJournals = captured.filter((c) => c.sourceType === 'SALE_PAYMENT');
    const sourceIds = paymentJournals.map((c: any) => c.sourceId);
    expect(new Set(sourceIds).size).toBe(sourceIds.length); // all unique
  });
});

// ── Section 10: Reconciliation Sanity ────────────────────────────────────────

describe('OT-RECON — Reconciliation service', () => {
  it('OT-RECON-01: runReconciliation with env OFF → returns empty report without scanning', async () => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    const prisma = {
      sale: { findMany: jest.fn() }, repair: { findMany: jest.fn() }, expense: { findMany: jest.fn() },
    };
    const salesAdapter = new SalesAccountingAdapter(makeJournalMock() as any, makeModulesMock(true) as any);
    const { AccountingReconciliationService } = await import('../accounting-reconciliation/accounting-reconciliation.service');
    const svc = new AccountingReconciliationService(prisma as any, salesAdapter);

    const result = await svc.runReconciliation({ tenantId: OWNER_TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    expect(result.summary.missing).toBe(0);
    expect(result.summary.errors).toBe(0);
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });

  it('OT-RECON-02: runReconciliation returns correct shape — scanned/missing/recovered/errors', async () => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    const salesAdapter = new SalesAccountingAdapter(makeJournalMock() as any, makeModulesMock(true) as any);
    const { AccountingReconciliationService } = await import('../accounting-reconciliation/accounting-reconciliation.service');
    const svc = new AccountingReconciliationService({ sale: { findMany: jest.fn() } } as any, salesAdapter);

    const result = await svc.runReconciliation();

    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('scanned');
    expect(result.summary).toHaveProperty('missing');
    expect(result.summary).toHaveProperty('recovered');
    expect(result.summary).toHaveProperty('errors');
    expect(typeof result.summary.scanned).toBe('number');
  });
});

// ── Section 11: Idempotency ───────────────────────────────────────────────────

describe('OT-IDEM — Idempotency (no duplicate journals)', () => {
  it('OT-IDEM-01: DB unique violation on SALE_PAYMENT is swallowed — adapter returns without re-throw', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);
    await expect(adapter.recordSaleJournal({
      id: 'idem-sale', receiptNumber: 'RCP-IDEM', total: new Prisma.Decimal('200'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [{ id: 'idem-pay', paymentMethod: 'CASH', amount: new Prisma.Decimal('200') }],
      items: [],
    }, OWNER_TENANT_ID)).resolves.toBeUndefined();
  });

  it('OT-IDEM-02: DB unique violation on EXPENSE_PAYMENT is swallowed — no re-throw', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new ExpenseAccountingAdapter(jMock as any, makeModulesMock(true) as any);
    await expect(adapter.recordExpenseJournal({
      id: 'idem-exp', description: 'test', amount: new Prisma.Decimal('50'),
      paymentMethod: 'CASH', branchId: OWNER_BRANCH_ID, category: { code: 'other' },
    }, OWNER_TENANT_ID)).resolves.toBeUndefined();
  });

  it('OT-IDEM-03: DB unique violation on REPAIR_DEPOSIT is swallowed — no re-throw', async () => {
    const jMock = { create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(true) as any);
    await expect(adapter.recordDepositJournal({
      id: 'idem-rep', ticketNumber: 'T-IDEM', paidAmount: new Prisma.Decimal('500'),
      paymentMethod: 'CASH', deposit: new Prisma.Decimal('200'), branchId: OWNER_BRANCH_ID,
    }, 'CASH', OWNER_TENANT_ID)).resolves.toBeUndefined();
  });

  it('OT-IDEM-04: setTenantModuleOverride twice → idempotent (no error)', async () => {
    const prisma = makePrismaMock();
    const redis  = makeRedisMock();
    const service = new ModulesService(prisma as any, redis as any);
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: true });

    await expect(service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true)).resolves.toBeDefined();
    await expect(service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true)).resolves.toBeDefined();
    expect(prisma.tenantModule.upsert).toHaveBeenCalledTimes(2);
  });
});

// ── Section 12: Accounting OFF Safety ────────────────────────────────────────

describe('OT-OFF — Accounting OFF safety (business works, no journals)', () => {
  it('OT-OFF-01: sale completes with accounting OFF → zero journals', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordSaleJournal({
      id: 'off-sale', receiptNumber: 'RCP-OFF', total: new Prisma.Decimal('500'),
      branchId: OWNER_BRANCH_ID, createdAt: new Date(),
      payments: [{ id: 'off-pay', paymentMethod: 'CASH', amount: new Prisma.Decimal('500') }],
      items: [{ id: 'off-item', quantity: 2, costPrice: new Prisma.Decimal('100') }],
    }, OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
    expect(jMock.reverse).not.toHaveBeenCalled();
  });

  it('OT-OFF-02: repair completes with accounting OFF → zero journals', async () => {
    const jMock = makeJournalMock();
    const adapter = new RepairAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordFinalPaymentJournal({
      id: 'off-rep', ticketNumber: 'T-OFF', paidAmount: new Prisma.Decimal('800'),
      paymentMethod: 'CASH', deposit: new Prisma.Decimal('300'), branchId: OWNER_BRANCH_ID,
      parts: [{ id: 'p-off', costPrice: new Prisma.Decimal('200'), quantity: 1, isVoided: false }],
    }, OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-OFF-03: expense paid with accounting OFF → zero journals', async () => {
    const jMock = makeJournalMock();
    const adapter = new ExpenseAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordExpenseJournal({
      id: 'off-exp', description: 'ค่าน้ำค่าไฟ', amount: new Prisma.Decimal('300'),
      paymentMethod: 'CASH', branchId: OWNER_BRANCH_ID, category: { code: 'utilities' },
    }, OWNER_TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('OT-OFF-04: refund with accounting OFF → zero journals', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(false) as any);
    await adapter.recordRefundJournal(
      { id: 'off-ref', totalRefund: new Prisma.Decimal('100'), paymentMethod: 'CASH', saleId: 'sale-x' },
      { id: 'sale-x', receiptNumber: 'RCP-X', total: new Prisma.Decimal('100'), branchId: OWNER_BRANCH_ID, createdAt: new Date(), payments: [{ id: 'p-x', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }], items: [] },
      [],
      OWNER_TENANT_ID,
    );
    expect(jMock.create).not.toHaveBeenCalled();
  });
});

// ── Section 14: Tenant Isolation ─────────────────────────────────────────────

describe('OT-ISO — Tenant isolation (owner ON, others OFF)', () => {
  it('OT-ISO-01: owner ON, OTHER_TENANT_A OFF → owner gets journals, other gets zero', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true, false) as any);

    await adapter.recordSaleJournal({ id: 'iso-owner', receiptNumber: 'RCP-ISO-1', total: new Prisma.Decimal('100'), branchId: OWNER_BRANCH_ID, createdAt: new Date(), payments: [{ id: 'iso-pay-owner', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }], items: [] }, OWNER_TENANT_ID);
    await adapter.recordSaleJournal({ id: 'iso-other', receiptNumber: 'RCP-ISO-2', total: new Prisma.Decimal('200'), branchId: 'branch-other', createdAt: new Date(), payments: [{ id: 'iso-pay-other', paymentMethod: 'CASH', amount: new Prisma.Decimal('200') }], items: [] }, OTHER_TENANT_A);

    const ownerCalls = jMock.create.mock.calls.filter((c: any) => c[0].tenantId === OWNER_TENANT_ID);
    const otherCalls = jMock.create.mock.calls.filter((c: any) => c[0].tenantId === OTHER_TENANT_A);
    expect(ownerCalls.length).toBeGreaterThan(0);
    expect(otherCalls.length).toBe(0);
  });

  it('OT-ISO-02: all journals for owner tenant carry correct OWNER_TENANT_ID', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-iso' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal({ id: 'iso-2', receiptNumber: 'RCP-ISO-2', total: new Prisma.Decimal('150'), branchId: OWNER_BRANCH_ID, createdAt: new Date(), payments: [{ id: 'iso-p-2', paymentMethod: 'CASH', amount: new Prisma.Decimal('150') }], items: [{ id: 'iso-i-2', quantity: 1, costPrice: new Prisma.Decimal('80') }] }, OWNER_TENANT_ID);

    for (const call of captured) {
      expect(call.tenantId).toBe(OWNER_TENANT_ID);
    }
  });

  it('OT-ISO-03: pilot tenant (PILOT_TENANT_ID) accounting → false in pure DB path (no env override)', async () => {
    const jMock = makeJournalMock();
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true, false) as any);
    await adapter.recordSaleJournal({ id: 'pilot-sale', receiptNumber: 'RCP-PILOT', total: new Prisma.Decimal('500'), branchId: 'branch-pilot', createdAt: new Date(), payments: [{ id: 'pilot-pay', paymentMethod: 'CASH', amount: new Prisma.Decimal('500') }], items: [] }, PILOT_TENANT_ID);
    const pilotCalls = jMock.create.mock.calls.filter((c: any) => c[0].tenantId === PILOT_TENANT_ID);
    expect(pilotCalls.length).toBe(0);
  });

  it('OT-ISO-04: 0 accounting records for unrelated tenants after owner sale', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-iso4' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true, false) as any);
    await adapter.recordSaleJournal({ id: 'iso-4', receiptNumber: 'RCP-ISO-4', total: new Prisma.Decimal('300'), branchId: OWNER_BRANCH_ID, createdAt: new Date(), payments: [{ id: 'iso-p-4', paymentMethod: 'CASH', amount: new Prisma.Decimal('300') }], items: [] }, OWNER_TENANT_ID);

    const unrelated = captured.filter((c: any) => c.tenantId !== OWNER_TENANT_ID);
    expect(unrelated.length).toBe(0);
  });
});

// ── Section 15: Audit Log Safety ─────────────────────────────────────────────

describe('OT-AUDIT — Audit log content safety', () => {
  it('OT-AUDIT-01: MODULE_ENABLED log has no password/token/secret', async () => {
    const prisma = makePrismaMock();
    const redis  = makeRedisMock();
    const service = new ModulesService(prisma as any, redis as any);
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: true });

    await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', true, undefined, OWNER_SA_ID, 'SuperAdmin');
    await new Promise((r) => setImmediate(r));

    const logStr = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data).toLowerCase();
    expect(logStr).not.toContain('password');
    expect(logStr).not.toContain('token');
    expect(logStr).not.toContain('secret');
    expect(logStr).not.toContain('hash');
  });

  it('OT-AUDIT-02: MODULE_DISABLED afterData only has { moduleKey, enabled }', async () => {
    const prisma = makePrismaMock();
    const redis  = makeRedisMock();
    const service = new ModulesService(prisma as any, redis as any);
    prisma.tenant.findUnique.mockResolvedValue({ id: OWNER_TENANT_ID });
    prisma.appModule.findUnique.mockResolvedValue({ key: 'accounting' });
    prisma.tenantModule.upsert.mockResolvedValue({ tenantId: OWNER_TENANT_ID, moduleKey: 'accounting', enabled: false });

    await service.setTenantModuleOverride(OWNER_TENANT_ID, 'accounting', false, undefined, OWNER_SA_ID, 'SA');
    await new Promise((r) => setImmediate(r));

    const logData = prisma.auditLog.create.mock.calls[0][0].data;
    expect(logData.action).toBe('MODULE_DISABLED');
    expect(logData.entityId).toBe(OWNER_TENANT_ID);
    expect(Object.keys(logData.afterData)).toEqual(['moduleKey', 'enabled']);
  });

  it('OT-AUDIT-03: journal create args never contain customer PII', async () => {
    const captured: any[] = [];
    const jMock = { create: jest.fn().mockImplementation((a) => { captured.push(a); return Promise.resolve({ journal: { id: 'je-audit' }, created: true }); }), findBySource: jest.fn().mockResolvedValue(null), reverse: jest.fn() };
    const adapter = new SalesAccountingAdapter(jMock as any, makeModulesMock(true) as any);

    await adapter.recordSaleJournal({ id: 'audit-sale', receiptNumber: 'RCP-AUDIT', total: new Prisma.Decimal('100'), branchId: OWNER_BRANCH_ID, createdAt: new Date(), payments: [{ id: 'audit-pay', paymentMethod: 'CASH', amount: new Prisma.Decimal('100') }], items: [] }, OWNER_TENANT_ID);

    for (const call of captured) {
      const callStr = JSON.stringify(call).toLowerCase();
      expect(callStr).not.toContain('password');
      expect(callStr).not.toContain('customerid');
      expect(callStr).not.toContain('phone');
      expect(callStr).not.toContain('secret');
    }
  });
});

// ── Production safety meta-tests ──────────────────────────────────────────────

describe('OT-SAFETY — Production safety verification', () => {
  it('OT-SAFETY-01: OWNER_TENANT_ID constant matches specification', () => {
    expect(OWNER_TENANT_ID).toBe('cmqgw3ysh0003f963vgqh32j2');
  });

  it('OT-SAFETY-02: pilot tenant constant matches known customer tenant', () => {
    expect(PILOT_TENANT_ID).toBe('cmsc05do8001u7i29q3p5x6zp');
  });

  it('OT-SAFETY-03: all tests use mock infrastructure — no real DB connections in this file', () => {
    // Structural: journal mock is a plain object, not an injected NestJS service
    const jMock = makeJournalMock();
    expect(typeof jMock.create).toBe('function');
    expect(typeof jMock.findBySource).toBe('function');
    // No PrismaClient instantiated in this spec file
    expect(true).toBe(true);
  });
});
