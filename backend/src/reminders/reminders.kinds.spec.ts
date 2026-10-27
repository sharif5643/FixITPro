import { RemindersService } from './reminders.service';

describe('RemindersService — only what the person can act on', () => {
  const build = () => {
    const prisma: any = {
      reminderSettings: { upsert: jest.fn().mockResolvedValue({
        enabled: true, vipRepairEnabled: true, urgentRepairEnabled: true, partsRequestEnabled: true,
        transferPendingEnabled: true, pickupWaitingEnabled: true,
      }) },
      reminderSnooze: { findMany: jest.fn().mockResolvedValue([]) },
      repair: { findMany: jest.fn().mockResolvedValue([]) },
      stockTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, svc: new RemindersService(prisma, {} as any, {} as any) };
  };

  it('stock staff get transfers only; no repair job is looked up', async () => {
    const { prisma, svc } = build();
    await svc.getActiveReminders('u', 't', 'b', { repairs: false, transfers: true });
    expect(prisma.repair.findMany).not.toHaveBeenCalled();
    expect(prisma.stockTransfer.findMany).toHaveBeenCalled();
  });

  it('repair staff without stock.transfer get repair reminders only', async () => {
    const { prisma, svc } = build();
    await svc.getActiveReminders('u', 't', 'b', { repairs: true, transfers: false });
    expect(prisma.repair.findMany).toHaveBeenCalled();
    expect(prisma.stockTransfer.findMany).not.toHaveBeenCalled();
  });
});
