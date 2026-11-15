import { ShopActivityService } from './shop-activity.service';

describe('ShopActivityService — quiet shops reach the system admin', () => {
  const now = new Date('2026-11-15T03:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const make = () => {
    const store = new Map<string, string>();
    const prisma: any = {
      tenant: { findMany: jest.fn().mockResolvedValue([
        { id: 't-quiet', shopName: 'ร้านเงียบ' }, { id: 't-busy', shopName: 'ร้านขายดี' }, { id: 't-new', shopName: 'ร้านใหม่' },
      ]) },
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 't-quiet', last: daysAgo(18) }, { id: 't-busy', last: daysAgo(1) }, { id: 't-new', last: null },
      ]),
      user: { findMany: jest.fn().mockResolvedValue([{ lineChatId: 'U-admin' }]) },
    };
    const notif: any = { notify: jest.fn() };
    const line: any = { pushCentral: jest.fn().mockResolvedValue(true) };
    const redis: any = { get: jest.fn(async (k: string) => store.get(k) ?? null), set: jest.fn(async (k: string, v: string) => { store.set(k, v) }) };
    return { svc: new ShopActivityService(prisma, notif, line, redis), notif, line };
  };

  it('QS-01: a shop quiet for 3+ days is reported once (notification + LINE); busy and never-used shops are not', async () => {
    const { svc, notif, line } = make();
    expect(await svc.checkQuietShops(now)).toEqual({ quiet: 1, alerted: 1 });
    expect(notif.notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SHOP_INACTIVE', tenantId: null, title: 'ร้าน ร้านเงียบ ไม่ได้ใช้ระบบมา 18 วัน',
    }));
    expect(line.pushCentral).toHaveBeenCalledWith('U-admin', expect.stringContaining('ร้านเงียบ'));
    // next morning: same quiet spell, no second alert
    expect(await svc.checkQuietShops(new Date(now.getTime() + 86_400_000))).toEqual({ quiet: 1, alerted: 0 });
    expect(notif.notify).toHaveBeenCalledTimes(1);
  });
});
