import { PrismaClient, Role } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const ADDITIVE_PERMS: Partial<Record<Role, string[]>> = {
  MANAGER: [
    'audit.view',
    'settings.manage',
    'branches.manage',
    'data.import',
    'notification.manage',
  ],
};

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error('PROD guard: this script must run against a local database only.');
    process.exit(1);
  }

  console.log('Backfilling missing role permissions...');

  for (const [role, permissions] of Object.entries(ADDITIVE_PERMS) as [Role, string[]][]) {
    const result = await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ role, permission })),
      skipDuplicates: true,
    });
    console.log(`${role}: +${result.count} new permissions`);

    const all = await prisma.rolePermission.findMany({
      where: { role },
      orderBy: { permission: 'asc' },
      select: { permission: true },
    });
    console.log(`${role} now has ${all.length} total permissions.`);
  }

  console.log('\nBackfill complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
