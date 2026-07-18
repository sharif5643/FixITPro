import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const BRANCH_ID = 'branch-1';
const TENANT_ID = 'tenant-1';
const ACTOR_ID  = 'user-1';
const SHIFT_ID  = 'shift-1';

const MOCK_PRODUCT = {
  id: 'prod-1', name: 'Widget', sku: 'W1', isActive: true,
  stock: 10, minStock: 2, costPrice: 100, price: 200,
  hasSerial: false, warrantyDays: 0, tenantId: TENANT_ID,
};

const MOCK_SERIAL_PRODUCT = {
  ...MOCK_PRODUCT, id: 'prod-serial', name: 'iPhone', hasSerial: true,
};

const CREATED_CASH_SALE = {
  id: 'sale-1', receiptNumber: 'RCP-001', total: 200, paymentMethod: 'CASH',
  status: 'COMPLETED', branchId: BRANCH_ID, shiftId: SHIFT_ID, customer: null,
  items: [{ id: 'si-1', productId: 'prod-1', quantity: 1, product: MOCK_PRODUCT }],
};

const CREATED_TRANSFER_SALE = { ...CREATED_CASH_SALE, paymentMethod: 'TRANSFER', id: 'sale-2' };

// ── Mock factory helpers ───────────────────────────────────────────────────────

function makeCreateTx(overrides: Record<string, any> = {}) {
  return {
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create:    jest.fn().mockResolvedValue({ id: 'c-1' }),
    },
    sale:         { create: jest.fn().mockResolvedValue(CREATED_CASH_SALE) },
    branchStock: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ quantity: 9 }),
      aggregate:  jest.fn().mockResolvedValue({ _sum: { quantity: 9 } }),
    },
    product:      { update: jest.fn().mockResolvedValue(MOCK_PRODUCT), updateMany: jest.fn() },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    serialNumber: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    auditLog:     { create: jest.fn() },
    ...overrides,
  };
}

