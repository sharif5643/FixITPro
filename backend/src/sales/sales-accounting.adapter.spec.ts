import { Prisma } from '@prisma/client';
import {
  SalesAccountingAdapter,
  SaleForAccounting,
  RefundForAccounting,
  RefundItemForAccounting,
} from './sales-accounting.adapter';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-1';
const BRANCH_ID  = 'branch-1';
const USER_ID    = 'user-1';
const SALE_ID    = 'sale-1';
const RECEIPT    = 'RCP-20260817-AABBCC';

const PAY_CASH: SaleForAccounting['payments'][number] = {
  id:            'pay-cash-1',
  paymentMethod: 'CASH',
  amount:        new Prisma.Decimal('450'),
};

const PAY_TRANSFER: SaleForAccounting['payments'][number] = {
  id:            'pay-xfer-1',
  paymentMethod: 'TRANSFER',
  amount:        new Prisma.Decimal('250'),
};

const PAY_CARD: SaleForAccounting['payments'][number] = {
  id:            'pay-card-1',
  paymentMethod: 'CARD',
  amount:        new Prisma.Decimal('450'),
};

const ITEM_WITH_COST: SaleForAccounting['items'][number] = {
  id:        'si-1',
  quantity:  2,
  costPrice: new Prisma.Decimal('100'),
};

const ITEM_ZERO_COST: SaleForAccounting['items'][number] = {
  id:        'si-zero',
  quantity:  3,
  costPrice: new Prisma.Decimal('0'),
};

function makeSale(overrides?: Partial<SaleForAccounting>): SaleForAccounting {
  return {
    id:            SALE_ID,
    receiptNumber: RECEIPT,
    total:         new Prisma.Decimal('450'),
    branchId:      BRANCH_ID,
    createdAt:     new Date('2026-08-17T10:00:00Z'),
    payments:      [PAY_CASH],
    items:         [ITEM_WITH_COST],
    ...overrides,
  };
}

