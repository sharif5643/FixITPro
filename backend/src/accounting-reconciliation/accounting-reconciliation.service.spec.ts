import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountingReconciliationService, SaleReconciliationItem } from './accounting-reconciliation.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-1';
const BRANCH_ID  = 'branch-1';
const SALE_ID    = 'sale-1';
const RECEIPT    = 'RCP-20260818-001';
const PAYMENT_ID = 'pay-1';
const ITEM_ID    = 'si-1';
const REFUND_ID  = 'ref-1';

function makeSalePrisma(overrides?: Record<string, any>): any {
  return {
    id:            SALE_ID,
    receiptNumber: RECEIPT,
    total:         500,
    branchId:      BRANCH_ID,
    createdAt:     new Date('2026-02-01T00:00:00Z'),
    status:        'COMPLETED',
    payments:      [{ id: PAYMENT_ID, paymentMethod: 'CASH', amount: 500 }],
    items:         [{ id: ITEM_ID, quantity: 2, costPrice: 100 }],
    refunds:       [],
    branch:        { tenantId: TENANT_ID },
    ...overrides,
  };
}

function makeJournalEntry(overrides?: Record<string, any>): any {
  return {
    id:         'je-1',
    sourceType: 'SALE_PAYMENT',
    sourceId:   PAYMENT_ID,
    isVoided:   false,
    lines:      [{ debit: 500, credit: 0 }, { debit: 0, credit: 500 }],
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

type MockPrisma = {
  branch:       { findMany: jest.Mock };
  sale:         { findMany: jest.Mock; findUnique: jest.Mock };
  journalEntry: { findMany: jest.Mock };
  tenant:       { findMany: jest.Mock };
  rolePermission: { createMany: jest.Mock };
};

type MockAdapter = {
  recordSaleJournal:   jest.Mock;
  reverseSaleJournal:  jest.Mock;
  recordRefundJournal: jest.Mock;
  isEnabledForTenant:  jest.Mock;
};

function makePrismaMock(): MockPrisma {
  return {
    branch:         { findMany: jest.fn().mockResolvedValue([{ id: BRANCH_ID }]) },
    sale:           { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    journalEntry:   { findMany: jest.fn().mockResolvedValue([]) },
    tenant:         { findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID }]) },
    rolePermission: { createMany: jest.fn().mockResolvedValue({}) },
  };
}

