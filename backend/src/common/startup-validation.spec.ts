import {
  validateDbCredentials,
  KNOWN_WEAK_DB_PASSWORDS,
} from './startup-validation';

// ── Helper ────────────────────────────────────────────────────────────────────
function makeUrl(user: string, pass: string, host = 'localhost', db = 'fixitpro_prod'): string {
  return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:5432/${db}`;
}

// ── KNOWN_WEAK_DB_PASSWORDS set ───────────────────────────────────────────────
describe('KNOWN_WEAK_DB_PASSWORDS', () => {
  it('includes 123456', () => expect(KNOWN_WEAK_DB_PASSWORDS.has('123456')).toBe(true));
  it('includes password', () => expect(KNOWN_WEAK_DB_PASSWORDS.has('password')).toBe(true));
  it('includes REPLACE_WITH_STRONG_PASSWORD placeholder', () =>
    expect(KNOWN_WEAK_DB_PASSWORDS.has('REPLACE_WITH_STRONG_PASSWORD')).toBe(true));
  it('does not include a strong unique password', () =>
    expect(KNOWN_WEAK_DB_PASSWORDS.has('xK9#mP2@qZ7!vR4$nL8')).toBe(false));
});

// ── validateDbCredentials — happy paths ──────────────────────────────────────
describe('validateDbCredentials — passes without throwing', () => {
  it('does not throw for a strong password with non-postgres user (LAN)', () => {
    expect(() =>
      validateDbCredentials(makeUrl('fixitpro_app', 'xK9#mP2@qZ7!vR4$nL8'), false),
    ).not.toThrow();
  });

  it('does not throw for a strong password with non-postgres user (cloud)', () => {
    expect(() =>
      validateDbCredentials(makeUrl('fixitpro_app', 'xK9#mP2@qZ7!vR4$nL8'), true),
    ).not.toThrow();
  });

  it('allows postgres user on LAN deployment (non-cloud)', () => {
    expect(() =>
      validateDbCredentials(makeUrl('postgres', 'xK9#mP2@qZ7!vR4$nL8'), false),
    ).not.toThrow();
  });

  it('returns without throwing for empty DATABASE_URL', () => {
    expect(() => validateDbCredentials('', false)).not.toThrow();
  });
});

// ── validateDbCredentials — known weak passwords ─────────────────────────────
describe('validateDbCredentials — rejects known weak passwords', () => {
  const weakPasswords = ['123456', 'password', 'postgres', 'admin', 'changeme', 'secret'];

  weakPasswords.forEach((pass) => {
    it(`throws FATAL for password "${pass}"`, () => {
      expect(() =>
        validateDbCredentials(makeUrl('fixitpro_app', pass), false),
      ).toThrow(/FATAL.*known weak password/i);
    });
  });

  it('throws FATAL for REPLACE_WITH_STRONG_PASSWORD placeholder', () => {
    expect(() =>
      validateDbCredentials(makeUrl('fixitpro_app', 'REPLACE_WITH_STRONG_PASSWORD'), false),
    ).toThrow(/FATAL.*known weak password/i);
  });
});

// ── validateDbCredentials — missing password ──────────────────────────────────
describe('validateDbCredentials — missing password', () => {
  it('throws FATAL when DATABASE_URL has no password', () => {
    expect(() =>
      validateDbCredentials('postgresql://fixitpro_app@localhost:5432/fixitpro_prod', false),
    ).toThrow(/FATAL.*no password/i);
  });

  it('throws FATAL when password is empty string', () => {
    expect(() =>
      validateDbCredentials(makeUrl('fixitpro_app', ''), false),
    ).toThrow(/FATAL.*no password/i);
  });
});

// ── validateDbCredentials — superuser in cloud ────────────────────────────────
describe('validateDbCredentials — postgres superuser rejection', () => {
  it('throws FATAL when user is postgres in cloud deployment', () => {
    expect(() =>
      validateDbCredentials(makeUrl('postgres', 'xK9#mP2@qZ7!vR4$nL8'), true),
    ).toThrow(/FATAL.*postgres.*superuser.*cloud/i);
  });

  it('does not throw when user is postgres in LAN deployment', () => {
    expect(() =>
      validateDbCredentials(makeUrl('postgres', 'xK9#mP2@qZ7!vR4$nL8'), false),
    ).not.toThrow();
  });

  it('does not throw when user is fixitpro_app in cloud deployment', () => {
    expect(() =>
      validateDbCredentials(makeUrl('fixitpro_app', 'xK9#mP2@qZ7!vR4$nL8'), true),
    ).not.toThrow();
  });
});

// ── validateDbCredentials — invalid URL ──────────────────────────────────────
describe('validateDbCredentials — invalid URL', () => {
  it('throws FATAL for a non-URL string', () => {
    expect(() =>
      validateDbCredentials('not-a-valid-url', false),
    ).toThrow(/FATAL.*not a valid URL/i);
  });
});
