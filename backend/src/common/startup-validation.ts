/**
 * RC2-003: Startup credential validation helpers.
 * Extracted as pure functions so they can be unit-tested independently of bootstrap().
 */

export const KNOWN_WEAK_DB_PASSWORDS = new Set([
  '123456', '12345', '1234', '123', '1234567890',
  'password', 'postgres', 'admin', 'admin123',
  'changeme', 'change_me', 'secret', 'letmein', 'qwerty',
  'pass', 'test', 'dev', 'local', 'root',
  'REPLACE_WITH_STRONG_PASSWORD', // placeholder from .env.production template
]);

export const KNOWN_WEAK_SUPER_ADMIN_PASSWORDS = new Set([
  'admin1234', 'admin123', 'admin', 'password', '123456',
  'changeme', 'change_this_password', // placeholder from old seed-superadmin.ts
  'REPLACE_WITH_STRONG_PASSWORD',
  'superadmin', 'super', 'fixitpro',
]);

/**
 * Validates DATABASE_URL credentials at startup.
 *
 * Throws a FATAL error (crashes the process) when:
 * - The URL has no password
 * - The password is in the known-weak set (all production environments)
 * - The database user is 'postgres' in a cloud deployment (https:// CORS origin)
 *
 * @param databaseUrl     Value of process.env.DATABASE_URL
 * @param isCloudDeployment  True when CORS_ORIGIN contains an https:// origin
 */
export function validateDbCredentials(databaseUrl: string, isCloudDeployment: boolean): void {
  if (!databaseUrl) return; // Missing URL: Prisma itself will fail with a clear message on first use.

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('FATAL: DATABASE_URL is not a valid URL. App startup aborted.');
  }

  const username = url.username;
  const password = decodeURIComponent(url.password);

  if (!password) {
    throw new Error(
      'FATAL: DATABASE_URL contains no password. ' +
      'Set a strong password for the database user. App startup aborted.',
    );
  }

  if (KNOWN_WEAK_DB_PASSWORDS.has(password)) {
    throw new Error(
      'FATAL: DATABASE_URL contains a known weak password. ' +
      'Rotate the database password and update DATABASE_URL. App startup aborted.',
    );
  }

  if (isCloudDeployment && username === 'postgres') {
    throw new Error(
      "FATAL: DATABASE_URL uses the 'postgres' superuser in a cloud deployment. " +
      'Create a dedicated application role with least-privilege access. ' +
      'See scripts/create-app-role.sql for setup instructions. App startup aborted.',
    );
  }
}