function makeAdapterMock(): MockAdapter {
  return {
    recordSaleJournal:   jest.fn().mockResolvedValue(undefined),
    reverseSaleJournal:  jest.fn().mockResolvedValue(undefined),
    recordRefundJournal: jest.fn().mockResolvedValue(undefined),
    isEnabledForTenant:  jest.fn().mockReturnValue(true),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AccountingReconciliationService', () => {
  let service: AccountingReconciliationService;
  let prisma:  MockPrisma;
  let adapter: MockAdapter;

  // Within the 24-hour safety window so all existing tests pass the timestamp guard.
  const ACTIVATION_TS     = new Date(Date.now() - 30 * 1000).toISOString(); // 30 seconds ago
  const ACTIVATION_TS_OLD = '2020-01-01T00:00:00Z'; // definitely >24h in the past
  const ACTIVATION_TS_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h future

  function enableAccounting(tenantId = TENANT_ID) {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS;
    process.env.ACCOUNTING_ENABLED_TENANTS      = tenantId;
  }

  beforeEach(() => {
    prisma  = makePrismaMock();
    adapter = makeAdapterMock();
    service = new AccountingReconciliationService(prisma as any, adapter as any);
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  afterEach(() => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  // ── R01: Fully posted sale ─────────────────────────────────────────────────

  it('R01: fully posted sale → status POSTED, no recovery attempted', async () => {
    enableAccounting();
    const sale = makeSalePrisma();
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay',  sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
        makeJournalEntry({ id: 'je-cogs', sourceType: 'SALE_COGS',    sourceId: ITEM_ID,
                           lines: [{ debit: 200, credit: 0 }] }),
      ])
      .mockResolvedValueOnce([]); // reversals query

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(1);
    expect(result.summary.posted).toBe(1);
    expect(result.summary.recovered).toBe(0);
    expect(result.items[0].status).toBe('POSTED');
    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
  });

  // ── R02: Missing SALE_PAYMENT journal ─────────────────────────────────────

  it('R02: no SALE_PAYMENT journal → MISSING_REVENUE + recovery called', async () => {
    enableAccounting();
    const sale = makeSalePrisma({ items: [] }); // no COGS needed
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock).mockResolvedValue([]); // no journals

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('MISSING_REVENUE');
    expect(result.items[0].missingRevenue).toContain(PAYMENT_ID);
    expect(adapter.recordSaleJournal).toHaveBeenCalledTimes(1);
    expect(result.items[0].recovered).toBe(true);
  });

  // ── R03: Revenue present but COGS missing ─────────────────────────────────

  it('R03: SALE_PAYMENT present but SALE_COGS missing → MISSING_COGS + recovery', async () => {
    enableAccounting();
    const sale = makeSalePrisma();
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay', sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
        // SALE_COGS missing
      ])
      .mockResolvedValueOnce([]); // reversals

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('MISSING_COGS');
    expect(result.items[0].missingCogs).toContain(ITEM_ID);
    expect(adapter.recordSaleJournal).toHaveBeenCalledTimes(1);
  });

  // ── R04: Both revenue and COGS missing → PARTIAL ──────────────────────────

  it('R04: second payment journal missing + COGS missing → PARTIAL', async () => {
    enableAccounting();
    const sale = makeSalePrisma({
      payments: [
        { id: 'pay-1', paymentMethod: 'CASH',     amount: 300 },
        { id: 'pay-2', paymentMethod: 'TRANSFER',  amount: 200 },
      ],
      items: [{ id: 'si-1', quantity: 1, costPrice: 100 }],
    });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    // Only pay-1 journal exists, not pay-2 or COGS
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-1', sourceType: 'SALE_PAYMENT', sourceId: 'pay-1',
                           lines: [{ debit: 300, credit: 0 }] }),
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('PARTIAL');
    expect(result.items[0].missingRevenue).toContain('pay-2');
    expect(result.items[0].missingCogs).toContain('si-1');
  });

  // ── R05: Zero-cost item → COGS not required ───────────────────────────────

  it('R05: zero-cost SaleItem has no COGS journal → not flagged as missing', async () => {
    enableAccounting();
    const sale = makeSalePrisma({
      items: [
        { id: 'si-zero', quantity: 1, costPrice: 0 },
      ],
    });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay', sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('POSTED');
    expect(result.items[0].missingCogs).toHaveLength(0);
  });

  // ── R06: Voided sale — SALE_PAYMENT journal exists but no JOURNAL_REVERSAL ─

  it('R06: VOIDED sale + SALE_PAYMENT journal exists + no reversal → VOID_MISSING', async () => {
    enableAccounting();
    const sale = makeSalePrisma({ status: 'VOIDED' });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    const payJournal = makeJournalEntry({ id: 'je-pay', sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID });
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([payJournal])   // sale payment + cogs journals
      .mockResolvedValueOnce([]);             // reversals (none)

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('VOID_MISSING');
    expect(result.items[0].voidMissing).toBe(true);
    expect(adapter.reverseSaleJournal).toHaveBeenCalledTimes(1);
    expect(result.items[0].recovered).toBe(true);
  });

  // ── R07: Voided sale — no SALE_PAYMENT journal at all → POSTED (skip) ──────

  it('R07: VOIDED sale with no SALE_PAYMENT journal → POSTED (nothing to reverse)', async () => {
    enableAccounting();
    const sale = makeSalePrisma({ status: 'VOIDED' });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock).mockResolvedValue([]); // no journals

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('POSTED');
    expect(adapter.reverseSaleJournal).not.toHaveBeenCalled();
  });

  // ── R08: Missing SALE_REFUND journal ─────────────────────────────────────

  it('R08: SALE_REFUND journal missing → REFUND_MISSING + recovery', async () => {
    enableAccounting();
    const sale = makeSalePrisma({
      refunds: [
        {
          id:            REFUND_ID,
          totalRefund:   100,
          paymentMethod: 'CASH',
          saleId:        SALE_ID,
          items:         [{ saleItemId: ITEM_ID, quantity: 1 }],
        },
      ],
    });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    // Revenue + COGS journals exist; refund journal missing
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay',  sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
        makeJournalEntry({ id: 'je-cogs', sourceType: 'SALE_COGS',    sourceId: ITEM_ID,
                           lines: [{ debit: 200, credit: 0 }] }),
        // SALE_REFUND journal missing
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('REFUND_MISSING');
    expect(result.items[0].refundsMissing).toContain(REFUND_ID);
    expect(adapter.recordRefundJournal).toHaveBeenCalledTimes(1);
  });

  // ── R09: COGS amount mismatch → ERROR ─────────────────────────────────────

  it('R09: COGS journal debit differs from costPrice×qty by >0.01 → ERROR', async () => {
    enableAccounting();
    const sale = makeSalePrisma(); // costPrice=100, qty=2, expected=200
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay',  sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
        makeJournalEntry({ id: 'je-cogs', sourceType: 'SALE_COGS',    sourceId: ITEM_ID,
                           lines: [{ debit: 999, credit: 0 }] }), // wrong amount
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('ERROR');
    expect(result.items[0].errors[0]).toContain('COGS mismatch');
    // No recovery for ERROR — must be reviewed manually
    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
  });

  // ── R10: Recovery succeeds for MISSING_REVENUE ────────────────────────────

  it('R10: MISSING_REVENUE → recordSaleJournal called → recovered=true', async () => {
    enableAccounting();
    const sale = makeSalePrisma({ items: [] });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(adapter.recordSaleJournal).toHaveBeenCalledWith(sale, TENANT_ID, null);
    expect(result.items[0].recovered).toBe(true);
  });

  // ── R11: Recovery succeeds for MISSING_COGS (adapter is idempotent) ────────

  it('R11: MISSING_COGS → recordSaleJournal called (idempotent, creates only missing journal)', async () => {
    enableAccounting();
    const sale = makeSalePrisma();
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay', sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('MISSING_COGS');
    expect(adapter.recordSaleJournal).toHaveBeenCalledTimes(1);
    expect(result.items[0].recovered).toBe(true);
  });

  // ── R12: Recovery for VOID_MISSING calls reverseSaleJournal ──────────────

  it('R12: VOID_MISSING recovery calls reverseSaleJournal with correct args', async () => {
    enableAccounting();
    const sale = makeSalePrisma({ status: 'VOIDED', items: [] });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    const payJournal = makeJournalEntry({ id: 'je-void', sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID });
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([payJournal])
      .mockResolvedValueOnce([]);

    await service.runReconciliation({ tenantId: TENANT_ID });

    expect(adapter.reverseSaleJournal).toHaveBeenCalledWith(sale, TENANT_ID, null);
    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
  });

  // ── R13: Recovery for REFUND_MISSING calls recordRefundJournal ────────────

  it('R13: REFUND_MISSING recovery calls recordRefundJournal with correct args', async () => {
    enableAccounting();
    const refund = {
      id:            REFUND_ID,
      totalRefund:   150,
      paymentMethod: 'TRANSFER',
      saleId:        SALE_ID,
      items:         [{ saleItemId: ITEM_ID, quantity: 1 }],
    };
    const sale = makeSalePrisma({ refunds: [refund] });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({ id: 'je-pay',  sourceType: 'SALE_PAYMENT', sourceId: PAYMENT_ID,
                           lines: [{ debit: 500, credit: 0 }] }),
        makeJournalEntry({ id: 'je-cogs', sourceType: 'SALE_COGS',    sourceId: ITEM_ID,
                           lines: [{ debit: 200, credit: 0 }] }),
      ])
      .mockResolvedValueOnce([]);

    await service.runReconciliation({ tenantId: TENANT_ID });

    expect(adapter.recordRefundJournal).toHaveBeenCalledWith(
      { id: REFUND_ID, totalRefund: 150, paymentMethod: 'TRANSFER', saleId: SALE_ID },
      sale,
      [{ saleItemId: ITEM_ID, quantity: 1 }],
      TENANT_ID,
      null,
    );
  });

  // ── R14: Historical sale excluded by activation timestamp ─────────────────

  it('R14: sale createdAt < ACCOUNTING_ACTIVATION_TIMESTAMP → not scanned', async () => {
    enableAccounting();
    // activationTs = 2026-01-01. Sale created on 2025-12-31 → should not be in results.
    // Simulate by making the DB return no sales (the where clause filters by createdAt >= activationTs).
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]); // DB excludes old sales

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    // Verify the query used gte activationTs
    const call = (prisma.sale.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.createdAt.gte).toEqual(new Date(ACTIVATION_TS));
  });

  // ── R15: Accounting disabled → empty report ───────────────────────────────

  it('R15: ACCOUNTING_CORE_ENABLED != true → returns empty report, no DB queries', async () => {
    // Not setting ACCOUNTING_CORE_ENABLED
    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });

  // ── R16: ACCOUNTING_ACTIVATION_TIMESTAMP not set → empty report ───────────

  it('R16: ACCOUNTING_ACTIVATION_TIMESTAMP not set → returns empty report, no DB queries', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // ACCOUNTING_ACTIVATION_TIMESTAMP not set
    const errorSpy = jest.spyOn(
      service['logger'] as any, 'error',
    ).mockImplementation(() => {});

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ACCOUNTING_ACTIVATION_TIMESTAMP'));
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });

  // ── R17: Tenant isolation — branch query scoped to tenantId ───────────────

  it('R17: runReconciliation({ tenantId }) only queries branches for that tenant', async () => {
    enableAccounting();
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);

    await service.runReconciliation({ tenantId: TENANT_ID });

    const branchCall = (prisma.branch.findMany as jest.Mock).mock.calls[0][0];
    expect(branchCall.where.tenantId).toBe(TENANT_ID);
  });

  // ── R18: retrySale — cross-tenant → ForbiddenException ───────────────────

  it('R18: retrySale with wrong tenantId and non-SUPER_ADMIN → ForbiddenException', async () => {
    const sale = makeSalePrisma({ branch: { tenantId: 'different-tenant' } });
    (prisma.sale.findUnique as jest.Mock).mockResolvedValue(sale);

    await expect(
      service.retrySale(SALE_ID, TENANT_ID, 'OWNER'),
    ).rejects.toThrow(ForbiddenException);

    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
  });

  // ── R19: retrySale — own tenant → returns item ────────────────────────────

  it('R19: retrySale with matching tenantId → classified and recovery attempted', async () => {
    const sale = makeSalePrisma({ items: [] }); // no COGS journal needed
    (prisma.sale.findUnique as jest.Mock).mockResolvedValue(sale);
    (prisma.journalEntry.findMany as jest.Mock).mockResolvedValue([]); // no journals

    const item = await service.retrySale(SALE_ID, TENANT_ID, 'OWNER');

    expect(item).toBeDefined();
    expect(item.saleId).toBe(SALE_ID);
    expect(item.status).toBe('MISSING_REVENUE');
    expect(adapter.recordSaleJournal).toHaveBeenCalledTimes(1);
    expect(item.recovered).toBe(true);
  });

  // ── R20: retrySale — sale not found → NotFoundException ──────────────────

  it('R20: retrySale with unknown saleId → NotFoundException', async () => {
    (prisma.sale.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.retrySale('unknown-sale', TENANT_ID, 'OWNER'),
    ).rejects.toThrow(NotFoundException);
  });

  // ── R21: SUPER_ADMIN can retry any tenant's sale ─────────────────────────

  it('R21: SUPER_ADMIN can retry a sale from a different tenant', async () => {
    const sale = makeSalePrisma({
      items:  [],
      branch: { tenantId: 'other-tenant' },
    });
    (prisma.sale.findUnique as jest.Mock).mockResolvedValue(sale);
    (prisma.journalEntry.findMany as jest.Mock).mockResolvedValue([]);

    const item = await service.retrySale(SALE_ID, TENANT_ID, 'SUPER_ADMIN');

    // No ForbiddenException — SUPER_ADMIN bypasses tenant check
    expect(item.saleId).toBe(SALE_ID);
  });

  // ── R22: Cron — scheduledScan no-ops when accounting disabled ────────────

  it('R22: scheduledScan returns immediately when ACCOUNTING_CORE_ENABLED is false', async () => {
    // Not setting ACCOUNTING_CORE_ENABLED
    await service.scheduledScan();

    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });

  // ── R23: Cron — scheduledScan calls runReconciliation when enabled ────────

  it('R23: scheduledScan calls runReconciliation and logs result when accounting enabled', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS;
    process.env.ACCOUNTING_ENABLED_TENANTS      = TENANT_ID;

    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    const logSpy = jest.spyOn(
      service['logger'] as any, 'log',
    ).mockImplementation(() => {});

    await service.scheduledScan();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('scan starting'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Scheduled scan complete'));
  });

  // ── R24: Fail-closed — no allowlist means zero tenants scanned ───────────

  it('R24: ACCOUNTING_ENABLED_TENANTS absent → fail-closed: zero tenants scanned', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS;
    // ACCOUNTING_ENABLED_TENANTS not set → DISABLED mode (fail-closed)

    const warnSpy = jest.spyOn(service['logger'] as any, 'warn').mockImplementation(() => {});

    const result = await service.runReconciliation(); // no tenantId option

    // Fail-closed: tenant.findMany NOT called — nobody is enabled
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(result.summary.scanned).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no tenant allowlist configured'),
    );
  });

  // ── R25: Non-CASH revenue amount mismatch → ERROR ─────────────────────────

  it('R25: TRANSFER journal debit differs from SalePayment.amount by >0.01 → ERROR', async () => {
    enableAccounting();
    const sale = makeSalePrisma({
      payments: [{ id: 'pay-xfer', paymentMethod: 'TRANSFER', amount: 300 }],
      items:    [],
    });
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([sale]);
    (prisma.journalEntry.findMany as jest.Mock)
      .mockResolvedValueOnce([
        makeJournalEntry({
          id:         'je-xfer',
          sourceType: 'SALE_PAYMENT',
          sourceId:   'pay-xfer',
          lines:      [{ debit: 150, credit: 0 }], // should be 300
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.items[0].status).toBe('ERROR');
    expect(result.items[0].errors[0]).toContain('Revenue mismatch');
    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
  });

  // ── R26: Activation timestamp invalid string → empty report + ERROR ───────

  it('R26: ACCOUNTING_ACTIVATION_TIMESTAMP set to an invalid string → empty report + ERROR logged', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = 'not-a-date';
    process.env.ACCOUNTING_ENABLED_TENANTS      = TENANT_ID;

    const errSpy = jest.spyOn(service['logger'] as any, 'error').mockImplementation(() => {});

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('not a valid ISO 8601 date'));
  });

  // ── R27: Activation timestamp in the future → valid, scan proceeds ────────

  it('R27: ACCOUNTING_ACTIVATION_TIMESTAMP in the future → valid (not too old), scan proceeds', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS_FUTURE;
    process.env.ACCOUNTING_ENABLED_TENANTS      = TENANT_ID;

    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    // Future timestamp is within safety window (age is negative) → proceeds
    expect(prisma.branch.findMany).toHaveBeenCalled();
    expect(result.summary.scanned).toBe(0);
  });

  // ── R28: Activation timestamp <24h past → valid, scan proceeds ───────────

  it('R28: ACCOUNTING_ACTIVATION_TIMESTAMP <24h ago → valid, scan proceeds', async () => {
    const recentTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = recentTs;
    process.env.ACCOUNTING_ENABLED_TENANTS      = TENANT_ID;

    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(prisma.branch.findMany).toHaveBeenCalled();
    expect(result.summary.scanned).toBe(0);
  });

  // ── R29: Activation timestamp >24h past → blocked (SF-4 fix) ─────────────

  it('R29: ACCOUNTING_ACTIVATION_TIMESTAMP older than 24h → blocked, ERROR logged', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS_OLD; // '2020-01-01...'
    process.env.ACCOUNTING_ENABLED_TENANTS      = TENANT_ID;

    const errSpy = jest.spyOn(service['logger'] as any, 'error').mockImplementation(() => {});

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    expect(result.summary.scanned).toBe(0);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      'Accounting activation timestamp is older than allowed safety window; reconciliation blocked.',
    );
  });

  // ── R30: Historical sale excluded by fresh activation timestamp ───────────

  it('R30: sale.createdAt before activationTs → excluded from scan (DB query uses createdAt.gte)', async () => {
    enableAccounting();
    // DB mock simulates the DB filter: returns empty (sale is older than activationTs)
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.runReconciliation({ tenantId: TENANT_ID });

    // Verify the DB query passes the activation timestamp as createdAt.gte
    const call = (prisma.sale.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.createdAt.gte).toEqual(new Date(ACTIVATION_TS));
    expect(result.summary.scanned).toBe(0);
  });

  // ── R31: Cron with CORE=true but no allowlist → zero tenants, warning ─────

  it('R31: scheduledScan with CORE=true but no allowlist → DISABLED mode, warning logged', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS;
    // ACCOUNTING_ENABLED_TENANTS not set

    const warnSpy = jest.spyOn(service['logger'] as any, 'warn').mockImplementation(() => {});

    await service.scheduledScan();

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(adapter.recordSaleJournal).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no tenant allowlist configured'),
    );
  });

  // ── R32: Cron with "*" allowlist → scans all tenants from DB ─────────────

  it('R32: ACCOUNTING_ENABLED_TENANTS="*" → ALL_TENANTS mode, all tenants scanned', async () => {
    process.env.ACCOUNTING_CORE_ENABLED         = 'true';
    process.env.ACCOUNTING_ACTIVATION_TIMESTAMP = ACTIVATION_TS;
    process.env.ACCOUNTING_ENABLED_TENANTS      = '*';

    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      { id: 'tenant-a' },
      { id: 'tenant-b' },
    ]);
    (prisma.branch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);

    const warnSpy = jest.spyOn(service['logger'] as any, 'warn').mockImplementation(() => {});

    const result = await service.runReconciliation();

    expect(prisma.tenant.findMany).toHaveBeenCalled();
    expect(prisma.branch.findMany).toHaveBeenCalledTimes(2); // once per tenant
    expect(result.summary.scanned).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('full rollout explicitly enabled'),
    );
  });
});
