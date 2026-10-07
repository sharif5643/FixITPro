import { NotificationsService } from './notifications.service';

function svc() {
  const prisma: any = {
    notification: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 0 })) },
    branch: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'b1' ? { tenantId: 't1' } : null)) },
    sale:   { findUnique: jest.fn(async () => ({ branchId: 'b1' })) },
  };
  return { s: new (NotificationsService as any)(prisma) as NotificationsService, prisma };
}

describe('Notifications reach the shop', () => {
  it('a notification without a shop gets the shop of its branch or of its bill', async () => {
    const { s, prisma } = svc();
    await s.notify({ type: 'BRANCH_LOW_STOCK', title: 't', message: 'm', branchId: 'b1' });
    await s.notify({ type: 'LARGE_REFUND', title: 't', message: 'm', entityType: 'Sale', entityId: 's1' });
    expect(prisma.notification.create.mock.calls.map((c: any) => c[0].data.tenantId)).toEqual(['t1', 't1']);
  });

  it('a system notification (explicit null) stays with the system admin', async () => {
    const { s, prisma } = svc();
    await s.notify({ type: 'BACKUP_FAILED', title: 't', message: 'm', tenantId: null });
    expect(prisma.notification.create.mock.calls[0][0].data.tenantId).toBeNull();
  });

  it('a cashier\'s "read all" leaves shared warnings for the owner', async () => {
    const { s, prisma } = svc();
    await s.markAllRead('t1', 'b1', 'CASHIER', 'u1');
    expect(JSON.stringify(prisma.notification.updateMany.mock.calls[0][0].where)).toContain('"severity":"INFO"');
    await s.markAllRead('t1', null, 'OWNER', 'o1');
    expect(JSON.stringify(prisma.notification.updateMany.mock.calls[1][0].where)).not.toContain('severity');
  });
});
