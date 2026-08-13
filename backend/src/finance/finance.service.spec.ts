import { Test } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { PrismaService } from '../database/prisma.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma(txns: any[] = [], branches: any[] = []) {
  return {
    cashDrawerTransaction: {
      findMany: jest.fn().mockResolvedValue(txns),
      count:    jest.fn().mockResolvedValue(txns.length),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue(branches),
    },
  };
}

function tx(opts: {
  direction: 'IN' | 'OUT';
  amount: number | string;
  sourceType?: string | null;
  type?: string;
  branchId?: string | null;
  createdAt?: Date;
}) {
  return {
    id:            'txn-1',
    type:          opts.type ?? 'SALE',
    direction:     opts.direction,
    amount:        opts.amount,
    sourceType:    opts.sourceType ?? null,
    referenceType: null,
    referenceId:   null,
    paymentMethod: 'CASH',
    reason:        null,
    createdAt:     opts.createdAt ?? new Date(),
    sessionId:     null,
    actorUserId:   null,
    branchId:      opts.branchId ?? null,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('FinanceService', () => {
  let svc: FinanceService;
  let prisma: ReturnType<typeof makePrisma>;

  async function build(txns: any[] = [], branches: any[] = []) {
    prisma = makePrisma(txns, branches);
    const mod = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(FinanceService);
  }

  // ── getSummary ──────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns zeros when no transactions', async () => {
      await build([]);
      const result = await svc.getSummary({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result.totalIn).toBe(0);
      expect(result.totalOut).toBe(0);
      expect(result.net).toBe(0);
      expect(result.txnCount).toBe(0);
      expect(result.bySource).toEqual({});
    });

    it('sums IN and OUT amounts correctly', async () => {
      await build([
        tx({ direction: 'IN',  amount: 500, sourceType: 'SALE_PAYMENT' }),
        tx({ direction: 'IN',  amount: 200, sourceType: 'REPAIR_DEPOSIT' }),
        tx({ direction: 'OUT', amount: 100, sourceType: 'EXPENSE_PAYMENT' }),
      ]);
      const result = await svc.getSummary({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result.totalIn).toBe(700);
      expect(result.totalOut).toBe(100);
      expect(result.net).toBe(600);
      expect(result.txnCount).toBe(3);
    });

    it('groups bySource correctly', async () => {
      await build([
        tx({ direction: 'IN',  amount: 300, sourceType: 'SALE_PAYMENT' }),
        tx({ direction: 'IN',  amount: 200, sourceType: 'SALE_PAYMENT' }),
        tx({ direction: 'OUT', amount: 100, sourceType: 'EXPENSE_PAYMENT' }),
      ]);
      const result = await svc.getSummary({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result.bySource['SALE_PAYMENT']).toEqual({ in: 500, out: 0 });
      expect(result.bySource['EXPENSE_PAYMENT']).toEqual({ in: 0, out: 100 });
    });

    it('handles Decimal amounts (stringified)', async () => {
      await build([
        tx({ direction: 'IN', amount: '1234.56', sourceType: 'SALE_PAYMENT' }),
      ]);
      const result = await svc.getSummary({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result.totalIn).toBeCloseTo(1234.56);
    });

    it('falls back to type when sourceType is null', async () => {
      await build([
        tx({ direction: 'IN', amount: 100, sourceType: null, type: 'OPENING' }),
      ]);
      const result = await svc.getSummary({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result.bySource['OPENING']).toBeDefined();
    });

    it('returns correct period in response', async () => {
      await build([]);
      const result = await svc.getSummary({ startDate: '2026-02-01', endDate: '2026-02-28' });
      expect(result.period).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    });
  });

  // ── getTransactions ─────────────────────────────────────────────────────────

  describe('getTransactions', () => {
    it('returns data and pagination meta', async () => {
      const txnList = [tx({ direction: 'IN', amount: 100 })];
      prisma = {
        cashDrawerTransaction: {
          findMany: jest.fn().mockResolvedValue(txnList),
          count:    jest.fn().mockResolvedValue(1),
        },
        branch: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const mod = await Test.createTestingModule({
        providers: [
          FinanceService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      svc = mod.get(FinanceService);

      const result = await svc.getTransactions({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('converts amount to number', async () => {
      const item = { ...tx({ direction: 'IN', amount: '999.99' }) };
      prisma = {
        cashDrawerTransaction: {
          findMany: jest.fn().mockResolvedValue([item]),
          count:    jest.fn().mockResolvedValue(1),
        },
        branch: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const mod = await Test.createTestingModule({
        providers: [
          FinanceService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      svc = mod.get(FinanceService);

      const result = await svc.getTransactions({});
      expect(typeof result.data[0].amount).toBe('number');
      expect(result.data[0].amount).toBeCloseTo(999.99);
    });

    it('clamps limit to 1–100', async () => {
      await build([]);
      await svc.getTransactions({ limit: 999 });
      const call = (prisma.cashDrawerTransaction.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('calculates skip correctly for page 2', async () => {
      await build([]);
      await svc.getTransactions({ page: 2, limit: 20 });
      const call = (prisma.cashDrawerTransaction.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(20);
    });
  });

  // ── getBranchPnL ────────────────────────────────────────────────────────────

  describe('getBranchPnL', () => {
    it('returns empty array when no transactions', async () => {
      await build([]);
      const result = await svc.getBranchPnL({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result).toEqual([]);
    });

    it('groups transactions by branchId', async () => {
      await build(
        [
          tx({ direction: 'IN',  amount: 500, branchId: 'branch-1' }),
          tx({ direction: 'OUT', amount: 100, branchId: 'branch-1' }),
          tx({ direction: 'IN',  amount: 300, branchId: 'branch-2' }),
        ],
        [
          { id: 'branch-1', name: 'สาขาหลัก' },
          { id: 'branch-2', name: 'สาขา 2' },
        ],
      );
      const result = await svc.getBranchPnL({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result).toHaveLength(2);

      const b1 = result.find(r => r.branchId === 'branch-1')!;
      expect(b1.branchName).toBe('สาขาหลัก');
      expect(b1.totalIn).toBe(500);
      expect(b1.totalOut).toBe(100);
      expect(b1.net).toBe(400);

      const b2 = result.find(r => r.branchId === 'branch-2')!;
      expect(b2.totalIn).toBe(300);
      expect(b2.net).toBe(300);
    });

    it('falls back to "ไม่ระบุสาขา" for null branchId', async () => {
      await build([
        tx({ direction: 'IN', amount: 100, branchId: null }),
      ]);
      const result = await svc.getBranchPnL({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result[0].branchId).toBe('unassigned');
      expect(result[0].branchName).toBe('ไม่ระบุสาขา');
    });

    it('sorts results by net descending', async () => {
      await build(
        [
          tx({ direction: 'IN', amount: 200, branchId: 'b1' }),
          tx({ direction: 'IN', amount: 800, branchId: 'b2' }),
        ],
        [
          { id: 'b1', name: 'B1' },
          { id: 'b2', name: 'B2' },
        ],
      );
      const result = await svc.getBranchPnL({ startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(result[0].branchId).toBe('b2');
      expect(result[1].branchId).toBe('b1');
    });
  });
});
