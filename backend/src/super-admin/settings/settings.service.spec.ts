import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../database/prisma.service';

const mockShop = {
  id: 1, shopName: 'FixITPro', shopSubtitle: null,
  shopPhone: '02-000-0000', shopAddress: 'Bangkok', shopEmail: 'info@fixitpro.com',
  taxId: '1234567890', receiptFooter: null, paperWidth: '80mm',
  paymentQrUrl: null, vatPercent: 0, defaultDeposit: 0, lowStockAlert: 5,
  autoGenerateSku: true, autoGenerateBarcode: false, autoPrint: false,
  showTaxId: true, showLogo: true, updatedAt: new Date(),
};

const mockPrisma = {
  shopSettings: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
    mockPrisma.shopSettings.findFirst.mockResolvedValue(mockShop);
  });

  describe('getSettings', () => {
    it('returns platform section', async () => {
      const result = await service.getSettings();
      expect(result.platform.name).toBe('FixITPro');
      expect(result.platform.version).toBe('v2.0.0');
    });

    it('returns security section', async () => {
      const result = await service.getSettings();
      expect(result.security.cookieMode).toBe('HttpOnly (CHB-01)');
    });

    it('returns database section', async () => {
      const result = await service.getSettings();
      expect(result.database.provider).toBe('PostgreSQL');
      expect(result.database.orm).toBe('Prisma 5.x');
    });

    it('returns shop settings when present', async () => {
      const result = await service.getSettings();
      expect(result.shop).not.toBeNull();
      expect(result.shop!.shopName).toBe('FixITPro');
      expect(result.shop!.paperWidth).toBe('80mm');
    });

    it('returns null shop when no ShopSettings row', async () => {
      mockPrisma.shopSettings.findFirst.mockResolvedValue(null);
      const result = await service.getSettings();
      expect(result.shop).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('reads and updates the platform row (no tenant), never a shop\'s row', async () => {
      mockPrisma.shopSettings.findFirst.mockResolvedValue({ ...mockShop, id: 7 });
      await service.updateSettings({ shopPhone: '08-000-0000' });
      expect(mockPrisma.shopSettings.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: null } }),
      );
      expect(mockPrisma.shopSettings.update).toHaveBeenCalledWith({
        where: { id: 7 }, data: expect.objectContaining({ shopPhone: '08-000-0000' }),
      });
      expect(mockPrisma.shopSettings.upsert).not.toHaveBeenCalled();
    });

    it('creates the platform row (tenantId null) when there is none', async () => {
      mockPrisma.shopSettings.findFirst.mockResolvedValueOnce(null).mockResolvedValue(mockShop);
      const result = await service.updateSettings({ shopName: 'NewName' });
      expect(mockPrisma.shopSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: null, shopName: 'NewName' }),
      });
      expect(result.shop).not.toBeNull();
    });
  });
});
