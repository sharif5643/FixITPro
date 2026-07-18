import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../database/prisma.service';

const BRANCH_ID = 'branch-1';
const TENANT_ID = 'tenant-1';
const START = new Date('2026-01-01T00:00:00Z');
const END   = new Date('2026-01-31T23:59:59Z');

function makeQuery() {
  return { branchId: BRANCH_ID, tenantId: TENANT_ID, startDate: START, endDate: END };
}

// Argument-based dispatcher for cashDrawerTransaction.findMany
// The 7 checks all run in Promise.all so call order is non-deterministic.
// Instead, inspect the `where` clause to return the right fixture.
function makeCdtFindMany(overrides: Record<string, any[]> = {}) {
  return jest.fn().mockImplementation((args: any) => {
    const w = args?.where ?? {};

    // Sale ledger refs: referenceType = 'SALE_PAYMENT' with `in` clause
    if (w.referenceType === 'SALE_PAYMENT' && w.referenceId?.in) {
      return Promise.resolve(overrides['saleRefs'] ?? []);
    }
    // Repair ledger refs
    if (w.referenceType === 'REPAIR_FINAL_PAYMENT' && w.referenceId?.in) {
      return Promise.resolve(overrides['repairRefs'] ?? []);
    }
    // Expense ledger refs
    if (w.referenceType === 'EXPENSE_PAYMENT' && w.referenceId?.in) {
      return Promise.resolve(overrides['expenseRefs'] ?? []);
    }
    // Orphan check: referenceId NOT null, no `type.not` filter
    if (w.referenceId?.not === null && !w.type) {
      return Promise.resolve(overrides['orphanEntries'] ?? []);
    }
    // Duplicate check: type.not = 'REVERSAL'
    if (w.type?.not === 'REVERSAL') {
      return Promise.resolve(overrides['dupEntries'] ?? []);
    }
    // Post-close check: sessionId is a specific string (not null)
    if (w.sessionId && w.createdAt?.gt) {
      return Promise.resolve(overrides['postCloseTxs'] ?? []);
    }
    // Unassigned check: sessionId = null, paymentMethod = 'CASH'
    if (w.sessionId === null && w.paymentMethod === 'CASH') {
      return Promise.resolve(overrides['unassigned'] ?? []);
    }
    return Promise.resolve([]);
  });
}

function makePrisma(opts: {
  sales?:        any[];
  repairs?:      any[];
  expenses?:     any[];
  sessions?:     any[];
  saleRefs?:     any[];
  repairRefs?:   any[];
  expenseRefs?:  any[];
  orphanEntries?: any[];
  dupEntries?:   any[];
  postCloseTxs?: any[];
  unassigned?:   any[];
  saleExists?:   boolean;
} = {}) {
  return {
    sale: {
      findMany:   jest.fn().mockResolvedValue(opts.sales ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.saleExists !== false ? { id: 'x' } : null),
    },
    repair: {
      findMany:   jest.fn().mockResolvedValue(opts.repairs ?? []),
      findUnique: jest.fn().mockResolvedValue({ id: 'x' }),
    },
    expense: {
      findMany:   jest.fn().mockResolvedValue(opts.expenses ?? []),
      findUnique: jest.fn().mockResolvedValue({ id: 'x' }),
    },
    cashDrawerTransaction: {
      findMany: makeCdtFindMany({
        saleRefs:     opts.saleRefs ?? [],
        repairRefs:   opts.repairRefs ?? [],
        expenseRefs:  opts.expenseRefs ?? [],
        orphanEntries: opts.orphanEntries ?? [],
        dupEntries:   opts.dupEntries ?? [],
        postCloseTxs: opts.postCloseTxs ?? [],
        unassigned:   opts.unassigned ?? [],
      }),
    },
    cashDrawerSession: {
      findMany: jest.fn().mockResolvedValue(opts.sessions ?? []),
    },
    saleRefund:              { findUnique: jest.fn().mockResolvedValue({ id: 'x' }) },
    repairAdditionalPayment: { findUnique: jest.fn().mockResolvedValue({ id: 'x' }) },
  };
}

