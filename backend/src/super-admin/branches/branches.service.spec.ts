import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  branch: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: { count: jest.fn(), updateMany: jest.fn() },
  repair: { count: jest.fn() },
  sale: { count: jest.fn() },
  expense: { count: jest.fn() },
  notification: { count: jest.fn() },
  tenant: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockAuditLog = {
  log: jest.fn().mockResolvedValue(undefined),
  logWithTx: jest.fn().mockResolvedValue(undefined),
};

describe('BranchesService', () => {
  let service: BranchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();
    service = module.get<BranchesService>(BranchesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated branches with tenant info', async () => {
      // Branch now has direct tenantId + tenant relation (not via users)
      const branch = {
        id: 'b1', name: 'Branch 1', address: null, phone: null,
        tenantId: 't1',
        isActive: true, isDefault: false, status: 'ACTIVE',
        branchNumber: 1, stockCodeSeq: 0, createdAt: new Date(), updatedAt: new Date(),
        _count: { users: 3, repairs: 0, sales: 0 },
        tenant: { id: 't1', shopName: 'Shop A' },
      };
      mockPrisma.branch.findMany.mockResolvedValue([branch]);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.total).toBe(1);
      expect(result.data[0].tenantId).toBe('t1');
      expect(result.data[0].tenant).toEqual({ id: 't1', shopName: 'Shop A' });
      expect((result.data[0] as any).users).toBeUndefined();
    });

    it('passes tenantId filter directly to prisma where clause', async () => {
      // Branch.tenantId is a direct field — filter uses where.tenantId, not where.users.some
      mockPrisma.branch.findMany.mockResolvedValue([]);
      mockPrisma.branch.count.mockResolvedValue(0);

      await service.findAll('tenant-123');

      const call = mockPrisma.branch.findMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe('tenant-123');
    });

    it('sets tenant to null when branch has no tenant', async () => {
      const branch = {
        id: 'b2', name: 'Orphan Branch', address: null, phone: null,
        tenantId: null,
        isActive: true, isDefault: false, status: 'ACTIVE',
        branchNumber: null, stockCodeSeq: 0, createdAt: new Date(), updatedAt: new Date(),
        _count: { users: 0, repairs: 0, sales: 0 },
        tenant: null,
      };
      mockPrisma.branch.findMany.mockResolvedValue([branch]);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.findAll();
      expect(result.data[0].tenant).toBeNull();
      expect(result.data[0].tenantId).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns total, active, suspended and orphan counts', async () => {
      // stats() calls branch.count 4 times: total, active, suspended, orphan
      mockPrisma.branch.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(8)   // active
        .mockResolvedValueOnce(1)   // suspended
        .mockResolvedValueOnce(1);  // orphan (no tenant)

      const result = await service.stats();
      expect(result).toEqual({ total: 10, active: 8, suspended: 1, orphan: 1 });
    });
  });
});
