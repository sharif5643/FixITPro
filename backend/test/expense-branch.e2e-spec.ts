/**
 * An expense with no branch is in no report (a shop's reports gather its money through its
 * branches), so a shop user's expense always gets one: the one picked, else the branch of the
 * open shift, else the shop's only branch; a shop with several branches is asked to pick.
 * Another shop's branch is refused. (Production had 2 expenses with no branch, missing from every report.)
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { bangkokDate } from '../src/common/bangkok-date';

describe('Expense always has a branch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let cat: string;
  const run = Date.now().toString(36);
  const created: string[] = [];
  const body = (extra: object = {}) => ({
    expenseDate: bangkokDate(), amount: 55, description: `e2e ${run}`, paymentMethod: 'CASH', categoryId: cat, ...extra,
  });

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    // an owner with no home branch (as on production), in a shop with two branches
    await prisma.user.update({ where: { id: IDS.userOwnerA }, data: { branchId: null } });
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    // another test file may have left this owner's shift open; its branch would be used
    const cur = await authGet(app, '/api/v1/shifts/current', owner);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, owner, { closeBalance: 0, note: 'e2e cleanup' });
    cat = (await authPost(app, '/api/v1/expenses/categories', owner, { name: `Br ${run}`, code: `br_${run}`.replace(/[^a-z_]/g, 'x') }).expect(201)).body.id;
  });

  afterAll(async () => {
    // leave today's money as it was for the tests that read the whole shop's day
    await prisma.cashDrawerTransaction.deleteMany({ where: { referenceId: { in: created } } });
    await prisma.journalEntry.deleteMany({ where: { sourceId: { in: created } } });
    await prisma.expense.deleteMany({ where: { id: { in: created } } });
    await prisma.user.update({ where: { id: IDS.userOwnerA }, data: { branchId: IDS.branchA1 } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('EXB-01: two branches and none picked → asked to pick, nothing saved', async () => {
    const n = await prisma.expense.count({ where: { description: `e2e ${run}` } });
    const res = await authPost(app, '/api/v1/expenses', owner, body()).expect(400);
    expect(JSON.stringify(res.body)).toContain('เลือกสาขา');
    expect(await prisma.expense.count({ where: { description: `e2e ${run}` } })).toBe(n);
  });

  it('EXB-02: a branch picked → saved on it; another shop\'s branch → refused', async () => {
    const ok = (await authPost(app, '/api/v1/expenses', owner, body({ branchId: IDS.branchA2 })).expect(201)).body;
    created.push(ok.id);
    expect(ok.branchId).toBe(IDS.branchA2);
    const other = await authPost(app, '/api/v1/expenses', owner, body({ branchId: IDS.branchB1 }));
    expect([400, 403]).toContain(other.status);
  });

  it('EXB-03: none picked but a shift is open → the shift\'s branch', async () => {
    const shift = await prisma.shift.create({ data: { userId: IDS.userOwnerA, branchId: IDS.branchA2, openBalance: 0, isActive: true } });
    try {
      const ok = (await authPost(app, '/api/v1/expenses', owner, body()).expect(201)).body;
      created.push(ok.id);
      expect(ok.branchId).toBe(IDS.branchA2);
    } finally {
      await prisma.expense.updateMany({ where: { shiftId: shift.id }, data: { shiftId: null } });
      await prisma.shift.delete({ where: { id: shift.id } });
    }
  });
});
