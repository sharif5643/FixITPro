import { DashboardController } from './dashboard.controller';

const full = {
  period: { startDate: 'a', endDate: 'b' },
  finance: { totalRevenue: 1000, salesRevenue: 400, salesCount: 3, grossProfit: 300 },
  repairOps: { openRepairs: 5, inProgress: 2, unpaidDebtTotal: 900, unpaidDebtCount: 2 },
  stock: { outOfStock: 1, lowStock: 2 },
  warranties: { active: 4, expiringSoon: 1 },
  notifications: { unreadCount: 9, latest: [{ id: 'n' }] },
  topProducts: [{ name: 'x', revenue: 100 }],
  weeklyRevenue: [{ day: 'mon', revenue: 100 }],
  currentShift: { isOpen: true },
};

function ctl() {
  const svc = { getOverview: jest.fn().mockResolvedValue(full) };
  return new DashboardController(svc as any);
}

describe('dashboard overview by permission', () => {
  it('owners and reports.view get everything', async () => {
    expect(await ctl().getOverview(undefined, undefined, undefined, 'OWNER', undefined, 't', [])).toBe(full);
    expect(await ctl().getOverview(undefined, undefined, undefined, 'MANAGER', 'b1', 't', ['reports.view'])).toBe(full);
  });

  it('a cashier gets work figures and the POS sales count/total, no profit or debts', async () => {
    const o: any = await ctl().getOverview(undefined, undefined, undefined, 'CASHIER', 'b1', 't', ['sales.create']);
    expect(o.finance).toEqual({ salesRevenue: 400, salesCount: 3 });
    expect(o.repairOps.openRepairs).toBe(5);
    expect(o.repairOps.unpaidDebtTotal).toBeUndefined();
    expect(o.topProducts).toBeUndefined();
    expect(o.weeklyRevenue).toBeUndefined();
    expect(o.notifications).toBeUndefined();
  });

  it('a technician or stock staff gets no money at all', async () => {
    const o: any = await ctl().getOverview(undefined, undefined, undefined, 'TECHNICIAN', 'b1', 't', ['repair.edit']);
    expect(o.finance).toEqual({});
    expect(o.stock).toEqual({ outOfStock: 1, lowStock: 2 });
  });
});
