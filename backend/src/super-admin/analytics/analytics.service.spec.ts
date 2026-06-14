import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  tenantPayment: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  describe('getAnalytics', () => {
    beforeEach(() => {
      mockPrisma.tenantPayment.findMany
        .mockResolvedValueOnce([{ paymentAmount: 1000 }, { paymentAmount: 500 }])
        .mockResolvedValueOnce([]);
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.tenant.groupBy
        .mockResolvedValueOnce([{ plan: 'BASIC', _count: 5 }, { plan: 'PRO', _count: 2 }])
        .mockResolvedValueOnce([{ status: 'ACTIVE', _count: 7 }]);
      mockPrisma.tenantPayment.aggregate.mockResolvedValue({ _sum: { paymentAmount: 50000 } });
    });

    it('computes MRR from recent payments', async () => {
      const result = await service.getAnalytics();
      expect(result.mrr).toBe(1500);
    });

    it('computes ARR as MRR * 12', async () => {
      const result = await service.getAnalytics();
      expect(result.arr).toBe(1500 * 12);
    });

    it('returns total revenue from aggregate', async () => {
      const result = await service.getAnalytics();
      expect(result.totalRevenue).toBe(50000);
    });

    it('returns plan distribution', async () => {
      const result = await service.getAnalytics();
      expect(result.planDistribution).toContainEqual({ plan: 'BASIC', count: 5 });
      expect(result.planDistribution).toContainEqual({ plan: 'PRO', count: 2 });
    });

    it('returns 12 monthly revenue buckets', async () => {
      const result = await service.getAnalytics();
      expect(result.revenueByMonth).toHaveLength(12);
    });

    it('returns 12 monthly tenant buckets', async () => {
      const result = await service.getAnalytics();
      expect(result.tenantsByMonth).toHaveLength(12);
    });

    it('returns tenant status counts', async () => {
      const result = await service.getAnalytics();
      expect(result.tenantStatusCounts['ACTIVE']).toBe(7);
    });
  });
});
