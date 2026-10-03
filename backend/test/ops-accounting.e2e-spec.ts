/**
 * Money that used to skip the books now reaches them: goods received on a PO, supplier
 * payments, SIM/package sales (also the cash drawer), wallet top-ups and manual drawer
 * withdrawals. Every entry must balance, and none of it may change the business records.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Accounting for purchases, SIM/package sales and the cash drawer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };

  const journal = (sourceType: string, sourceId: string) =>
    prisma.journalEntry.findFirst({
      where: { tenantId: IDS.tenantA, sourceType, sourceId },
      include: { lines: { include: { account: true } } },
    });
  const legs = (j: any) =>
    Object.fromEntries(j.lines.map((l: any) => [l.account.code, Number(l.debit) - Number(l.credit)]));
  const balanced = (j: any) =>
    Math.abs(j.lines.reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0)) < 0.005;

  beforeAll(async () => {
    // Turn the accounting module on for shop A only, for this file
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    await authPost(app, '/api/v1/accounting/accounts/initialize', owner, {}).expect(201);
    const current = await authGet(app, '/api/v1/shifts/current', manager);
    shiftId = current.body?.id ?? (await authPost(app, '/api/v1/shifts/open', manager, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OPS-01: receiving a PO books stock against the supplier debt; paying clears it', async () => {
    const supplierId = (await authPost(app, '/api/v1/suppliers', owner, { name: `Sup ${run}` }).expect(201)).body.id;
    const productId = (await authPost(app, '/api/v1/products', owner, {
      name: `Part ${run}`, sku: `OPS-${run}`, type: 'PART', price: 500, costPrice: 300, stock: 0, branchId: IDS.branchA1,
    }).expect(201)).body.id;
    const po = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, items: [{ productId, quantity: 4, unitCost: 300 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po.id}`, owner, { status: 'ORDERED' }).expect(200);
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, {
      items: [{ purchaseOrderItemId: po.items[0].id, quantity: 4 }],
    }).expect(201);

    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { referenceType: 'PURCHASE_ORDER', referenceId: po.id } });
    const receipt = await journal('PO_RECEIVE', movement.id);
    expect(receipt && balanced(receipt)).toBe(true);
    expect(legs(receipt)).toEqual({ '1310': 1200, '2100': -1200 }); // parts stock up, owed to supplier

    const pay = (await authPost(app, `/api/v1/purchase-orders/${po.id}/payments`, owner, {
      amount: 1200, paymentMethod: 'TRANSFER',
    }).expect(201)).body;
    const paymentId = pay.payments?.[0]?.id ?? (await prisma.supplierPayment.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
    const paid = await journal('PO_PAYMENT', paymentId);
    expect(legs(paid)).toEqual({ '2100': 1200, '1120': -1200 });  // debt cleared, money out by transfer
  });

  it('OPS-02: a package sale reaches the cash drawer ledger and the books; a top-up fills the wallet', async () => {
    const topup = await authPost(app, '/api/v1/carrier-wallet/topup', manager, { carrier: 'AIS', amount: 1000, shiftId }).expect(201);
    expect(topup.body.balance).toBeGreaterThanOrEqual(1000);
    const topMove = await prisma.carrierWalletMovement.findFirstOrThrow({ where: { type: 'TOPUP', shiftId }, orderBy: { createdAt: 'desc' } });
    expect(legs(await journal('WALLET_TOPUP', topMove.id))).toEqual({ '1130': 1000, '1120': -1000 });

    const sale = (await authPost(app, '/api/v1/carrier-wallet/package-sale', manager, {
      carrier: 'AIS', packageAmount: 200, dealerCost: 170, paymentMethod: 'CASH', amountPaid: 200,
      shiftId, cashierName: 'Manager A1',
    }).expect(201)).body;

    const drawer = await prisma.cashDrawerTransaction.findFirst({ where: { sourceType: 'PACKAGE_SALE', idempotencyKey: { contains: sale.id } } });
    expect(Number(drawer?.amount)).toBe(200);
    expect(drawer?.direction).toBe('IN');

    const j = await journal('PACKAGE_SALE', sale.id);
    expect(j && balanced(j)).toBe(true);
    expect(legs(j)).toEqual({ '1100': 200, '1130': -170, '4300': -30 });  // cash in, wallet down, profit
  });

  it('OPS-03: cash taken out of the drawer by hand is booked, and undoing it reverses the entry', async () => {
    const current = (await authGet(app, '/api/v1/cash-drawer/session/current', manager)).body;
    const sessionId = current?.id ?? (await authPost(app, '/api/v1/cash-drawer/session/open', manager, { openingAmount: 1000 }).expect(201)).body.id;
    const w = (await authPost(app, `/api/v1/cash-drawer/session/${sessionId}/withdraw`, manager, {
      amount: 300, reason: `owner ${run}`,
    }).expect(201)).body;
    expect(legs(await journal('DRAWER_WITHDRAWAL', w.id))).toEqual({ '3100': 300, '1100': -300 });

    const rev = (await authPost(app, `/api/v1/cash-drawer/transaction/${w.id}/reverse`, manager, { reason: 'mistake' }).expect(201)).body;
    expect(legs(await journal('DRAWER_REVERSAL', rev.id))).toEqual({ '3100': -300, '1100': 300 });
  });

  it('OPS-04: every journal of the shop still balances', async () => {
    const entries = await prisma.journalEntry.findMany({
      where: { tenantId: IDS.tenantA, isVoided: false }, include: { lines: true },
    });
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(balanced(e)).toBe(true);
  });
});
