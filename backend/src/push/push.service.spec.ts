import { generateKeyPairSync, createVerify } from 'crypto';
import { PushService } from './push.service';

describe('PushService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { project_id: 'fixitpro-test', client_email: 'push@fixitpro-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  const saved = process.env.FIREBASE_SERVICE_ACCOUNT;
  let fetchMock: jest.Mock;

  const prismaWith = (devices: { id: string; token: string }[]) => ({
    pushDevice: {
      findMany: jest.fn().mockResolvedValue(devices),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });
  const ok = (body: object) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  const fail = (status: number, text: string) => ({ ok: false, status, json: async () => ({}), text: async () => text });

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT; else process.env.FIREBASE_SERVICE_ACCOUNT = saved;
  });

  it('does nothing (and does not fail) when Firebase is not set up', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const prisma = prismaWith([{ id: 'd1', token: 't1' }]);
    const svc = new PushService(prisma as any);
    expect(svc.isConfigured()).toBe(false);
    await expect(svc.sendToUser('u1', { title: 'x', body: 'y' })).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in with a JWT from the service account, sends to every phone, forgets uninstalled ones', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify(sa)).toString('base64');   // base64 form works too
    const prisma = prismaWith([{ id: 'd1', token: 'tok-1' }, { id: 'd2', token: 'tok-gone' }]);
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 'ya29.test', expires_in: 3600 }))
      .mockResolvedValueOnce(ok({ name: 'projects/x/messages/1' }))
      .mockResolvedValueOnce(fail(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'));
    const svc = new PushService(prisma as any);

    await expect(svc.sendToUser('u1', { title: 'มีงานซ่อมมอบหมายให้คุณ', body: 'REP-1', data: { entityId: 'r1' } })).resolves.toBe(1);

    // Token request: a valid RS256 JWT for the FCM scope
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const jwt = new URLSearchParams(tokenInit.body.toString()).get('assertion')!;
    const [h, c, s] = jwt.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging' });

    // Message: to the phone, on the high-priority "jobs" channel, with the repair id
    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/fixitpro-test/messages:send');
    expect(sendInit.headers.Authorization).toBe('Bearer ya29.test');
    const message = JSON.parse(sendInit.body).message;
    expect(message).toMatchObject({ token: 'tok-1', notification: { title: 'มีงานซ่อมมอบหมายให้คุณ' }, data: { entityId: 'r1' } });
    expect(message.android.notification.channel_id).toBe('jobs');

    expect(prisma.pushDevice.delete).toHaveBeenCalledWith({ where: { id: 'd2' } });

    // The access token is reused for the next message
    fetchMock.mockResolvedValueOnce(ok({}));
    prisma.pushDevice.findMany.mockResolvedValueOnce([{ id: 'd1', token: 'tok-1' }]);
    await svc.sendToUser('u1', { title: 'a', body: 'b' });
    expect(fetchMock.mock.calls.filter(([u]) => u === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('a phone belongs to whoever signed in on it last; signing out removes only your own', async () => {
    const prisma = prismaWith([]);
    const svc = new PushService(prisma as any);
    await svc.register('u2', 't1', 'tok-abc', 'staff');
    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'tok-abc' }, update: expect.objectContaining({ userId: 'u2', tenantId: 't1', app: 'staff' }),
    }));
    await svc.unregister('u2', 'tok-abc');
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: 'tok-abc', userId: 'u2' } });
  });
});
