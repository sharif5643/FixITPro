/**
 * A manager who belongs to branch A1 sees branch A1's money on every money screen, whatever
 * branch the request asks for. The owner still sees any branch, or the whole shop.
 */
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS } from './helpers/seed.helper';

describe('Branch manager sees only their branch (e2e)', () => {
  let app: INestApplication;
  let owner: string;
  let manager: string;
  const month = (() => { const d = new Date(Date.now() + 7 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();

  beforeAll(async () => {
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    // money in branch A2 only, so A1 and A2 really differ
    const run = Date.now().toString(36);
    const cat = (await authPost(app, '/api/v1/expenses/categories', owner, { name: `BV ${run}`, code: `bv_${run}`.replace(/[^a-z_]/g, 'x') }).expect(201)).body.id;
    const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    await authPost(app, '/api/v1/expenses', owner, {
      expenseDate: day, amount: 777, description: `BV ${run}`, paymentMethod: 'TRANSFER', categoryId: cat, branchId: IDS.branchA2,
    }).expect(201);
  });
  afterAll(async () => { await app?.close(); });

  it('BV-01: asking for branch A2 still gives the manager branch A1', async () => {
    const get = async (cookie: string, path: string) => (await authGet(app, path, cookie).expect(200)).body;

    // owner summary (home page money)
    const mgr  = await get(manager, `/api/v1/dashboard/owner-summary?branchId=${IDS.branchA2}`);
    const a1   = await get(owner,   `/api/v1/dashboard/owner-summary?branchId=${IDS.branchA1}`);
    const a2   = await get(owner,   `/api/v1/dashboard/owner-summary?branchId=${IDS.branchA2}`);
    expect(a2.monthly.totalExpenses).toBeGreaterThanOrEqual(777);          // the two branches differ
    expect(a2.monthly.totalExpenses).not.toBe(a1.monthly.totalExpenses);
    expect(mgr.monthly).toEqual(a1.monthly);
    expect(mgr.today.totalRevenue).toBe(a1.today.totalRevenue);

    // branch profit table: only A1's row
    const pnl = await get(manager, '/api/v1/finance/branch-pnl');
    expect((pnl as any[]).every((r) => r.branchId === IDS.branchA1)).toBe(true);

    // tax reports, void log, owner dashboard: the A2 request gives what A1 gives
    for (const path of [`/api/v1/tax-reports/sales?month=${month}`, `/api/v1/reports/void-log`, `/api/v1/reports/owner-dashboard`]) {
      const sep = path.includes('?') ? '&' : '?';
      const asked = await get(manager, `${path}${sep}branchId=${IDS.branchA2}`);
      const own   = await get(owner,   `${path}${sep}branchId=${IDS.branchA1}`);
      expect(JSON.stringify(asked)).toBe(JSON.stringify(own));
    }
  });
});