describe('ReconciliationService', () => {
  async function build(opts: Parameters<typeof makePrisma>[0] = {}) {
    const prisma = makePrisma(opts);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return { service: module.get<ReconciliationService>(ReconciliationService), prisma };
  }

  // ── Check 1: missing sale payment ledger ──────────────────────────────────

  it('detects CASH sale without ledger entry as missing', async () => {
    const cashSale = { id: 'sale-1', receiptNumber: 'REC-001', total: '500', createdAt: new Date() };
    const { service } = await build({ sales: [cashSale], saleRefs: [] });

    const report = await service.runReport(makeQuery());

    expect(report.checks.missingSalePaymentLedger).toHaveLength(1);
    expect(report.checks.missingSalePaymentLedger[0].sourceId).toBe('sale-1');
  });

  it('does NOT flag CASH sale when ledger entry exists', async () => {
    const cashSale = { id: 'sale-1', receiptNumber: 'REC-001', total: '500', createdAt: new Date() };
    const { service } = await build({
      sales:    [cashSale],
      saleRefs: [{ referenceId: 'sale-1' }],
    });

    const report = await service.runReport(makeQuery());

    expect(report.checks.missingSalePaymentLedger).toHaveLength(0);
  });

  // ── Check 2: missing repair payment ledger ────────────────────────────────

  it('detects CASH repair payment without ledger entry', async () => {
    const cashRepair = { id: 'repair-1', ticketNumber: 'REP-001', paidAmount: '300', paidAt: new Date() };
    const { service } = await build({ repairs: [cashRepair], repairRefs: [] });

    const report = await service.runReport(makeQuery());

    expect(report.checks.missingRepairPaymentLedger).toHaveLength(1);
    expect(report.checks.missingRepairPaymentLedger[0].sourceId).toBe('repair-1');
  });

  // ── Check 3: missing expense ledger ──────────────────────────────────────

  it('detects CASH expense without ledger entry', async () => {
    const cashExpense = { id: 'exp-1', description: 'Office', amount: '200', createdAt: new Date() };
    const { service } = await build({ expenses: [cashExpense], expenseRefs: [] });

    const report = await service.runReport(makeQuery());

    expect(report.checks.missingExpensePaymentLedger).toHaveLength(1);
    expect(report.checks.missingExpensePaymentLedger[0].sourceId).toBe('exp-1');
  });

  // ── Check 4: orphan ledger entries ───────────────────────────────────────

  it('detects orphan ledger entry when referenced sale no longer exists', async () => {
    const orphan = {
      id: 'tx-orphan', referenceType: 'SALE_PAYMENT', referenceId: 'sale-deleted',
      amount: '100', createdAt: new Date(),
    };
    const { service } = await build({
      orphanEntries: [orphan],
      saleExists:    false,   // sale.findUnique returns null
    });

    const report = await service.runReport(makeQuery());

    expect(report.checks.orphanLedgerEntries).toHaveLength(1);
    expect(report.checks.orphanLedgerEntries[0].ledgerId).toBe('tx-orphan');
  });

  it('does NOT flag ledger entry as orphan when business record exists', async () => {
    const notOrphan = {
      id: 'tx-ok', referenceType: 'SALE_PAYMENT', referenceId: 'sale-existing',
      amount: '100', createdAt: new Date(),
    };
    const { service } = await build({
      orphanEntries: [notOrphan],
      saleExists:    true,    // sale.findUnique returns a record
    });

    const report = await service.runReport(makeQuery());

    expect(report.checks.orphanLedgerEntries).toHaveLength(0);
  });

  // ── Check 5: duplicate references ────────────────────────────────────────

  it('detects duplicate ledger entries for the same business record', async () => {
    const dupEntries = [
      { id: 'tx-1', referenceType: 'SALE_PAYMENT', referenceId: 'sale-dup' },
      { id: 'tx-2', referenceType: 'SALE_PAYMENT', referenceId: 'sale-dup' },
    ];
    const { service } = await build({ dupEntries });

    const report = await service.runReport(makeQuery());

    expect(report.checks.duplicateReferences).toHaveLength(1);
    expect(report.checks.duplicateReferences[0].count).toBe(2);
    expect(report.checks.duplicateReferences[0].referenceId).toBe('sale-dup');
  });

  it('does NOT flag single ledger entry per reference as duplicate', async () => {
    const { service } = await build({
      dupEntries: [{ id: 'tx-1', referenceType: 'SALE_PAYMENT', referenceId: 'sale-ok' }],
    });

    const report = await service.runReport(makeQuery());

    expect(report.checks.duplicateReferences).toHaveLength(0);
  });

  // ── Check 6: post-close transactions ─────────────────────────────────────

  it('detects transaction timestamped after session closedAt', async () => {
    const closedAt = new Date('2026-01-15T10:00:00Z');
    const postCloseTx = { id: 'tx-late', amount: '50', createdAt: new Date('2026-01-15T11:00:00Z') };
    const { service } = await build({
      sessions:     [{ id: 'sess-1', closedAt }],
      postCloseTxs: [postCloseTx],
    });

    const report = await service.runReport(makeQuery());

    expect(report.checks.postCloseTransactions).toHaveLength(1);
    expect(report.checks.postCloseTransactions[0].ledgerId).toBe('tx-late');
  });

  it('returns empty when no sessions are closed', async () => {
    const { service } = await build({ sessions: [] });

    const report = await service.runReport(makeQuery());

    expect(report.checks.postCloseTransactions).toHaveLength(0);
  });

  // ── Check 7: unassigned CASH entries ─────────────────────────────────────

  it('detects unassigned cash entries (sessionId=null)', async () => {
    const unassigned = {
      id: 'tx-unassigned', sourceType: 'SALE_PAYMENT', referenceId: 'sale-x',
      amount: '300', createdAt: new Date(),
    };
    const { service } = await build({ unassigned: [unassigned] });

    const report = await service.runReport(makeQuery());

    expect(report.checks.unassignedCashEntries).toHaveLength(1);
    expect(report.checks.unassignedCashEntries[0].ledgerId).toBe('tx-unassigned');
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  it('returns totalIssues=0 when all checks are clean', async () => {
    const { service } = await build();

    const report = await service.runReport(makeQuery());

    expect(report.summary.totalIssues).toBe(0);
    expect(report.checks.missingSalePaymentLedger).toHaveLength(0);
    expect(report.checks.unassignedCashEntries).toHaveLength(0);
  });

  it('report includes query metadata and generatedAt timestamp', async () => {
    const { service } = await build();

    const report = await service.runReport(makeQuery());

    expect(report.query.branchId).toBe(BRANCH_ID);
    expect(report.summary.generatedAt).toBeTruthy();
  });
});
