import { BadRequestException } from '@nestjs/common';
import { PublicTrackingService } from './public-tracking.service';
import { mockPrisma } from '../test/prisma-mock';

const MOCK_REPAIR = {
  id: 'r1',
  ticketNumber: 'REP-20260714-ABCDEF',
  status: 'COMPLETED',
  deviceBrand: 'Apple',
  deviceModel: 'iPhone 15',
  deviceColor: 'Black',
  receivedAt: new Date('2026-07-10T08:00:00Z'),
  dueDate: new Date('2026-07-14T08:00:00Z'),
  completedAt: new Date('2026-07-13T08:00:00Z'),
  deliveredAt: null,
  warrantyExpiresAt: null,
  warrantyNote: null,
  paymentStatus: 'PAID',
  finalCost: 1500,
  estimatedTotal: 1500,
  estimateCost: null,
  deposit: 0,
  paidAmount: 1500,
  customer: { id: 'c1', name: 'John Doe', phone: '0812345678' },
  images: [{ id: 'img1', url: 'http://example.com/img.jpg', createdAt: new Date() }],
  qc: { allPassed: true, note: 'OK', updatedAt: new Date() },
  warranties: [{ id: 'w1', warrantyNumber: 'WAR-001', status: 'ACTIVE', startDate: new Date(), endDate: new Date(), description: null }],
};

describe('PublicTrackingService.trackRepair — P1-5', () => {
  let service: PublicTrackingService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new (PublicTrackingService as any)(prisma);
    (prisma.repair.findUnique as jest.Mock).mockResolvedValue(MOCK_REPAIR);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('TC-12: without phone — PII fields are null/empty', async () => {
    const result = await service.trackRepair('REP-20260714-ABCDEF');

    expect(result.phoneVerified).toBe(false);
    expect(result.customerName).toBeNull();
    expect(result.outstanding).toBeNull();
    expect(result.paymentStatus).toBeNull();
    expect(result.images).toEqual([]);
    expect(result.warranties).toEqual([]);
    expect(result.warrantyExpiresAt).toBeNull();
    // Public fields still returned
    expect(result.ticketNumber).toBe('REP-20260714-ABCDEF');
    expect(result.deviceBrand).toBe('Apple');
    expect(result.status).toBe('COMPLETED');
  });

  it('TC-13: with correct phone — PII fields are returned', async () => {
    const result = await service.trackRepair('REP-20260714-ABCDEF', '0812345678');

    expect(result.phoneVerified).toBe(true);
    expect(result.customerName).toBe('John Doe');
    expect(result.outstanding).toBe(0); // 1500 total - 0 deposit - 1500 paid
    expect(result.paymentStatus).toBe('PAID');
    expect(result.images).toHaveLength(1);
    expect(result.warranties).toHaveLength(1);
  });

  it('TC-14: with wrong phone — throws BadRequestException', async () => {
    await expect(
      service.trackRepair('REP-20260714-ABCDEF', '0899999999'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.trackRepair('REP-20260714-ABCDEF', '0899999999'),
    ).rejects.toThrow('หมายเลขโทรศัพท์ไม่ตรง');
  });
});
