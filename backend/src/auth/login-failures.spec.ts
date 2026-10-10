import { LoginFailures, LOGIN_FAIL_LIMIT } from './login-failures';

function fakeRedis() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => { m.set(k, v); } } as any;
}

describe('LoginFailures', () => {
  it('only wrong passwords count, and the address waits after the limit', async () => {
    const f = new LoginFailures(fakeRedis());
    for (let i = 0; i < LOGIN_FAIL_LIMIT - 1; i++) await f.recordFailure('1.2.3.4');
    await expect(f.assertAllowed('1.2.3.4')).resolves.toBeUndefined();
    await f.recordFailure('1.2.3.4');
    await expect(f.assertAllowed('1.2.3.4')).rejects.toMatchObject({ status: 429 });
    // another address (another shop) is not affected
    await expect(f.assertAllowed('5.6.7.8')).resolves.toBeUndefined();
  });

  it('logins that succeed never use up the allowance', async () => {
    const f = new LoginFailures(fakeRedis());
    for (let i = 0; i < 50; i++) await f.assertAllowed('1.2.3.4');
    await expect(f.assertAllowed('1.2.3.4')).resolves.toBeUndefined();
  });
});
