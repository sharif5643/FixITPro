import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RepairsService } from './repairs.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WarrantiesService } from '../warranties/warranties.service';
import { LineMessagingService } from '../line-messaging/line-messaging.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const BRANCH_ID = 'branch-1';
const TENANT_ID = 'tenant-1';
const ACTOR_ID  = 'user-1';

const MOCK_REPAIR_COMPLETED = {
  id: 'r-1', ticketNumber: 'REP-001', status: 'COMPLETED', paymentStatus: 'PENDING',
  estimatedTotal: 500, finalCost: null, estimateCost: null, deposit: 0, branchId: BRANCH_ID,
  customer: null, technician: null, branch: { tenantId: TENANT_ID },
  images: [], qc: null, parts: [], warranties: [],
  additionalPayments: [], paymentReversals: [],
};

const MOCK_REPAIR_NO_BRANCH = { ...MOCK_REPAIR_COMPLETED, branchId: null, branch: null };

const MOCK_REPAIR_DELIVERED = {
  ...MOCK_REPAIR_COMPLETED, id: 'r-2', status: 'DELIVERED', paymentStatus: 'PAID',
  paidAmount: 500, paymentMethod: 'CASH',
};

// ── Prisma mock factory ────────────────────────────────────────────────────────

function makePrisma() {
  return {
    repair:  { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    shift:   { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }) },
    branch:  { findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }) },
    repairAdditionalPayment: { findUnique: jest.fn() },
    repairPaymentReversal:   { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('RepairsService — Workflow tests (RC1)', () => {
  let service: RepairsService;
  let prisma:  ReturnType<typeof makePrisma>;
  let accounting: { record: jest.Mock };
  let auditLog:   { log: jest.Mock; logWithTx: jest.Mock };

  beforeEach(async () => {
    prisma     = makePrisma();
    accounting = { record: jest.fn().mockResolvedValue({ id: 'acctx-1' }) };
    auditLog   = { log: jest.fn().mockResolvedValue(undefined), logWithTx: jest.fn().mockResolvedValue(undefined) };

    const warranties = { createForRepair: jest.fn().mockResolvedValue({}) };
    const lineMsg    = { notifyRepairStatus: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepairsService,
        { provide: PrismaService,        useValue: prisma },
        { provide: AuditLogService,      useValue: auditLog },
        { provide: WarrantiesService,    useValue: warranties },
        { provide: LineMessagingService, useValue: lineMsg },
        { provide: AccountingService,    useValue: accounting },
      ],
    }).compile();

    service = module.get<RepairsService>(RepairsService);
  });

  // ── 1. processPayment — CASH with branchId ───────────────────────────────

  describe('processPayment — accounting integration', () => {
    const dto = { paymentMethod: 'CASH', amountPaid: 500, warrantyDays: 0, finalCost: null };

    it('TC-R1: CASH payment with branchId → accounting.record called with REPAIR_FINAL_PAYMENT IN', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_COMPLETED);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repair: {
            updateMany:        jest.fn().mockResolvedValue({ count: 1 }),
            findUnique:        jest.fn().mockResolvedValue({ branchId: BRANCH_ID, branch: { tenantId: TENANT_ID } }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED),
          },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });

      await service.processPayment('r-1', dto as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.REPAIR_FINAL_PAYMENT,
          direction:     'IN',
          paymentMethod: 'CASH',
          branchId:      BRANCH_ID,
          tenantId:      TENANT_ID,
        }),
        expect.anything(), // tx client
      );
    });

    it('TC-R2: TRANSFER payment → accounting.record called (non-CASH passthrough via AccountingService)', async () => {
      const transferDto = { ...dto, paymentMethod: 'TRANSFER' };
      accounting.record.mockResolvedValue(null);
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_COMPLETED);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repair: {
            updateMany:        jest.fn().mockResolvedValue({ count: 1 }),
            findUnique:        jest.fn().mockResolvedValue({ branchId: BRANCH_ID, branch: { tenantId: TENANT_ID } }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED),
          },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });

      await service.processPayment('r-1', transferDto as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'TRANSFER' }),
        expect.anything(),
      );
    });

    it('TC-R3: no branchId → accounting.record NOT called', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_NO_BRANCH);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repair: {
            updateMany:        jest.fn().mockResolvedValue({ count: 1 }),
            findUnique:        jest.fn().mockResolvedValue({ branchId: null, branch: null }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(MOCK_REPAIR_NO_BRANCH),
          },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });

      await service.processPayment('r-1', dto as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).not.toHaveBeenCalled();
    });

    it('TC-R4: already PAID guard — second payment attempt throws BadRequestException', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue({
        ...MOCK_REPAIR_COMPLETED, paymentStatus: 'PAID',
      });

      await expect(service.processPayment('r-1', dto as any, ACTOR_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── 2. addAdditionalPayment ──────────────────────────────────────────────

  describe('addAdditionalPayment — accounting integration', () => {
    const addDto = { paymentMethod: 'CASH', amount: 200, note: 'เพิ่มงาน' };

    it('TC-R5: CASH additional payment → accounting.record called with REPAIR_ADDITIONAL_PAYMENT IN', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue({
        ...MOCK_REPAIR_COMPLETED, status: 'COMPLETED', branchId: BRANCH_ID,
      });

      const createdPayment = { id: 'add-pay-1', repairId: 'r-1', amount: 200 };
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairAdditionalPayment: { create: jest.fn().mockResolvedValue(createdPayment) },
          branch: { findUnique: jest.fn().mockResolvedValue({ tenantId: TENANT_ID }) },
        };
        return fn(tx);
      });

      await service.addAdditionalPayment('r-1', addDto as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
          direction:     'IN',
          paymentMethod: 'CASH',
          amount:        200,
          branchId:      BRANCH_ID,
        }),
        expect.anything(),
      );
    });
  });

  // ── 3. reversePayment — accounting reversal (RC1-002) ────────────────────

  describe('reversePayment — accounting reversal (RC1-002)', () => {
    it('TC-R6: CASH reverse → accounting.record called with REVERSAL OUT (RC1-002 fix)', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_DELIVERED);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
          repair: { update: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED) },
          cashDrawerTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'orig-ledger-1' }) },
        };
        return fn(tx);
      });

      await service.reversePayment('r-2', { reason: 'ลูกค้าไม่พอใจ' } as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.REVERSAL,
          direction:     'OUT',
          paymentMethod: 'CASH',
          amount:        500,
        }),
        expect.anything(),
      );
    });

    it('TC-RP1: reversalOfId links to original REPAIR_FINAL_PAYMENT ledger entry', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_DELIVERED);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
          repair: { update: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED) },
          cashDrawerTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'orig-ledger-99' }) },
        };
        return fn(tx);
      });

      await service.reversePayment('r-2', { reason: 'ทดสอบ' } as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({ reversalOfId: 'orig-ledger-99' }),
        expect.anything(),
      );
    });

    it('TC-RP2: TRANSFER payment reverse → accounting.record called (non-CASH passthrough, no drawer entry)', async () => {
      const transferRepair = { ...MOCK_REPAIR_DELIVERED, paymentMethod: 'TRANSFER' };
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(transferRepair);
      accounting.record.mockResolvedValue(null);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-2' }) },
          repair: { update: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED) },
        };
        return fn(tx);
      });

      await service.reversePayment('r-2', { reason: 'ทดสอบ' } as any, ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.REVERSAL,
          paymentMethod: 'TRANSFER',
          direction:     'OUT',
        }),
        expect.anything(),
      );
    });

    it('TC-RP3: double reverse → BadRequestException (paymentStatus=PENDING blocks second call)', async () => {
      const alreadyReversed = {
        ...MOCK_REPAIR_DELIVERED,
        status: 'COMPLETED',
        paymentStatus: 'PENDING',
      };
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(alreadyReversed);

      await expect(
        service.reversePayment('r-2', { reason: 'ซ้ำ' } as any, ACTOR_ID, TENANT_ID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-RP4: accounting.record throws inside tx → reversePayment rejects, auditLog NOT written', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_DELIVERED);
      accounting.record.mockRejectedValue(new Error('LEDGER_WRITE_FAILED'));

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
          repair: { update: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED) },
          cashDrawerTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'orig-1' }) },
        };
        return fn(tx);
      });

      await expect(
        service.reversePayment('r-2', { reason: 'ทดสอบ' } as any, ACTOR_ID, TENANT_ID),
      ).rejects.toThrow('LEDGER_WRITE_FAILED');

      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('TC-RP5: repair after reversal — paymentStatus=PENDING, paidAmount=null, status=COMPLETED', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_DELIVERED);

      const reversedRepair = {
        ...MOCK_REPAIR_COMPLETED,
        status:        'COMPLETED',
        paymentStatus: 'PENDING',
        paymentMethod: null,
        paidAmount:    null,
        paidAt:        null,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
          repair: { update: jest.fn().mockResolvedValue(reversedRepair) },
          cashDrawerTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'orig-1' }) },
        };
        return fn(tx);
      });

      const result = await service.reversePayment('r-2', { reason: 'ทดสอบ' } as any, ACTOR_ID, TENANT_ID);

      expect(result.paymentStatus).toBe('PENDING');
      expect(result.paidAmount).toBeNull();
      expect((result as any).paymentMethod).toBeNull();
      expect(result.status).toBe('COMPLETED');
    });

    it('TC-RP6: REVERSAL sourceType safe for reconciliation (excluded from duplicate + orphan checks)', async () => {
      (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR_DELIVERED);

      let capturedEntry: any = null;
      accounting.record.mockImplementation(async (entry: any) => {
        capturedEntry = entry;
        return { id: 'rev-ledger-1', type: 'REVERSAL' };
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          repairPaymentReversal: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
          repair: { update: jest.fn().mockResolvedValue(MOCK_REPAIR_COMPLETED) },
          cashDrawerTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'orig-1' }) },
        };
        return fn(tx);
      });

      await service.reversePayment('r-2', { reason: 'ทดสอบ' } as any, ACTOR_ID, TENANT_ID);

      // sourceType=REVERSAL → DB type='REVERSAL' → excluded from findDuplicateReferences
      // referenceType='REVERSAL' → else branch in findOrphanLedgerEntries → exists=true
      // After reversal paymentStatus=PENDING → excluded from findMissingRepairPaymentLedger
      expect(capturedEntry?.sourceType).toBe(ACCOUNTING_SOURCE.REVERSAL);
      expect(capturedEntry?.direction).toBe('OUT');
    });
  });
});
