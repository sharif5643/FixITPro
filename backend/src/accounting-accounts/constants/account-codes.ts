export const ACCOUNT_CODES = {
  // Assets — 1xxx
  CASH:           '1100',
  BANK:           '1110',
  CLEARING:       '1120',
  REPAIR_AR:      '1200',
  OTHER_AR:       '1210',
  INVENTORY:      '1300',
  PARTS_INVENTORY:'1310',
  // Liabilities — 2xxx
  AP:             '2100',
  CUSTOMER_DEPOSIT: '2110',
  // Equity — 3xxx
  OWNER_EQUITY:   '3100',
  // Revenue — 4xxx
  SALES_REVENUE:  '4100',
  REPAIR_REVENUE: '4200',
  PACKAGE_REVENUE:'4300',
  // Expenses — 5xxx / 6xxx
  COGS:           '5100',
  REPAIR_COGS:    '5200',
  OPERATING_EXPENSE: '6100',
  OTHER_EXPENSE:  '6200',
} as const;

export type AccountCodeKey = keyof typeof ACCOUNT_CODES;
export type AccountCode    = (typeof ACCOUNT_CODES)[AccountCodeKey];
