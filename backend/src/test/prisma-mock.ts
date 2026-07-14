import { PrismaService } from '../database/prisma.service';

export function mockPrisma(): jest.Mocked<PrismaService> {
  return {
    repair: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    shift: { findFirst: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    carrierWallet: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    carrierWalletMovement: { create: jest.fn() },
    packageSale: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
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