function makeJournal(overrides?: Record<string, unknown>) {
  return { id: 'je-1', entryNumber: 'JE-20260817-00000001', isVoided: false, lines: [], ...overrides };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

type MockJournal = {
  create:       jest.Mock;
  findBySource: jest.Mock;
  reverse:      jest.Mock;
};

function makeJournalMock(): MockJournal {
  return {
    create:       jest.fn().mockResolvedValue({ journal: makeJournal(), created: true }),
    findBySource: jest.fn().mockResolvedValue(null),
    reverse:      jest.fn().mockResolvedValue(makeJournal({ id: 'je-rev' })),
  };
}

function makeAdapter(journalMock: MockJournal): SalesAccountingAdapter {
  return new SalesAccountingAdapter(journalMock as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SalesAccountingAdapter', () => {
  let jMock: MockJournal;
  let adapter: SalesAccountingAdapter;

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

  // ── T01: Feature flag OFF ─────────────────────────────────────────────────

  it('T01: feature flag OFF — recordSaleJournal creates no journals', async () => {
    // flag not set (defaults to false)
    await adapter.recordSaleJournal(makeSale(), TENANT_ID, USER_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('T01b: feature flag OFF — reverseSaleJournal creates no journals', async () => {
    await adapter.reverseSaleJournal(makeSale(), TENANT_ID, USER_ID);
    expect(jMock.reverse).not.toHaveBeenCalled();
    expect(jMock.findBySource).not.toHaveBeenCalled();
  });

  it('T01c: feature flag OFF — recordRefundJournal creates no journals', async () => {
    const refund: RefundForAccounting = { id: 'ref-1', totalRefund: 200, paymentMethod: 'CASH', saleId: SALE_ID };
    const refundItems: RefundItemForAccounting[] = [{ saleItemId: 'si-1', quantity: 1 }];
    await adapter.recordRefundJournal(refund, makeSale(), refundItems, TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  // ── T02: CASH sale — correct accounts ────────────────────────────────────

  it('T02: CASH payment → DR 1100 Cash / CR 4100 Revenue', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({ payments: [PAY_CASH], items: [] });

    await adapter._recordSaleJournal(sale, TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe('SALE_PAYMENT');
    expect(call.sourceId).toBe(PAY_CASH.id);
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.lines).toHaveLength(2);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,          debit:  '450' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.SALES_REVENUE,  credit: '450' });
  });

  // ── T03: CASH with change — net amount used ───────────────────────────────

  it('T03: CASH tendered 500, Sale.total=450 (change=50) → journal amount=450', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({
      total:    new Prisma.Decimal('450'),
      payments: [{ id: 'pay-cash-1', paymentMethod: 'CASH', amount: new Prisma.Decimal('500') }],
      items:    [],
    });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH, debit: '450' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: '450' });
  });

  // ── T04: TRANSFER payment ─────────────────────────────────────────────────

  it('T04: TRANSFER payment → DR 1120 Clearing / CR 4100 Revenue', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({
      total:    new Prisma.Decimal('250'),
      payments: [PAY_TRANSFER],
      items:    [],
    });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING,      debit:  '250' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.SALES_REVENUE,  credit: '250' });
  });

  // ── T05: CARD payment ────────────────────────────────────────────────────

  it('T05: CARD payment → DR 1120 Clearing / CR 4100 Revenue', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({
      total:    new Prisma.Decimal('450'),
      payments: [PAY_CARD],
      items:    [],
    });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING, debit: '450' });
  });

  // ── T06: Split CASH 200 + TRANSFER 250 = total 450 ───────────────────────

  it('T06: split CASH 200 + TRANSFER 250, total 450 → two journals: cash=200, transfer=250', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({
      total: new Prisma.Decimal('450'),
      payments: [
        { id: 'pay-cash-split', paymentMethod: 'CASH',     amount: new Prisma.Decimal('200') },
        { id: 'pay-xfer-split', paymentMethod: 'TRANSFER',  amount: new Prisma.Decimal('250') },
      ],
      items: [],
    });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    expect(jMock.create).toHaveBeenCalledTimes(2);
    const calls = jMock.create.mock.calls;
    const cashCall = calls.find((c) => c[0].sourceId === 'pay-cash-split')[0];
    const xferCall = calls.find((c) => c[0].sourceId === 'pay-xfer-split')[0];

    expect(cashCall.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,     debit: '200' });
    expect(xferCall.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING, debit: '250' });
  });

  // ── T07: COGS — correct amount ────────────────────────────────────────────

  it('T07: COGS: costPrice=100, qty=2 → DR 5100=200 / CR 1300=200', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({ payments: [], items: [ITEM_WITH_COST] });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe('SALE_COGS');
    expect(call.sourceId).toBe(ITEM_WITH_COST.id);
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.COGS,       debit:  '200' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.INVENTORY,   credit: '200' });
  });

  // ── T08: costPrice=0 → no COGS journal ───────────────────────────────────

  it('T08: costPrice=0 → COGS journal skipped, warning logged', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});
    const sale    = makeSale({ payments: [], items: [ITEM_ZERO_COST] });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    expect(jMock.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('costPrice=0'),
    );
  });

  // ── T09: Multiple items — mixed costPrice ─────────────────────────────────

  it('T09: multiple items: COGS only for items with costPrice > 0', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({
      payments: [],
      items: [
        ITEM_WITH_COST,                                                            // costPrice=100
        ITEM_ZERO_COST,                                                            // costPrice=0
        { id: 'si-2', quantity: 1, costPrice: new Prisma.Decimal('50') },         // costPrice=50
      ],
    });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    // 2 COGS journals (for si-1 and si-2); zero-cost item skipped
    expect(jMock.create).toHaveBeenCalledTimes(2);
    const ids = jMock.create.mock.calls.map((c) => c[0].sourceId);
    expect(ids).toContain('si-1');
    expect(ids).toContain('si-2');
    expect(ids).not.toContain('si-zero');
  });

  // ── T10: sourceType / sourceId correctness ────────────────────────────────

  it('T10: SALE_PAYMENT journal uses sourceType=SALE_PAYMENT, sourceId=SalePayment.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({ items: [] });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe('SALE_PAYMENT');
    expect(call.sourceId).toBe(PAY_CASH.id);
    expect(call.tenantId).toBe(TENANT_ID);
  });

  it('T11: SALE_COGS journal uses sourceType=SALE_COGS, sourceId=SaleItem.id', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({ payments: [] });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe('SALE_COGS');
    expect(call.sourceId).toBe(ITEM_WITH_COST.id);
  });

  // ── T12: branchId=null — adapter still runs ───────────────────────────────

  it('T12: branchId=null — adapter creates journal with branchId=null', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const sale = makeSale({ branchId: null, items: [] });

    await adapter._recordSaleJournal(sale, TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.branchId).toBeNull();
  });

  // ── T13: Idempotency — duplicate call ────────────────────────────────────

  it('T13: second call returns {created:false} — no error, no duplicate', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockResolvedValue({ journal: makeJournal(), created: false });

    const sale = makeSale({ items: [] });
    await expect(adapter._recordSaleJournal(sale, TENANT_ID)).resolves.toBeUndefined();
    expect(jMock.create).toHaveBeenCalledTimes(1);
  });

  // ── T14: JournalService throws — adapter catches ─────────────────────────

  it('T14: JournalService.create throws NotFoundException — caught by public method', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockRejectedValue(new Error('Account not found'));

    await expect(
      adapter.recordSaleJournal(makeSale(), TENANT_ID),
    ).resolves.toBeUndefined();   // must resolve, not reject
  });

  // ── T15: Accounting failure never propagates to POS caller ───────────────

  it('T15: accounting failure does not throw — POS caller receives undefined', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockRejectedValue(new Error('DB connection lost'));

    const result = await adapter.recordSaleJournal(makeSale(), TENANT_ID);
    expect(result).toBeUndefined();
  });

  // ── T16: reverseSaleJournal — reverses existing journals ─────────────────

  it('T16: reverseSaleJournal finds existing SALE_PAYMENT journal and reverses it', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const existingJournal = makeJournal({ id: 'je-to-reverse', isVoided: false });
    jMock.findBySource.mockResolvedValue(existingJournal);

    const sale = makeSale({ items: [] });
    await adapter._reverseSaleJournal(sale, TENANT_ID, USER_ID);

    expect(jMock.findBySource).toHaveBeenCalledWith('SALE_PAYMENT', PAY_CASH.id, TENANT_ID);
    expect(jMock.reverse).toHaveBeenCalledWith(
      'je-to-reverse',
      TENANT_ID,
      `Void sale ${RECEIPT}`,
      USER_ID,
    );
  });

  // ── T17: reverseSaleJournal — no existing journal ────────────────────────

  it('T17: reverseSaleJournal: no existing journal → logs warning, no error', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.findBySource.mockResolvedValue(null);
    const warnSpy = jest.spyOn(adapter['logger'], 'warn').mockImplementation(() => {});

    const sale = makeSale({ items: [] });
    await expect(adapter._reverseSaleJournal(sale, TENANT_ID)).resolves.toBeUndefined();
    expect(jMock.reverse).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no SALE_PAYMENT journal'));
  });

  // ── T18: reverseSaleJournal — COGS journals also reversed ────────────────

  it('T18: reverseSaleJournal reverses COGS journal too', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const payJe  = makeJournal({ id: 'je-pay',  isVoided: false });
    const cogsJe = makeJournal({ id: 'je-cogs', isVoided: false });

    jMock.findBySource
      .mockImplementation(async (sourceType: string) => {
        if (sourceType === 'SALE_PAYMENT') return payJe;
        if (sourceType === 'SALE_COGS')    return cogsJe;
        return null;
      });

    const sale = makeSale();
    await adapter._reverseSaleJournal(sale, TENANT_ID, USER_ID);

    expect(jMock.reverse).toHaveBeenCalledTimes(2);
    const reversedIds = jMock.reverse.mock.calls.map((c) => c[0]);
    expect(reversedIds).toContain('je-pay');
    expect(reversedIds).toContain('je-cogs');
  });

  // ── T19: reverseSaleJournal — feature flag OFF ───────────────────────────

  it('T19: reverseSaleJournal: feature flag OFF → no-op', async () => {
    // env not set → isEnabled = false
    await adapter.reverseSaleJournal(makeSale(), TENANT_ID);
    expect(jMock.findBySource).not.toHaveBeenCalled();
    expect(jMock.reverse).not.toHaveBeenCalled();
  });

  // ── T20: recordRefundJournal — revenue reversal ───────────────────────────

  it('T20: recordRefundJournal CASH → DR 4100 Revenue / CR 1100 Cash', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const refund: RefundForAccounting = {
      id:            'ref-1',
      totalRefund:   200,
      paymentMethod: 'CASH',
      saleId:        SALE_ID,
    };

    await adapter._recordRefundJournal(refund, makeSale({ items: [] }), [], TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
    const call = jMock.create.mock.calls[0][0];
    expect(call.sourceType).toBe('SALE_REFUND');
    expect(call.sourceId).toBe('ref-1');
    expect(call.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.SALES_REVENUE, debit:  '200' });
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CASH,           credit: '200' });
  });

  // ── T21: recordRefundJournal — COGS reversal ─────────────────────────────

  it('T21: recordRefundJournal restores inventory via COGS reversal', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const refund: RefundForAccounting = {
      id: 'ref-2', totalRefund: 200, paymentMethod: 'CASH', saleId: SALE_ID,
    };
    const refundItems: RefundItemForAccounting[] = [{ saleItemId: 'si-1', quantity: 1 }];
    const sale = makeSale({ items: [ITEM_WITH_COST] });  // costPrice=100, qty refunded=1

    await adapter._recordRefundJournal(refund, sale, refundItems, TENANT_ID);

    expect(jMock.create).toHaveBeenCalledTimes(2);  // revenue + COGS reversal

    const cogsCalls = jMock.create.mock.calls.filter(
      (c) => c[0].sourceType === 'SALE_REFUND_COGS',
    );
    expect(cogsCalls).toHaveLength(1);
    const cogsCall = cogsCalls[0][0];
    expect(cogsCall.lines[0]).toMatchObject({ accountCode: ACCOUNT_CODES.INVENTORY, debit:  '100' });
    expect(cogsCall.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.COGS,       credit: '100' });
  });

  // ── T22: recordRefundJournal — costPrice=0 skips COGS reversal ───────────

  it('T22: recordRefundJournal: COGS reversal skipped when costPrice=0', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const refund: RefundForAccounting = {
      id: 'ref-3', totalRefund: 50, paymentMethod: 'CASH', saleId: SALE_ID,
    };
    const refundItems: RefundItemForAccounting[] = [{ saleItemId: 'si-zero', quantity: 1 }];
    const sale = makeSale({ items: [ITEM_ZERO_COST] });

    await adapter._recordRefundJournal(refund, sale, refundItems, TENANT_ID);

    // Only the revenue reversal journal; no COGS reversal
    expect(jMock.create).toHaveBeenCalledTimes(1);
    expect(jMock.create.mock.calls[0][0].sourceType).toBe('SALE_REFUND');
  });

  // ── T23: recordRefundJournal — feature flag OFF ───────────────────────────

  it('T23: recordRefundJournal: feature flag OFF → no-op', async () => {
    const refund: RefundForAccounting = {
      id: 'ref-4', totalRefund: 100, paymentMethod: 'CASH', saleId: SALE_ID,
    };
    await adapter.recordRefundJournal(refund, makeSale(), [], TENANT_ID);
    expect(jMock.create).not.toHaveBeenCalled();
  });

  // ── T24: recordRefundJournal — failure caught ─────────────────────────────

  it('T24: recordRefundJournal: JournalService throws → caught, not rethrown', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    jMock.create.mockRejectedValue(new Error('Account 4100 not found'));

    const refund: RefundForAccounting = {
      id: 'ref-5', totalRefund: 100, paymentMethod: 'CASH', saleId: SALE_ID,
    };

    await expect(
      adapter.recordRefundJournal(refund, makeSale(), [], TENANT_ID),
    ).resolves.toBeUndefined();
  });

  // ── T25: tenantId isolation ───────────────────────────────────────────────

  it('T25: tenantId is passed through to every JournalService.create call', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const customTenant = 'tenant-specific-99';
    const sale = makeSale({ items: [ITEM_WITH_COST] });

    await adapter._recordSaleJournal(sale, customTenant);

    for (const call of jMock.create.mock.calls) {
      expect(call[0].tenantId).toBe(customTenant);
    }
  });

  // ── T26: TRANSFER refund → Clearing credit ────────────────────────────────

  it('T26: recordRefundJournal TRANSFER → CR 1120 Clearing', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    const refund: RefundForAccounting = {
      id: 'ref-6', totalRefund: 250, paymentMethod: 'TRANSFER', saleId: SALE_ID,
    };

    await adapter._recordRefundJournal(refund, makeSale({ items: [] }), [], TENANT_ID);

    const call = jMock.create.mock.calls[0][0];
    expect(call.lines[1]).toMatchObject({ accountCode: ACCOUNT_CODES.CLEARING, credit: '250' });
  });

  // ── T-A through T-L: Tenant allowlist (ACCOUNTING_ENABLED_TENANTS) ─────────
  // Phase 4B.2.2: fail-closed design.
  // Absent/empty allowlist → nobody enabled.
  // '*' sentinel → all tenants enabled (only explicit full-rollout mechanism).
  // Explicit list → only listed tenants enabled.

  it('T-A: flag ON + ACCOUNTING_ENABLED_TENANTS absent → nobody enabled (fail-closed)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // No allowlist configured → fail-closed: isEnabledForTenant returns false for any tenant
    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(false);
    expect(adapter.isEnabledForTenant('any-other-tenant')).toBe(false);
  });

  it('T-B: flag ON + tenant not in allowlist → no journal created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'different-tenant';

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('T-C: flag ON + tenant in allowlist → journal created', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID;

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
  });

  it('T-D: flag ON + allowlist with multiple tenants including mine → enabled', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = `other-tenant-1,${TENANT_ID},other-tenant-2`;

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
  });

  it('T-E: flag ON + allowlist with surrounding whitespace → whitespace trimmed', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = `  ${TENANT_ID}  ,  other-tenant  `;

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
  });

  it('T-F: flag ON + allowlist set but tenant absent → no journal (cross-tenant blocked)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'pilot-tenant-only';

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('T-G: flag OFF → no-op regardless of ACCOUNTING_ENABLED_TENANTS', async () => {
    // ACCOUNTING_CORE_ENABLED not set (defaults to false)
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID; // would be "enabled" if flag were ON

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('T-H: flag ON + allowlist matches tenantId but different tenantId is passed → blocked', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = TENANT_ID; // only tenant-1

    // Call with a different tenantId (as if SUPER_ADMIN acting for another tenant)
    await adapter.recordSaleJournal(makeSale({ items: [] }), 'tenant-999', USER_ID);

    expect(jMock.create).not.toHaveBeenCalled();
  });

  it('T-I: flag ON + empty string allowlist → nobody enabled (fail-closed)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '';

    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(false);
    expect(adapter.isEnabledForTenant('any-tenant')).toBe(false);
  });

  it('T-J: flag ON + whitespace-only allowlist → nobody enabled (fail-closed)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '   ';

    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(false);
  });

  it('T-K: flag ON + "*" sentinel → all tenants enabled (explicit full-rollout)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '*';

    expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(true);
    expect(adapter.isEnabledForTenant('any-other-tenant')).toBe(true);
  });

  it('T-L: flag ON + "*" sentinel → journal created for any tenant', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '*';

    await adapter.recordSaleJournal(makeSale({ items: [] }), TENANT_ID, USER_ID);

    expect(jMock.create).toHaveBeenCalledTimes(1);
  });
});
