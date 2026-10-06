import { SettingsService } from './settings.service';

function svc(row: any, notes: string | null) {
  const prisma: any = {
    shopSettings: { findUnique: jest.fn().mockResolvedValue(row) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ notes }) },
  };
  return new SettingsService(prisma, {} as any, {} as any, {} as any);
}

describe('shop look (colour and light / dark)', () => {
  const signup = JSON.stringify({ themeColor: '#7c3aed', themePreset: 'dark' });

  it('uses what the owner picked when signing up until settings hold a look', async () => {
    const info = await svc({ shopName: 'A', logoUrl: null, themeColor: null, themePreset: null }, signup).getShopInfo('t1');
    expect(info).toMatchObject({ themeColor: '#7c3aed', themePreset: 'dark' });
  });

  it('settings win over the sign-up choice', async () => {
    const info = await svc({ shopName: 'A', logoUrl: null, themeColor: '#059669', themePreset: 'light' }, signup).getShopInfo('t1');
    expect(info).toMatchObject({ themeColor: '#059669', themePreset: 'light' });
  });

  it("'none' brings back the product's colour", async () => {
    const info = await svc({ shopName: 'A', logoUrl: null, themeColor: 'none', themePreset: null }, signup).getShopInfo('t1');
    expect(info).toMatchObject({ themeColor: null, themePreset: 'dark' });
  });

  it('ignores a broken or odd sign-up record', async () => {
    expect(await svc({ shopName: 'A', logoUrl: null, themeColor: null, themePreset: null }, 'not json').getShopInfo('t1'))
      .toMatchObject({ themeColor: null, themePreset: null });
    expect(await svc({ shopName: 'A', logoUrl: null, themeColor: null, themePreset: null }, JSON.stringify({ themeColor: 'red;}' })).getShopInfo('t1'))
      .toMatchObject({ themeColor: null });
  });
});