function makeVoidTx() {
  return {
    sale:          { update: jest.fn().mockResolvedValue({ ...CREATED_CASH_SALE, status: 'VOIDED' }) },
    serialNumber:  { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    branchStock: {
      upsert:    jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 10 } }),
    },
    product:       { update: jest.fn().mockResolvedValue(MOCK_PRODUCT) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('SalesService — Workflow tests (RC1)', () => {
  let service: SalesService;
  let prisma:  any;
  let accounting: { record: jest.Mock };
  let auditLog:   { log: jest.Mock; logWithTx: jest.Mock };
  let notif:      { notify: jest.Mock; notifyLowStock: jest.Mock };

  beforeEach(async () => {
    accounting = { record: jest.fn().mockResolvedValue({ id: 'acctx-1', type: 'DEPOSIT' }) };
    auditLog   = { log: jest.fn().mockResolvedValue(undefined), logWithTx: jest.fn().mockResolvedValue(undefined) };
    notif      = { notify: jest.fn().mockResolvedValue(undefined), notifyLowStock: jest.fn().mockResolvedValue(undefined) };

    prisma = {
      branch:       { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      shift:        {
        findFirst:  jest.fn().mockResolvedValue({ id: SHIFT_ID }),
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      product:      { findMany: jest.fn().mockResolvedValue([MOCK_PRODUCT]), findUnique: jest.fn().mockResolvedValue(MOCK_PRODUCT) },
      branchStock:  { findMany: jest.fn().mockResolvedValue([{ productId: 'prod-1', quantity: 10 }]) },
      sale:         { findFirst: jest.fn().mockResolvedValue(CREATED_CASH_SALE) },
      customer:     { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService,        useValue: prisma },
        { provide: AuditLogService,      useValue: auditLog },
        { provide: NotificationsService, useValue: notif },
        { provide: AccountingService,    useValue: accounting },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  // ── 1. CASH sale: accounting ledger IN recorded ───────────────────────────────

  describe('create — CASH payment', () => {
    const dto = { items: [{ productId: 'prod-1', quantity: 1, price: 200 }], paymentMethod: 'CASH', amountPaid: 200 };

    it('TC-W1: records SALE_PAYMENT IN ledger entry for CASH sale with branchId', async () => {
      const tx = makeCreateTx();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      await service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.SALE_PAYMENT,
          direction:     'IN',
          paymentMethod: 'CASH',
          branchId:      BRANCH_ID,
          tenantId:      TENANT_ID,
        }),
        expect.anything(), // tx client
      );
    });

    it('TC-W2: sale succeeds even when accounting returns null (non-CASH passthrough)', async () => {
      const transferDto = { ...dto, paymentMethod: 'TRANSFER' };
      accounting.record.mockResolvedValue(null);
      const tx = makeCreateTx({ sale: { create: jest.fn().mockResolvedValue(CREATED_TRANSFER_SALE) } });
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      const result = await service.create(transferDto as any, ACTOR_ID, BRANCH_ID, TENANT_ID);

      expect(result).toBeDefined();
      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'TRANSFER' }),
        expect.anything(),
      );
    });

    it('TC-W3: post-tx low-stock notification sent for each product', async () => {
      const tx = makeCreateTx();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      await service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID);

      expect(notif.notifyLowStock).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Pre-transaction guards ─────────────────────────────────────────────────

  describe('create — pre-transaction guards', () => {
    const dto = { items: [{ productId: 'prod-1', quantity: 1, price: 200 }], paymentMethod: 'CASH', amountPaid: 200 };

    it('TC-W4: no active shift → BadRequestException, no DB write', async () => {
      (prisma.shift.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W5: product not found for tenant → NotFoundException (cross-tenant guard)', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]); // product not in this tenant

      await expect(service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W6: insufficient branch stock (pre-tx snapshot check) → BadRequestException', async () => {
      (prisma.branchStock.findMany as jest.Mock).mockResolvedValue([{ productId: 'prod-1', quantity: 0 }]);

      await expect(service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W7: serial product without serialIds → BadRequestException', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([MOCK_SERIAL_PRODUCT]);
      (prisma.branchStock.findMany as jest.Mock).mockResolvedValue([{ productId: 'prod-serial', quantity: 5 }]);
      const serialDto = { items: [{ productId: 'prod-serial', quantity: 1, price: 200 }], paymentMethod: 'CASH', amountPaid: 200 };

      await expect(service.create(serialDto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W8: amountPaid < total → BadRequestException', async () => {
      const shortDto = { ...dto, amountPaid: 100 }; // total=200, paid=100

      await expect(service.create(shortDto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W9: in-transaction stock depletion (count=0) → BadRequestException, transaction aborted', async () => {
      const tx = makeCreateTx({
        branchStock: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue({ quantity: 0 }),
          aggregate:  jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
      });
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      await expect(service.create(dto as any, ACTOR_ID, BRANCH_ID, TENANT_ID))
        .rejects.toThrow();

      expect(accounting.record).not.toHaveBeenCalled();
    });
  });

  // ── 3. voidSale ───────────────────────────────────────────────────────────────

  describe('voidSale', () => {
    it('TC-W10: CASH sale void → accounting.record called with SALE_REFUND OUT direction', async () => {
      const tx = makeVoidTx();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      await service.voidSale('sale-1', 'ลูกค้าเปลี่ยนใจ', ACTOR_ID, TENANT_ID);

      expect(accounting.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType:    ACCOUNTING_SOURCE.SALE_REFUND,
          direction:     'OUT',
          paymentMethod: 'CASH',
          amount:        200,
        }),
        expect.anything(),
      );
    });

    it('TC-W11: TRANSFER sale void → accounting.record NOT called', async () => {
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(CREATED_TRANSFER_SALE);
      const tx = makeVoidTx();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));

      await service.voidSale('sale-2', 'ลูกค้าเปลี่ยนใจ', ACTOR_ID, TENANT_ID);

      expect(accounting.record).not.toHaveBeenCalled();
    });

    it('TC-W12: already VOIDED sale → BadRequestException before tx', async () => {
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue({ ...CREATED_CASH_SALE, status: 'VOIDED' });

      await expect(service.voidSale('sale-1', 'test', ACTOR_ID, TENANT_ID))
        .rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W13: no active shift for actor → BadRequestException before findOne', async () => {
      (prisma.shift.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.voidSale('sale-1', 'test', ACTOR_ID, TENANT_ID))
        .rejects.toThrow('กรุณาเปิดกะก่อนยกเลิกบิล');

      expect(prisma.sale.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('TC-W14: void restores stock inside tx — branchStock.upsert called per item', async () => {
      const txMock = makeVoidTx();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(txMock));

      await service.voidSale('sale-1', 'test', ACTOR_ID, TENANT_ID);

      expect(txMock.branchStock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId_productId: { branchId: BRANCH_ID, productId: 'prod-1' } }),
          update: expect.objectContaining({ quantity: { increment: 1 } }),
        }),
      );
    });
  });
});
