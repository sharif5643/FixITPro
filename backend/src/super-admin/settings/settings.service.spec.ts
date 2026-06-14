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
    it('calls upsert with correct data', async () => {
      mockPrisma.shopSettings.upsert.mockResolvedValue({ ...mockShop, shopPhone: '08-000-0000' });

      await service.updateSettings({ shopPhone: '08-000-0000' });

      expect(mockPrisma.shopSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          update: expect.objectContaining({ shopPhone: '08-000-0000' }),
        }),
      );
    });

    it('returns updated settings', async () => {
      mockPrisma.shopSettings.upsert.mockResolvedValue(mockShop);
      const result = await service.updateSettings({ shopName: 'NewName' });
      expect(result.shop).not.toBeNull();
    });
  });
});
