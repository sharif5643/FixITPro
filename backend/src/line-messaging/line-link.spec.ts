import { UnauthorizedException } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineWebhookController } from './line-webhook.controller';

describe('LINE customer linking', () => {
  const prismaWith = (matches: { id: string }[]) => ({
    customer: {
      findMany: jest.fn().mockResolvedValue(matches),
      update: jest.fn().mockResolvedValue({}),
    },
  });

  it('links when exactly one customer has the phone number', async () => {
    const prisma = prismaWith([{ id: 'c1' }]);
    const svc = new LineMessagingService(prisma as any, {} as any);
    await expect(svc.linkLineUser('U1', '0812345678', 't1')).resolves.toBe(true);
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { lineUserId: 'U1' } });
  });

  it('does not link when several customers match (cannot tell whose updates to send)', async () => {
    const prisma = prismaWith([{ id: 'c1' }, { id: 'c2' }]);
    const svc = new LineMessagingService(prisma as any, {} as any);
    await expect(svc.linkLineUser('U1', '0812345678', null)).resolves.toBe(false);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('rejects webhook events when LINE_CHANNEL_SECRET is not set', async () => {
    const saved = process.env.LINE_CHANNEL_SECRET;
    delete process.env.LINE_CHANNEL_SECRET;
    const link = jest.fn();
    const ctrl = new LineWebhookController({ linkLineUser: link } as any);
    await expect(ctrl.webhook(
      { events: [{ type: 'message', source: { userId: 'U1' }, message: { type: 'text', text: '0812345678' } } as any] },
      '', {} as any,
    )).rejects.toBeInstanceOf(UnauthorizedException);
    expect(link).not.toHaveBeenCalled();
    if (saved !== undefined) process.env.LINE_CHANNEL_SECRET = saved;
  });
});
