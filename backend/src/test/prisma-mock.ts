import { PrismaService } from '../database/prisma.service';

export function mockPrisma(): jest.Mocked<PrismaService> {
  return {
    repair: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { deposit: 0 } }),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    shift: { findFirst: jest.fn(), update: jest.fn() },
    shiftMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    carrierWallet: {
      // ensureWallets() checks outside the transaction — report the wallet as existing
      findFirst: jest.fn().mockResolvedValue({ id: 'w1' }),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    repairAdditionalPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    carrierWalletMovement: { create: jest.fn() },
    packageSale: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    packageSaleDebtPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    serialNumber: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    customer: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    sale: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    saleRefund: { aggregate: jest.fn() },
    branchStock: { upsert: jest.fn(), aggregate: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    purchaseOrderItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    purchaseOrder: { update: jest.fn(), findFirst: jest.fn() },
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    stockMovement: { create: jest.fn() },
    expense: { aggregate: jest.fn() },
    supplierPayment: { findMany: jest.fn() },
    branch: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as jest.Mocked<PrismaService>;
}
