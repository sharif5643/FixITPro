import { ShiftsService } from './shifts.service';
import { activeShiftWhere } from './active-shift';

function make(shift: any, current: any = null) {
  const prisma: any = {
    shift: {
      findFirst: jest.fn(async ({ where }: any) => (where.id ? shift : current)),
      update: jest.fn(async () => ({ ...shift, isActive: false, user: { id: shift?.userId, name: 'A' } })),
      findMany: jest.fn(async () => []),
    },
    shiftMember: {
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 2 })),
      findFirst: jest.fn(async () => ({ id: 'm1', shiftId: 's1' })),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
    },
    sale: { findMany: jest.fn(async () => [
      { total: 300, paymentMethod: 'CASH', userId: 'a', user: { name: 'A' } },
      { total: 200, paymentMethod: 'CASH', userId: 'b', user: { name: 'B' } },
      { total: 100, paymentMethod: 'CASH', userId: 'b', user: { name: 'B' } },
    ]) },
    repair: { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _sum: { deposit: 0 } })) },
    repairAdditionalPayment: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
    supplierPayment: { findMany: jest.fn(async () => []) },
    packageSale: { findMany: jest.fn(async () => []) },
    packageSaleDebtPayment: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
    expense: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
    saleRefund: { aggregate: jest.fn(async () => ({ _sum: { totalRefund: 0 } })) },
  };
  const svc = new (ShiftsService as any)(prisma, { getShiftCarrierSummary: jest.fn(async () => []) }, { log: jest.fn() }, { notify: jest.fn() });
  svc.getCashRepairInflows = jest.fn(async () => ({ cashDeposits: 0, cashDebtPayments: 0 }));
  svc.getCashPackageDebtPayments = jest.fn(async () => 0);
  svc.getCurrentShift = jest.fn(async () => ({ id: 's1', joined: true }));
  return { svc: svc as ShiftsService, prisma };
}

const OPEN = { id: 's1', userId: 'a', branchId: 'b1', isActive: true, openBalance: 500, openedAt: new Date(), closedAt: null, user: { tenantId: 't1', name: 'A' }, members: [{ userId: 'b' }] };

describe('one cash drawer, several people (shared shift)', () => {
  it("a person's active shift is their own or one they joined and have not left", () => {
    expect(activeShiftWhere('b')).toEqual({ isActive: true, OR: [{ userId: 'b' }, { members: { some: { userId: 'b', leftAt: null } } }] });
  });

  it('joins an open shift of the same shop and branch', async () => {
    const { svc, prisma } = make(OPEN);
    await expect(svc.joinShift('s1', { id: 'b', tenantId: 't1', branchId: 'b1' })).resolves.toEqual({ id: 's1', joined: true });
    expect(prisma.shiftMember.upsert).toHaveBeenCalled();
  });

  it('cannot join another shop, another branch, or while having a shift', async () => {
    await expect(make(OPEN).svc.joinShift('s1', { id: 'b', tenantId: 't2', branchId: 'b1' })).rejects.toThrow('ไม่พบกะ');
    await expect(make(OPEN).svc.joinShift('s1', { id: 'b', tenantId: 't1', branchId: 'b2' })).rejects.toThrow('สาขาตัวเอง');
    await expect(make(OPEN, { id: 'other' }).svc.joinShift('s1', { id: 'b', tenantId: 't1', branchId: 'b1' })).rejects.toThrow('มีกะที่เปิดอยู่แล้ว');
  });

  it('a member, the opener, the owner or the branch manager can close it; the count is once and per-person sales are listed', async () => {
    const { svc, prisma } = make(OPEN);
    const r = await svc.closeShift('s1', { closeBalance: 1100 } as any, 'b', { role: 'CASHIER', tenantId: 't1', branchId: 'b1' });
    expect(r.summary.expectedBalance).toBe(1100); // 500 + 600 cash
    expect(r.summary.staffSales).toEqual([
      { userId: 'a', name: 'A', salesCount: 1, salesTotal: 300 },
      { userId: 'b', name: 'B', salesCount: 2, salesTotal: 300 },
    ]);
    expect(prisma.shiftMember.updateMany).toHaveBeenCalledWith({ where: { shiftId: 's1', leftAt: null }, data: expect.any(Object) });
    await expect(make(OPEN).svc.closeShift('s1', { closeBalance: 0 } as any, 'o', { role: 'OWNER', tenantId: 't1' })).resolves.toBeDefined();
    await expect(make(OPEN).svc.closeShift('s1', { closeBalance: 0 } as any, 'm', { role: 'MANAGER', tenantId: 't1', branchId: 'b1' })).resolves.toBeDefined();
  });

  it('someone outside the shift cannot close it', async () => {
    await expect(make(OPEN).svc.closeShift('s1', { closeBalance: 0 } as any, 'x', { role: 'CASHIER', tenantId: 't1', branchId: 'b1' }))
      .rejects.toThrow('Active shift not found');
    await expect(make(OPEN).svc.closeShift('s1', { closeBalance: 0 } as any, 'm', { role: 'MANAGER', tenantId: 't1', branchId: 'b2' }))
      .rejects.toThrow('Active shift not found');
  });
});
