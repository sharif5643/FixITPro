import { actionCount, actionLines, summaryText, thaiDayLabel, type OwnerToday } from './owner-summary';

const money = (over: Partial<OwnerToday['total']> = {}): OwnerToday['total'] => ({
  branchId: null, name: 'ทุกสาขา', revenue: 15020, cash: 3490, transfer: 11530, card: 0,
  drawerOut: 250, expenses: 400, netProfit: 4200.4, bills: 6, repairPayments: 9, ...over,
});
const calm = (): OwnerToday['actions'] => ({
  longShifts: [], overdueRepairs: { count: 0, items: [] }, waitingPickup: { count: 0, items: [] },
  customerDebt: { count: 0, total: 0 }, supplierDue: { count: 0, total: 0, overdue: 0, items: [] },
  stock: { outOfStock: 0, lowStock: 0 },
});

describe('owner summary', () => {
  it('names the Thai day', () => {
    expect(thaiDayLabel('2026-11-06')).toBe('ศ. 6 พ.ย.');
    expect(thaiDayLabel('2026-11-05')).toBe('พฤ. 5 พ.ย.');
  });

  it('a calm day: money lines, no to-do, link to the page', () => {
    const t = summaryText({ date: '2026-11-06', total: money(), branches: [], actions: calm() }, 'C-Phone', 'https://fixitpro.in.th');
    expect(t).toContain('📊 C-Phone · ศ. 6 พ.ย.');
    expect(t).toContain('รายรับวันนี้ 15,020 บาท');
    expect(t).toContain('เงินสด 3,490 · โอน/QR 11,530');
    expect(t).not.toContain('บัตร');
    expect(t).toContain('จ่ายออกจากลิ้นชัก 250 บาท');
    expect(t).toContain('📈 กำไรสุทธิ 4,200 บาท');
    expect(t).toContain('✅ ไม่มีเรื่องค้างให้จัดการ');
    expect(t).not.toContain('แยกสาขา');
    expect(t.endsWith('https://fixitpro.in.th/owner')).toBe(true);
  });

  it('a loss shows as minus; branches listed when more than one', () => {
    const t = summaryText({
      date: '2026-11-06', total: money({ netProfit: -320 }),
      branches: [money({ name: 'ในเมือง', revenue: 10000 }), money({ name: 'ตลาด', revenue: 5020, netProfit: -100 })],
      actions: calm(),
    }, 'C-Phone', 'https://x');
    expect(t).toContain('📉 กำไรสุทธิ -320 บาท');
    expect(t).toContain('• ในเมือง: รับ 10,000');
    expect(t).toContain('• ตลาด: รับ 5,020 · กำไร -100');
  });

  it('lists what needs the owner, overdue supplier bills before the rest', () => {
    const a = calm();
    a.longShifts = [{ id: 's', userName: 'ต้น', branchName: 'ในเมือง', hours: 30 }];
    a.supplierDue = { count: 3, total: 9000, overdue: 1, items: [] };
    a.customerDebt = { count: 2, total: 1500 };
    a.stock = { outOfStock: 0, lowStock: 4 };
    const lines = actionLines(a);
    expect(lines).toEqual([
      'กะของ ต้น (ในเมือง) เปิดค้าง 30 ชม. ยังไม่ปิด',
      'ใบสั่งซื้อเลยกำหนดจ่าย 1 ใบ',
      'ใบสั่งซื้อครบกำหนดจ่ายใน 3 วัน 2 ใบ',
      'ลูกค้าค้างจ่ายค่าซ่อม 2 งาน รวม 1,500 บาท',
      'สินค้าใกล้หมด 4 รายการ',
    ]);
    expect(actionCount(a)).toBe(4);
    const t = summaryText({ date: '2026-11-06', total: money(), branches: [], actions: a }, 'C', 'https://x');
    expect(t).toContain('⚠️ ต้องจัดการ 4 เรื่อง'); // topics, as on the page — not lines
  });
});
