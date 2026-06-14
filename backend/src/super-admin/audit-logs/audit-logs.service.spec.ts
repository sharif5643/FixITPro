import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  tenantRenewal: { findMany: jest.fn() },
  tenantPayment: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  tenant: { findMany: jest.fn() },
};

const tenantRow = { id: 't1', shopName: 'Shop A', createdAt: new Date('2026-01-01') };
const renewal = {
  id: 'r1', action: 'ACTIVATE', plan: 'BASIC', duration: 365,
  expiryDate: new Date('2027-01-01'), note: null,
  tenantId: 't1', createdAt: new Date('2026-01-02'),
  tenant: { id: 't1', shopName: 'Shop A' },
};
const payment = {
  id: 'p1', status: 'VERIFIED', adminNote: null,
  verifiedAt: new Date('2026-01-03'), tenantId: 't1',
  tenant: { id: 't1', shopName: 'Shop A' },
  verifiedBy: { email: 'admin@fixitpro.com' },
};
const userReset = {
  id: 'u1', email: 'owner@shop.com',
  passwordResetAt: new Date('2026-01-04'),
  tenant: { id: 't1', shopName: 'Shop A' },
};

describe('AuditLogsService', () => {
  let service: AuditLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AuditLogsService>(AuditLogsService);
    jest.clearAllMocks();

    mockPrisma.tenantRenewal.findMany.mockResolvedValue([renewal]);
    mockPrisma.tenantPayment.findMany.mockResolvedValue([payment]);
    mockPrisma.user.findMany.mockResolvedValue([userReset]);
    mockPrisma.tenant.findMany.mockResolvedValue([tenantRow]);
  });

  it('returns merged events sorted by time descending', async () => {
    const result = await service.findAll();
    expect(result.total).toBe(4);
    const times = result.data.map((e) => new Date(e.time).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('maps renewal action correctly', async () => {
    const result = await service.findAll();
    const renewalEvent = result.data.find((e) => e.id === 'tr-r1');
    expect(renewalEvent?.action).toBe('ACTIVATE');
    expect(renewalEvent?.tenantId).toBe('t1');
  });

  it('maps payment VERIFIED correctly', async () => {
    const result = await service.findAll();
    const payEvent = result.data.find((e) => e.id === 'tp-p1');
    expect(payEvent?.action).toBe('PAYMENT_VERIFIED');
    expect(payEvent?.actor).toBe('admin@fixitpro.com');
  });

  it('maps payment REJECTED correctly', async () => {
    mockPrisma.tenantPayment.findMany.mockResolvedValue([{ ...payment, status: 'REJECTED' }]);
    const result = await service.findAll();
    const payEvent = result.data.find((e) => e.id === 'tp-p1');
    expect(payEvent?.action).toBe('PAYMENT_REJECTED');
  });

  it('maps password reset correctly', async () => {
    const result = await service.findAll();
    const pwEvent = result.data.find((e) => e.id === 'pr-u1');
    expect(pwEvent?.action).toBe('PASSWORD_RESET');
    expect(pwEvent?.target).toBe('owner@shop.com');
  });

  it('maps tenant creation correctly', async () => {
    const result = await service.findAll();
    const createEvent = result.data.find((e) => e.id === 'tc-t1');
    expect(createEvent?.action).toBe('TENANT_CREATED');
    expect(createEvent?.actor).toBe('system');
  });

  it('filters by tenantId when provided', async () => {
    mockPrisma.tenantRenewal.findMany.mockResolvedValue([]);
    mockPrisma.tenantPayment.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.tenant.findMany.mockResolvedValue([]);

    await service.findAll('tenant-xyz');

    expect(mockPrisma.tenantRenewal.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-xyz' });
  });

  it('paginates results', async () => {
    const result = await service.findAll(undefined, 1, 2);
    expect(result.data.length).toBeLessThanOrEqual(2);
    expect(result.limit).toBe(2);
    expect(result.page).toBe(1);
  });
});
