import { AccountType } from '@prisma/client';

export interface AccountTemplate {
  code:     string;
  name:     string;
  nameTh:   string;
  type:     AccountType;
  subType?: string;
  sortOrder: number;
}

export const CHART_OF_ACCOUNTS_TEMPLATE: readonly AccountTemplate[] = [
  { code: '1100', nameTh: 'เงินสดในมือ',            name: 'Cash on Hand',             type: 'ASSET',     sortOrder: 10  },
  { code: '1110', nameTh: 'เงินฝากธนาคาร',           name: 'Bank Deposit',             type: 'ASSET',     sortOrder: 20  },
  { code: '1120', nameTh: 'Transfer/Card Clearing', name: 'Transfer/Card Clearing',   type: 'ASSET',     sortOrder: 30  },
  { code: '1200', nameTh: 'ลูกหนี้งานซ่อม',           name: 'Repair Accounts Receivable', type: 'ASSET',  sortOrder: 40  },
  { code: '1210', nameTh: 'ลูกหนี้อื่น',              name: 'Other Accounts Receivable', type: 'ASSET',   sortOrder: 50  },
  { code: '1300', nameTh: 'สินค้าคงเหลือ',            name: 'Inventory',                type: 'ASSET',     sortOrder: 60  },
  { code: '1310', nameTh: 'อะไหล่คงเหลือ',            name: 'Repair Parts Inventory',  type: 'ASSET',     sortOrder: 70  },
  { code: '2100', nameTh: 'เจ้าหนี้การค้า',           name: 'Accounts Payable',         type: 'LIABILITY', sortOrder: 110 },
  { code: '2110', nameTh: 'เงินมัดจำลูกค้า',          name: 'Customer Deposit',         type: 'LIABILITY', sortOrder: 120 },
  { code: '3100', nameTh: 'ทุนเจ้าของ',               name: "Owner's Equity",           type: 'EQUITY',    sortOrder: 210 },
  { code: '4100', nameTh: 'รายได้จากการขาย',          name: 'Sales Revenue',            type: 'REVENUE',   sortOrder: 310 },
  { code: '4200', nameTh: 'รายได้จากงานซ่อม',         name: 'Repair Revenue',           type: 'REVENUE',   sortOrder: 320 },
  { code: '4300', nameTh: 'รายได้แพ็คเกจ',            name: 'Package Revenue',          type: 'REVENUE',   sortOrder: 330 },
  { code: '5100', nameTh: 'ต้นทุนสินค้า',             name: 'Cost of Goods Sold',       type: 'EXPENSE',   sortOrder: 410 },
  { code: '5200', nameTh: 'ต้นทุนอะไหล่ซ่อม',         name: 'Repair Parts Cost',        type: 'EXPENSE',   sortOrder: 420 },
  { code: '6100', nameTh: 'ค่าใช้จ่ายดำเนินงาน',      name: 'Operating Expenses',       type: 'EXPENSE',   sortOrder: 510 },
  { code: '6200', nameTh: 'ค่าใช้จ่ายอื่น',           name: 'Other Expenses',           type: 'EXPENSE',   sortOrder: 520 },
] as const;

export const COA_TEMPLATE_COUNT = CHART_OF_ACCOUNTS_TEMPLATE.length; // 17
