import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.SUPER_ADMIN_EMAIL    ?? 'superadmin@fixitpro.com';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'change_this_password';
  const name     = process.env.SUPER_ADMIN_NAME     ?? 'Super Admin';

  if (!email || !password) {
    console.error('❌  SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);

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
  console.log('  Login at /login with the credentials above.');
  console.log('  SUPER_ADMIN is redirected to /super-admin/tenants automatically.');
}

main()
  .catch((e) => { console.error('❌ ', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
