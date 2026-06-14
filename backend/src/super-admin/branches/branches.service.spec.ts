import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  branch: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('BranchesService', () => {
  let service: BranchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<BranchesService>(BranchesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated branches with tenant info', async () => {
      const branch = {
        id: 'b1', name: 'Branch 1', address: null, phone: null,
        isActive: true, isDefault: false, status: 'ACTIVE',
        branchNumber: 1, stockCodeSeq: 0, createdAt: new Date(), updatedAt: new Date(),
        _count: { users: 3 },
        users: [{ tenantId: 't1', tenant: { id: 't1', shopName: 'Shop A' } }],
      };
      mockPrisma.branch.findMany.mockResolvedValue([branch]);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.total).toBe(1);
      expect(result.data[0].tenantId).toBe('t1');
      expect(result.data[0].tenant).toEqual({ id: 't1', shopName: 'Shop A' });
      expect((result.data[0] as any).users).toBeUndefined();
    });

    it('passes tenantId filter to prisma where clause', async () => {
      mockPrisma.branch.findMany.mockResolvedValue([]);
      mockPrisma.branch.count.mockResolvedValue(0);

      await service.findAll('tenant-123');

      const call = mockPrisma.branch.findMany.mock.calls[0][0];
      expect(call.where.users).toEqual({ some: { tenantId: 'tenant-123' } });
    });

    it('sets tenant to null when branch has no users', async () => {
      const branch = {
        id: 'b2', name: 'Orphan Branch', address: null, phone: null,
        isActive: true, isDefault: false, status: 'ACTIVE',
        branchNumber: null, stockCodeSeq: 0, createdAt: new Date(), updatedAt: new Date(),
        _count: { users: 0 },
        users: [],
      };
      mockPrisma.branch.findMany.mockResolvedValue([branch]);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.findAll();
      expect(result.data[0].tenant).toBeNull();
      expect(result.data[0].tenantId).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns total, active, suspended counts', async () => {
      mockPrisma.branch.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(1);

      const result = await service.stats();
      expect(result).toEqual({ total: 10, active: 8, suspended: 1 });
    });
  });
});
