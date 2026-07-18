import { PrismaClient } from '@prisma/client';
import { TEST_DB_URL } from './app.helper';

// ── Deterministic IDs ──────────────────────────────────────────────────────────
export const IDS = {
  tenantA:   'e2e-tenant-a-000000000000000001',
  tenantB:   'e2e-tenant-b-000000000000000002',
  branchA1:  'e2e-branch-a1-00000000000000001',
  branchA2:  'e2e-branch-a2-00000000000000002',
  branchB1:  'e2e-branch-b1-00000000000000003',
  userOwnerA:    'e2e-user-owner-a-0000000000001',
  userManagerA1: 'e2e-user-mgr-a1-000000000001',
  userManagerA2: 'e2e-user-mgr-a2-000000000002',
  userCashierA1: 'e2e-user-cash-a1-00000000001',
  userTechA1:    'e2e-user-tech-a1-00000000001',
  userStockA1:   'e2e-user-stock-a1-0000000001',
  userOwnerB:    'e2e-user-owner-b-0000000000001',
  userDisabled:  'e2e-user-disabled-000000000001',
};

export const CREDS = {
  ownerA:    { email: 'owner-a@e2e.test',    password: 'E2eTest@2026!' },
  managerA1: { email: 'mgr-a1@e2e.test',     password: 'E2eTest@2026!' },
  managerA2: { email: 'mgr-a2@e2e.test',     password: 'E2eTest@2026!' },
  cashierA1: { email: 'cashier-a1@e2e.test', password: 'E2eTest@2026!' },
  techA1:    { email: 'tech-a1@e2e.test',    password: 'E2eTest@2026!' },
  stockA1:   { email: 'stock-a1@e2e.test',   password: 'E2eTest@2026!' },
  ownerB:    { email: 'owner-b@e2e.test',    password: 'E2eTest@2026!' },
  disabled:  { email: 'disabled@e2e.test',   password: 'E2eTest@2026!' },
};

/**
 * No-op — seed data is created once by test/setup/global-setup.ts before all test suites.
 * Individual test files must not clean-and-reseed; that causes FK violations
 * when later test files try to delete rows created by earlier ones.
 */
export async function seedTestData(_prisma: PrismaClient) {
  // intentional no-op
}

/** Create a fresh PrismaClient pointing at the test DB. */
export function testPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
}
