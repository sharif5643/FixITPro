import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('excludes SUPER_ADMIN from results', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll();

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toEqual({ not: 'SUPER_ADMIN' });
    });

    it('adds tenantId filter when provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll('tenant-abc');

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe('tenant-abc');
    });

    it('adds role filter when provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll(undefined, 'OWNER');

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toBe('OWNER');
    });

    it('returns data and total', async () => {
      const user = {
        id: 'u1', email: 'owner@shop.com', name: 'Owner', phone: null,
        role: 'OWNER', isActive: true, lastLoginAt: null, createdAt: new Date(),
        tenantId: 't1', branchId: 'b1',
        tenant: { id: 't1', shopName: 'Shop A' },
        branch: { id: 'b1', name: 'Branch 1' },
      };
      mockPrisma.user.findMany.mockResolvedValue([user]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();
      expect(result.total).toBe(1);
      expect(result.data[0].email).toBe('owner@shop.com');
    });
  });

  describe('stats', () => {
    it('returns stats object', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(3);

      const result = await service.stats();
      expect(result.total).toBe(50);
      expect(result.active).toBe(45);
      expect(result.owners).toBe(10);
      expect(result.managers).toBe(8);
      expect(result.activeToday).toBe(3);
    });
  });
});
