import { SettingsService } from './settings.service';

function svc(row: any) {
  const prisma: any = { shopSettings: { findUnique: jest.fn().mockResolvedValue(row) } };
  return new SettingsService(prisma, {} as any, {} as any, {} as any);
}

describe('shop theme set', () => {
  it('a shop that never picked a theme stays on the original look', async () => {
    expect(await svc({ shopName: 'A', logoUrl: null, themeKey: null, themePreset: null }).getShopInfo('t1'))
      .toMatchObject({ themeKey: null, themePreset: null });
    expect(await svc(null).getShopInfo('t1')).toMatchObject({ themeKey: null });
  });

  it('returns the picked theme set and light / dark', async () => {
    expect(await svc({ shopName: 'A', logoUrl: 'x', themeKey: 'royal', themePreset: 'dark' }).getShopInfo('t1'))
      .toMatchObject({ themeKey: 'royal', themePreset: 'dark', logoUrl: 'x' });
  });
});
