export const MODULE_KEYS = {
  POS:             'pos',
  REPAIR:          'repair',
  STOCK:           'stock',
  FINANCE:         'finance',
  CRM:             'crm',
  LINE_NOTIFY:     'line_notify',
  REPORT:          'report',
  USER_MANAGEMENT: 'user_management',
} as const

export type ModuleKey = typeof MODULE_KEYS[keyof typeof MODULE_KEYS]

export const ALL_MODULE_KEYS: ModuleKey[] = Object.values(MODULE_KEYS)
