import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const BRANCH_ID  = 'branch-1';
const TENANT_ID  = 'tenant-1';
const ACTOR_ID   = 'user-1';
const CATEGORY_ID = 'cat-1';

const ACTIVE_CATEGORY = { id: CATEGORY_ID, name: 'ค่าเช่า', code: 'rent', isActive: true };
const ACTIVE_SHIFT    = { id: 'shift-1' };

const BASE_DTO = {
  categoryId:    CATEGORY_ID,
  amount:        500,
  description:   'ค่าเช่าเดือนกรกฎาคม',
  paymentMethod: 'CASH',
  expenseDate:   '2026-07-18',
};

const CREATED_EXPENSE = {
  id: 'exp-1', ...BASE_DTO, branchId: BRANCH_ID, createdById: ACTOR_ID, voidedAt: null,
  category: ACTIVE_CATEGORY, createdBy: { id: ACTOR_ID, name: 'Test User' },
};

// ── Prisma mock factory ────────────────────────────────────────────────────────

function makePrisma(opts: { shiftActive?: boolean } = {}) {
  return {
    // onModuleInit stubs — must resolve so compile() succeeds
    expenseCategory: {
      count:      jest.fn().mockResolvedValue(1),     // >0 → skip seed
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(ACTIVE_CATEGORY),
      findMany:   jest.fn().mockResolvedValue([ACTIVE_CATEGORY]),
      update:     jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    shift: {
      findFirst: jest.fn().mockResolvedValue(opts.shiftActive !== false ? ACTIVE_SHIFT : null),
    },
    expense: {
      create:   jest.fn().mockResolvedValue(CREATED_EXPENSE),
      findFirst: jest.fn().mockResolvedValue({ ...CREATED_EXPENSE }),
      findMany:  jest.fn().mockResolvedValue([]),
      count:     jest.fn().mockResolvedValue(0),
      update:    jest.fn().mockResolvedValue({ ...CREATED_EXPENSE, voidedAt: new Date() }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    branch: {
      findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }),
    },
    $transaction: jest.fn(),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('ExpensesService — Workflow tests (RC1)', () => {
  let service: ExpensesService;
  let prisma:  ReturnType<typeof makePrisma>;
  let accounting: { record: jest.Mock };
  let auditLog:   { log: jest.Mock };

  async function build(opts: Parameters<typeof makePrisma>[0] = {}) {
    prisma     = makePrisma(opts);
    accounting = { record: jest.fn().mockResolvedValue({ id: 'acctx-1' }) };
    auditLog   = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService,     useValue: prisma },
        { provide: AuditLogService,   useValue: auditLog },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  }

  // ── 1. CASH expense: ledger OUT entry created ─────────────────────────────

  it('TC-E1: CASH expense with branchId → accounting.record called with EXPENSE_PAYMENT OUT', async () => {
    await build();

    const txExpense = { ...CREATED_EXPENSE };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: { create: jest.fn().mockResolvedValue(txExpense) },
        branch:  { findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }) },
      };
      return fn(tx);
    });

    await service.create(BASE_DTO as any, ACTOR_ID, 'OWNER', BRANCH_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:    ACCOUNTING_SOURCE.EXPENSE_PAYMENT,
        direction:     'OUT',
        paymentMethod: 'CASH',
        amount:        500,
        branchId:      BRANCH_ID,
      }),
      expect.anything(), // tx client
    );
  });

  it('TC-E2: TRANSFER expense with branchId → accounting.record still called (AccountingService skips internally)', async () => {
    await build();

    accounting.record.mockResolvedValue(null); // non-CASH → accounting service returns null

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: { create: jest.fn().mockResolvedValue({ ...CREATED_EXPENSE, paymentMethod: 'TRANSFER' }) },
        branch:  { findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }) },
      };
      return fn(tx);
    });

    const transferDto = { ...BASE_DTO, paymentMethod: 'TRANSFER' };
    await service.create(transferDto as any, ACTOR_ID, 'OWNER', BRANCH_ID);

    // Service always calls accounting.record; AccountingService handles non-CASH skip internally
    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'TRANSFER' }),
      expect.anything(),
    );
  });

  it('TC-E3: expense without branchId → accounting.record NOT called', async () => {
    await build();

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: { create: jest.fn().mockResolvedValue({ ...CREATED_EXPENSE, branchId: null }) },
      };
      return fn(tx);
    });

    await service.create(BASE_DTO as any, ACTOR_ID, 'OWNER', undefined); // no branchId

    expect(accounting.record).not.toHaveBeenCalled();
  });

  // ── 2. Role guard ─────────────────────────────────────────────────────────

  it('TC-E4: CASHIER role → ForbiddenException before any DB call', async () => {
    await build();

    await expect(service.create(BASE_DTO as any, ACTOR_ID, 'CASHIER', BRANCH_ID))
      .rejects.toThrow(ForbiddenException);

    expect(prisma.expenseCategory.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('TC-E5: TECHNICIAN role → ForbiddenException', async () => {
    await build();

    await expect(service.create(BASE_DTO as any, ACTOR_ID, 'TECHNICIAN', BRANCH_ID))
      .rejects.toThrow(ForbiddenException);
  });

  // ── 3. voidExpense: REVERSAL ledger entry (RC1-001 fix) ──────────────────────

  it('TC-E6: CASH expense void → accounting.record called with REVERSAL IN (RC1-001)', async () => {
    await build();

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: {
          update: jest.fn().mockResolvedValue({ ...CREATED_EXPENSE, voidedAt: new Date() }),
        },
        cashDrawerTransaction: {
          findFirst: jest.fn().mockResolvedValue({ id: 'orig-tx-1' }),
        },
      };
      return fn(tx);
    });

    await service.voidExpense('exp-1', { voidReason: 'ยกเลิก' } as any, ACTOR_ID, 'OWNER', TENANT_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:   ACCOUNTING_SOURCE.REVERSAL,
        direction:    'IN',
        paymentMethod: 'CASH',
        amount:        500,
        reversalOfId:  'orig-tx-1',
      }),
      expect.anything(),
    );
  });

  it('TC-E9: TRANSFER expense void → accounting.record called with REVERSAL (non-CASH passthrough)', async () => {
    await build();

    const transferExpense = { ...CREATED_EXPENSE, paymentMethod: 'TRANSFER' };
    (prisma.expense.findFirst as jest.Mock).mockResolvedValue(transferExpense);
    accounting.record.mockResolvedValue(null);

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: {
          update: jest.fn().mockResolvedValue({ ...transferExpense, voidedAt: new Date() }),
        },
      };
      return fn(tx);
    });

    await service.voidExpense('exp-1', { voidReason: 'ยกเลิก' } as any, ACTOR_ID, 'OWNER', TENANT_ID);

    expect(accounting.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:    ACCOUNTING_SOURCE.REVERSAL,
        paymentMethod: 'TRANSFER',
        direction:     'IN',
      }),
      expect.anything(),
    );
  });

  it('TC-E10: ledger failure inside tx → voidExpense rejects, auditLog NOT written', async () => {
    await build();

    accounting.record.mockRejectedValue(new BadRequestException('CASH_DRAWER_SESSION_REQUIRED'));

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        expense: {
          update: jest.fn().mockResolvedValue({ ...CREATED_EXPENSE, voidedAt: new Date() }),
        },
        cashDrawerTransaction: {
          findFirst: jest.fn().mockResolvedValue({ id: 'orig-tx-1' }),
        },
      };
      return fn(tx);
    });

    await expect(
      service.voidExpense('exp-1', { voidReason: 'ยกเลิก' } as any, ACTOR_ID, 'OWNER', TENANT_ID),
    ).rejects.toThrow('CASH_DRAWER_SESSION_REQUIRED');

    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('TC-E7: inactive category → BadRequestException before tx', async () => {
    await build();
    (prisma.expenseCategory.findUnique as jest.Mock).mockResolvedValue({ ...ACTIVE_CATEGORY, isActive: false });

    await expect(service.create(BASE_DTO as any, ACTOR_ID, 'OWNER', BRANCH_ID))
      .rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('TC-E8: void already-voided expense → BadRequestException', async () => {
    await build();
    (prisma.expense.findFirst as jest.Mock).mockResolvedValue({ ...CREATED_EXPENSE, voidedAt: new Date() });

    await expect(service.voidExpense('exp-1', { voidReason: 'test' } as any, ACTOR_ID, 'OWNER', TENANT_ID))
      .rejects.toThrow(BadRequestException);
  });
});
