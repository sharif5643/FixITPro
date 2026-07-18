/**
 * seed-superadmin.ts
 *
 * Creates or updates the SUPER_ADMIN account (Coolify / cloud deployment).
 * Reads credentials from environment variables only — never falls back to placeholders.
 *
 * RC2-003: SUPER_ADMIN_PASSWORD must be ≥12 chars and must not be a known
 * placeholder or weak value. The script aborts otherwise.
 *
 * Usage (Coolify release command):
 *   npx prisma migrate deploy && npx ts-node --transpile-only prisma/seed-superadmin.ts
 *
 * Required env vars (set in Coolify UI):
 *   SUPER_ADMIN_EMAIL    — e.g. admin@yourshop.com
 *   SUPER_ADMIN_PASSWORD — strong unique password, min 12 chars
 *   SUPER_ADMIN_NAME     — display name (optional, defaults to "Super Admin")
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ── Credential policy ─────────────────────────────────────────────────────────
const KNOWN_WEAK_PASSWORDS = new Set([
  'admin1234', 'admin123', 'admin', 'password', '123456',
  'changeme', 'change_this_password', 'REPLACE_WITH_STRONG_PASSWORD',
  'superadmin', 'super', 'fixitpro', 'test', 'qwerty',
]);
const MIN_PASSWORD_LENGTH = 12;

const email    = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const name     = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

if (!email) {
  console.error('❌  SUPER_ADMIN_EMAIL is not set. Aborting.');
  process.exit(1);
}

if (!password) {
  console.error('❌  SUPER_ADMIN_PASSWORD is not set. Aborting.');
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`❌  SUPER_ADMIN_PASSWORD is too short (${password.length} chars, minimum ${MIN_PASSWORD_LENGTH}). Aborting.`);
  process.exit(1);
}

if (KNOWN_WEAK_PASSWORDS.has(password)) {
  console.error('❌  SUPER_ADMIN_PASSWORD is a known weak or placeholder value. Use a strong unique password. Aborting.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash(password!, 12);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { role: 'SUPER_ADMIN', password: hashed, name, isActive: true, tenantId: null },
    });
    console.log(`✓  Updated existing user → SUPER_ADMIN  (${email})`);
  } else {
    await prisma.user.create({
      data: { email, name, password: hashed, role: 'SUPER_ADMIN', isActive: true },
    });
    console.log(`✓  Created SUPER_ADMIN user  (${email})`);
  }

  console.log('');
  console.log('  Login at /login with the email above.');
  console.log('  Password was set from SUPER_ADMIN_PASSWORD env var — not logged here.');
  console.log('  SUPER_ADMIN is redirected to /super-admin/tenants automatically.');
}

main()
  .catch((e) => { console.error('❌ ', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
