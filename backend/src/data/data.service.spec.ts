import { DataService, decodeCsv, normalizePhone, parseCSVRows } from './data.service';

function svc(existing: { customers?: any[]; products?: any[] } = {}) {
  const prisma: any = {
    customer: { findMany: jest.fn(async () => existing.customers ?? []) },
    product:  { findMany: jest.fn(async () => existing.products ?? []) },
    user:     { findMany: jest.fn(async () => [{ id: 'u1' }, { id: 'u2' }]) },
    auditLog: { findMany: jest.fn(async () => []) },
  };
  const tenantSvc: any = { scope: (t: string) => ({ tenantId: t }), branchScope: () => ({}) };
  const s = new DataService(prisma, { log: jest.fn() } as any, { notify: jest.fn() } as any, tenantSvc);
  return { s, prisma };
}

describe('CSV reading', () => {
  it('keeps a quoted address on two lines in one row', () => {
    expect(parseCSVRows('ชื่อ,ที่อยู่\r\nสมชาย,"บ้านเลขที่ 1\nกรุงเทพ"\n')).toEqual([['ชื่อ', 'ที่อยู่'], ['สมชาย', 'บ้านเลขที่ 1\nกรุงเทพ']]);
  });

  it('reads Thai saved by Excel (Windows-874) as well as UTF-8', () => {
    const thai = 'สมหญิง';
    expect(decodeCsv(Buffer.from(thai, 'utf8'))).toBe(thai);
    // สมหญิง in TIS-620 / Windows-874
    expect(decodeCsv(Buffer.from([0xca, 0xc1, 0xcb, 0xad, 0xd4, 0xa7]))).toBe(thai);
  });

  it('puts back the 0 Excel drops from a phone number', () => {
    expect(normalizePhone('812345678')).toBe('0812345678');
    expect(normalizePhone('0812345678')).toBe('0812345678');
    expect(normalizePhone('021234567')).toBe('021234567');
  });
});

describe('Import preview', () => {
  it('a customers file exported from here lines up by heading (the ID column is ignored)', async () => {
    const { s } = svc();
    const csv = '"ID","ชื่อ","เบอร์โทร","อีเมล","ที่อยู่","หมายเหตุ","คะแนน"\n"cm123","สมชาย","812345678","","","","0"\n';
    const p = await s.preview('customers', csv, 't1');
    expect(p.rows[0].data.slice(0, 2)).toEqual(['สมชาย', '0812345678']);
    expect(p.rows[0].valid).toBe(true);
  });

  it('a file without the needed heading is refused, not imported shifted', async () => {
    const { s } = svc();
    await expect(s.preview('customers', 'a,b\n1,2\n', 't1')).rejects.toThrow('หัวคอลัมน์ไม่ตรง');
  });

  it('prices with a thousands comma are fine; the same SKU twice in a file is caught', async () => {
    const { s } = svc();
    const csv = 'ชื่อสินค้า,SKU,บาร์โค้ด,ประเภท,ราคาขาย,ต้นทุน,สต็อก,สต็อกขั้นต่ำ\nA,X1,,PART,"1,200",100,1,0\nB,X1,,PART,50,10,1,0\n';
    const p = await s.preview('products', csv, 't1');
    expect(p.rows[0].valid).toBe(true);
    expect(p.rows[1].errors.join()).toContain('ซ้ำกับแถวที่ 2');
  });
});

describe('Export', () => {
  it('the activity log has only this shop\'s people, and needs the activity log permission', async () => {
    const { s, prisma } = svc();
    await s.export('audit-logs', {}, { role: 'OWNER', tenantId: 't1' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.actorId).toEqual({ in: ['u1', 'u2'] });
    await expect(s.export('audit-logs', {}, { role: 'MANAGER', permissions: ['data.export'], tenantId: 't1' })).rejects.toThrow('ประวัติกิจกรรม');
  });

  it('a cell that Excel would run as a formula is written as text', async () => {
    const { s } = svc({ customers: [{ id: 'c', name: '=HYPERLINK("x")', phone: '+6681', email: null, address: null, note: null, points: 0, tags: [], createdAt: new Date() }] });
    const out = await s.export('customers', {}, { role: 'OWNER', tenantId: 't1' });
    expect(out.content).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out.content).toContain('"+6681"');
  });
});
