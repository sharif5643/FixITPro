import { BadRequestException } from '@nestjs/common';
import { FormalDocumentsService } from './formal-documents.service';

function repair(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', ticketNumber: 'REP-1', customerId: 'c1', branchId: 'b1',
    deviceType: 'แล็ปท็อป', deviceBrand: 'Acer', deviceModel: 'Aspire 5', deviceImei: 'NX123', assetTag: '7440-001',
    issue: 'จอแตก', estimatedTotal: 4500, estimateCost: 4500, finalCost: null,
    paymentStatus: 'PENDING', paymentMethod: null, deposit: 0, depositPaymentMethod: null,
    paidAt: null, deliveredAt: null, receivedAt: new Date('2026-10-01T03:00:00Z'),
    customer: { id: 'c1', name: 'โรงเรียนตัวอย่าง', address: '99 ม.1', phone: '0812345678', taxId: '0994000000000', taxBranch: 'สำนักงานใหญ่' },
    parts: [
      { id: 'p1', productName: 'จอ LCD 15.6"', quantity: 1, sellPrice: 2500, product: { name: 'x' } },
      { id: 'p2', productName: 'แบตเตอรี่', quantity: 1, sellPrice: 1200, product: { name: 'y' } },
    ],
    ...over,
  };
}

function setup(repairs: any[], settings: any = { shopName: 'ร้านทดสอบ', legalName: 'นายทดสอบ ใจดี', vatPercent: 0, taxId: '1234567890123' }) {
  const prisma: any = {
    repair: { findMany: jest.fn().mockResolvedValue(repairs) },
    shopSettings: { findUnique: jest.fn().mockResolvedValue(settings) },
  };
  return new FormalDocumentsService(prisma, { log: jest.fn() } as any);
}

describe('FormalDocumentsService.buildContent', () => {
  it('splits a job into labour and charged parts, totals match the job price', async () => {
    const { content } = await setup([repair()]).buildContent({ type: 'QUOTATION', repairIds: ['r1'] }, 't1');
    expect(content.title).toBe('ใบเสนอราคา');
    expect(content.lines.map((l) => [l.description, l.amount])).toEqual([
      ['ค่าบริการซ่อม แล็ปท็อป Acer Aspire 5', 800],
      ['จอ LCD 15.6" (อะไหล่)', 2500],
      ['แบตเตอรี่ (อะไหล่)', 1200],
    ]);
    expect(content.lines[0].detail).toBe('S/N NX123 · เลขครุภัณฑ์ 7440-001 · อาการ: จอแตก');
    expect(content.total).toBe(4500);
    expect(content.buyer).toMatchObject({ name: 'โรงเรียนตัวอย่าง', taxId: '0994000000000' });
    expect(content.seller.name).toBe('ร้านทดสอบ');
  });

  it('uses the legal name when asked and keeps line wording a person changed', async () => {
    const { content } = await setup([repair()]).buildContent({
      type: 'INVOICE', repairIds: ['r1'], nameMode: 'LEGAL',
      lines: [{ key: 'r1:labor', description: 'ค่าซ่อมเครื่องคอมพิวเตอร์โน้ตบุ๊ก', unit: 'เครื่อง' }],
    }, 't1');
    expect(content.seller.name).toBe('นายทดสอบ ใจดี');
    expect(content.lines[0]).toMatchObject({ description: 'ค่าซ่อมเครื่องคอมพิวเตอร์โน้ตบุ๊ก', unit: 'เครื่อง', amount: 800 });
  });

  it('a VAT shop gets a tax invoice with VAT taken out of the price, and it must carry a date', async () => {
    const vat = { shopName: 'ร้าน VAT', vatPercent: 7 };
    const paid = repair({ finalCost: 4500, paymentStatus: 'PAID', paymentMethod: 'TRANSFER', paidAt: new Date('2026-10-05T05:00:00Z') });
    const { content, docDate } = await setup([paid], vat).buildContent({ type: 'RECEIPT', repairIds: ['r1'] }, 't1');
    expect(content.title).toBe('ใบเสร็จรับเงิน / ใบกำกับภาษี');
    expect(content).toMatchObject({ total: 4500, vatBase: 4205.61, vatAmount: 294.39, paymentMethod: 'TRANSFER', allPaid: true });
    expect(content.seller.taxBranch).toBe('สำนักงานใหญ่');
    expect(docDate.toISOString()).toBe('2026-10-05T05:00:00.000Z');
    await expect(setup([paid], vat).buildContent({ type: 'RECEIPT', repairIds: ['r1'], hideDate: true }, 't1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('a non-VAT receipt may leave the date blank; an unpaid one ticks no payment method', async () => {
    const { content } = await setup([repair({ finalCost: 4500 })]).buildContent({ type: 'RECEIPT', repairIds: ['r1'], hideDate: true }, 't1');
    expect(content).toMatchObject({ title: 'ใบเสร็จรับเงิน', isTaxInvoice: false, paymentMethod: null, allPaid: false });
  });

  it('refuses jobs of different customers', async () => {
    const svc = setup([repair(), repair({ id: 'r2', customerId: 'c2' })]);
    await expect(svc.buildContent({ type: 'INVOICE', repairIds: ['r1', 'r2'] }, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
