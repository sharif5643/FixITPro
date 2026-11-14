/**
 * A shop that charges VAT (Revenue Code):
 *  - VAT cannot be switched on without a 13-digit tax id
 *  - each bill gets an abbreviated tax invoice, numbered per branch and year, VAT split out
 *  - a refund gets a credit note; a voided bill keeps its tax invoice, marked cancelled
 *  - money on a repair job (deposit, pickup) gets abbreviated tax invoices; a full A4 tax invoice
 *    for the job replaces them, so the VAT is counted once
 *  - a purchase order with VAT books input VAT; the supplier's tax invoice number is recorded
 *  - the sales / purchase tax reports and the VAT return add up, and the books agree
 *  - a shop without VAT gets no tax invoices at all
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';

describe('VAT shop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let ownerB: string;
  let shiftId: string;
  let shiftB: string;
  let productId: string;
  let t0: Date;
  const run = Date.now().toString(36);
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };
  const bkkMonth = () => { const d = new Date(Date.now() + 7 * 3600_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const settings = (b: object) => request(app.getHttpServer()).patch('/api/v1/settings').set('Cookie', owner).send(b);
  const sell = (cookie: string, branchId: string, pid: string, price: number, qty = 1) => authPost(app, '/api/v1/sales', cookie, {
    branchId, payments: [{ paymentMethod: 'CASH', amount: price * qty }], items: [{ productId: pid, quantity: qty, price }],
  });
  const patchRepair = (id: string, b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${id}`).set('Cookie', owner).send(b);

  beforeAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner  = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await authPost(app, '/api/v1/accounting/accounts/initialize', owner, {});
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
    shiftId = (await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201)).body.id;
    const cur = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    shiftB = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
    const cat = (await authPost(app, '/api/v1/categories', owner, { name: `VAT ${run}` })).body.id;
    const p = (await authPost(app, '/api/v1/products', owner, {
      name: `VAT Case ${run}`, sku: `VAT-${run}`, type: 'ACCESSORY', price: 1070, costPrice: 500, stock: 20, branchId: IDS.branchA1, categoryId: cat,
    }).expect(201)).body;
    productId = p.id ?? p.product?.id;
    t0 = new Date();
  });

  afterAll(async () => {
    await settings({ vatPercent: 0 });
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 0, note: 'e2e' });
    if (shiftB) await authPost(app, `/api/v1/shifts/${shiftB}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('VAT-01: VAT needs a 13-digit tax id first', async () => {
    await settings({ vatPercent: 7, taxId: '' }).expect(400);
    await settings({ vatPercent: 7, taxId: '12345' }).expect(400);
    await settings({ vatPercent: 7, taxId: '0-1055-61234-56-7', taxBranch: 'สำนักงานใหญ่' }).expect(200);
  });

  it('VAT-02: bills get running abbreviated tax invoice numbers with VAT split out; refund → credit note; void → cancelled', async () => {
    const a = (await sell(owner, IDS.branchA1, productId, 1070).expect(201)).body;
    expect(a.taxInvoice).toBeTruthy();
    expect(a.taxInvoice.number).toMatch(/^ABB\d{2}-25\d{2}-\d{6}$/);
    expect(Number(a.taxInvoice.vatBase)).toBe(1000);
    expect(Number(a.taxInvoice.vatAmount)).toBe(70);
    const b = (await sell(owner, IDS.branchA1, productId, 1070, 2).expect(201)).body;
    const seq = (n: string) => Number(n.split('-').pop());
    expect(seq(b.taxInvoice.number)).toBe(seq(a.taxInvoice.number) + 1);
    // reprint shows the same number
    expect((await authGet(app, `/api/v1/sales/${a.id}`, owner).expect(200)).body.taxInvoice.number).toBe(a.taxInvoice.number);

    const itemId = b.items[0].id;
    const refund = (await authPost(app, `/api/v1/sales/${b.id}/refund`, owner, {
      reason: 'e2e', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 1070 }],
    }).expect(201)).body;
    expect(refund.creditNote?.number).toMatch(/^CN\d{2}-25\d{2}-\d{6}$/);
    expect(Number(refund.creditNote.vatAmount)).toBe(70);

    await authPost(app, `/api/v1/sales/${a.id}/void`, owner, { reason: 'ลูกค้าเปลี่ยนใจ' }).expect(201);
    const voided = await prisma.taxInvoice.findFirstOrThrow({ where: { sourceType: 'SALE', sourceId: a.id } });
    expect(voided.cancelledAt).not.toBeNull(); // kept, never deleted
  });

  it('VAT-03: repair money gets tax invoices; a full A4 tax invoice replaces them', async () => {
    const job = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Apple', deviceModel: `VAT ${run}`, issue: 'screen', estimateCost: 2140, deposit: 535,
      depositPaymentMethod: 'CASH', branchId: IDS.branchA1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patchRepair(job.id, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1605 }).expect(201);
    const docs = (await authGet(app, `/api/v1/repairs/${job.id}`, owner).expect(200)).body.taxInvoices;
    expect(docs.map((d: any) => [d.sourceType, Number(d.total)])).toEqual([['REPAIR_DEPOSIT', 535], ['REPAIR_PAYMENT', 1605]]);

    const full = (await authPost(app, '/api/v1/formal-documents', owner, {
      type: 'RECEIPT', repairIds: [job.id], buyer: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105500000001', taxBranch: 'สำนักงานใหญ่' },
    }).expect(201)).body;
    const after = await prisma.taxInvoice.findMany({ where: { tenantId: IDS.tenantA, OR: [{ sourceId: job.id }, { sourceId: { startsWith: `${job.id}#` } }, { sourceId: full.id }] } });
    expect(after.filter((d) => d.kind === 'ABB').every((d) => d.cancelledAt)).toBe(true);
    const fullRow = after.find((d) => d.kind === 'FULL')!;
    expect(fullRow.number).toBe(full.number);
    expect(Number(fullRow.total)).toBe(2140);
    expect(Number(fullRow.vatAmount)).toBe(140);
  });

  it('VAT-04: a PO with VAT books input VAT; reports and the VAT return add up; the books agree', async () => {
    const supplierId = (await authPost(app, '/api/v1/suppliers', owner, { name: `VAT Sup ${run}`, taxId: '0105500000002' }).expect(201)).body.id;
    const po = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, vatPercent: 7, items: [{ productId, quantity: 2, unitCost: 500 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po.id}`, owner, { status: 'ORDERED' }).expect(200);
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, { items: [{ purchaseOrderItemId: po.items[0].id, quantity: 2 }] }).expect(201);

    const month = bkkMonth();
    let pur = (await authGet(app, `/api/v1/tax-reports/purchases?month=${month}`, owner).expect(200)).body;
    expect(pur.lines.find((l: any) => l.id === po.id).missing).toBeTruthy(); // no supplier tax invoice yet
    await authPatch(app, `/api/v1/purchase-orders/${po.id}/supplier-tax-invoice`, owner, {
      supplierTaxInvoiceNo: 'IV6911-0042', supplierTaxInvoiceDate: new Date().toISOString(),
    }).expect(200);
    pur = (await authGet(app, `/api/v1/tax-reports/purchases?month=${month}`, owner).expect(200)).body;
    expect(pur.totals.vatAmount).toBe(70);

    const sales = (await authGet(app, `/api/v1/tax-reports/sales?month=${month}`, owner).expect(200)).body;
    const counted = sales.lines.filter((l: any) => !l.cancelled);
    // bill b (2 140, VAT 140) − credit note (VAT 70) + full tax invoice (VAT 140); bill a voided, ABBs of the job replaced
    expect(sales.totals.vatAmount).toBe(210);
    expect(counted.reduce((s: number, l: any) => s + l.vatAmount, 0)).toBeCloseTo(210, 2);
    expect(sales.lines.some((l: any) => l.cancelled && l.kind === 'ABB')).toBe(true);

    const pp30 = (await authGet(app, `/api/v1/tax-reports/pp30?month=${month}`, owner).expect(200)).body;
    expect(pp30.outputVat).toBe(210);
    expect(pp30.inputVat).toBe(70);
    expect(pp30.payable).toBe(140);

    // The books: output VAT 210 owed, input VAT 70 to claim (this run's entries only)
    const lines = await prisma.journalLine.findMany({
      where: { entry: { tenantId: IDS.tenantA, createdAt: { gte: t0 }, isVoided: false }, account: { code: { in: ['2120', '1140'] } } },
      include: { account: true },
    });
    const bal = (code: string) => Math.round(lines.filter((l) => l.account.code === code)
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) * 100) / 100;
    expect(bal('2120')).toBe(-210);
    expect(bal('1140')).toBe(70);
  });

  it('VAT-05: a shop without VAT gets no tax invoice', async () => {
    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `NoVAT ${run}` })).body.id;
    const p = (await authPost(app, '/api/v1/products', ownerB, {
      name: `NoVAT ${run}`, sku: `NV-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 5, branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body;
    const sale = (await sell(ownerB, IDS.branchB1, p.id ?? p.product?.id, 100).expect(201)).body;
    expect(sale.taxInvoice).toBeNull();
    expect(await prisma.taxInvoice.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
  });
});
