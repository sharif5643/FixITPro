import { BadRequestException } from '@nestjs/common';
import { PublicTrackingService, maskName, maskTicket } from './public-tracking.service';
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
    expect(result.customerName).toBe('Jo*** D***');
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

  it('TC-15: a short phone fragment does not verify', async () => {
    await expect(service.trackRepair('REP-20260714-ABCDEF', '8')).rejects.toThrow(BadRequestException);
    await expect(service.trackRepair('REP-20260714-ABCDEF', '5678')).rejects.toThrow(BadRequestException);
    const ok = await service.trackRepair('REP-20260714-ABCDEF', '+66812345678');
    expect(ok.phoneVerified).toBe(true);
  });

  it('TC-16: outstanding subtracts debt payments made after handover', async () => {
    (prisma.repair.findUnique as jest.Mock).mockResolvedValue({ ...MOCK_REPAIR, paidAmount: 600, deposit: 200 });
    (prisma.repairAdditionalPayment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 300 } });
    const result = await service.trackRepair('REP-20260714-ABCDEF', '0812345678');
    expect(result.outstanding).toBe(400); // 1500 − 200 − 600 − 300
  });
});

describe('PublicTrackingService.searchByPhone', () => {
  it('TC-17: returns masked ticket numbers only', async () => {
    const prisma = mockPrisma();
    const service = new (PublicTrackingService as any)(prisma);
    (prisma.customer.findMany as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    (prisma.repair.findMany as jest.Mock).mockResolvedValue([
      { ticketNumber: 'REP-20260714-ABCDEF', status: 'IN_PROGRESS', deviceBrand: 'Apple', deviceModel: 'iPhone 15', receivedAt: new Date() },
    ]);
    const [row] = await service.searchByPhone('0812345678');
    expect(row.maskedTicket).toBe('REP-20260714-••••EF');
    expect(row).not.toHaveProperty('ticketNumber');
    expect(JSON.stringify(row)).not.toContain('ABCDEF');
  });
});

describe('masking helpers', () => {
  it('masks Thai and English names', () => {
    expect(maskName('สมชาย ใจดี')).toBe('สม*** ใ***');
    expect(maskName('  Ann  ')).toBe('An***');
    expect(maskName('')).toBeNull();
    expect(maskName(null)).toBeNull();
  });

  it('masks ticket numbers without a dash too', () => {
    expect(maskTicket('ABC123')).toBe('••••23');
    expect(maskTicket('REP-1-X')).toBe('REP-1-••');
  });
});
