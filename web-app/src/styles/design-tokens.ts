/**
 * Design tokens — single source of truth for visual constants.
 * Use these directly in components rather than repeating raw values.
 */

// ── Border radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm:   'rounded-md',      // 6 px  — inputs, small chips
  md:   'rounded-lg',      // 10 px — buttons, dropdowns
  lg:   'rounded-xl',      // 14 px — cards, dialogs
  xl:   'rounded-2xl',     // 20 px — hero cards, stat panels
  full: 'rounded-full',    // pills, avatars, badges
} as const

// ── Shadows ───────────────────────────────────────────────────────────────────
export const shadow = {
  card:       'shadow-card',
  cardHover:  'shadow-card-hover',
  sm:         'shadow-sm',
  md:         'shadow-md',
  none:       'shadow-none',
} as const

// ── Card spacing ──────────────────────────────────────────────────────────────
export const cardSpacing = {
  compact: 'p-3',
  default: 'p-4',
  relaxed: 'p-5',
  loose:   'p-6',
} as const

// ── Animation timing ──────────────────────────────────────────────────────────
export const motion = {
  fast:    '100ms',
  normal:  '200ms',
  slow:    '300ms',
  ease:    'ease-in-out',
} as const

// ── Typography scale ──────────────────────────────────────────────────────────
export const typography = {
  display:  'text-3xl font-bold tracking-tight',
  heading:  'text-xl font-bold',
  title:    'text-base font-semibold',
  body:     'text-sm',
  caption:  'text-xs text-muted-foreground',
  mono:     'font-mono tabular-nums',
  money:    'font-mono tabular-nums font-semibold',
} as const

// ── Badge color map (soft / accessible) ──────────────────────────────────────
export const badgeColors = {
  green:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  yellow:   { bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500',   border: 'border-amber-200 dark:border-amber-800' },
  red:      { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-400',         dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
  blue:     { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  purple:   { bg: 'bg-purple-100 dark:bg-purple-900/40',   text: 'text-purple-700 dark:text-purple-400',   dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
  orange:   { bg: 'bg-orange-100 dark:bg-orange-900/40',   text: 'text-orange-700 dark:text-orange-400',   dot: 'bg-orange-500',  border: 'border-orange-200 dark:border-orange-800' },
  slate:    { bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-700 dark:text-slate-300',     dot: 'bg-slate-400',   border: 'border-slate-200 dark:border-slate-700' },
  teal:     { bg: 'bg-teal-100 dark:bg-teal-900/40',       text: 'text-teal-700 dark:text-teal-400',       dot: 'bg-teal-500',    border: 'border-teal-200 dark:border-teal-800' },
} as const

export type BadgeColor = keyof typeof badgeColors

// ── Repair status → color mapping ────────────────────────────────────────────
export const repairStatusColor: Record<string, BadgeColor> = {
  RECEIVED:         'blue',
  DIAGNOSING:       'yellow',
  WAITING_PARTS:    'orange',
  IN_PROGRESS:      'purple',
  WAITING_APPROVAL: 'yellow',
  APPROVED:         'teal',
  COMPLETED:        'green',
  DELIVERED:        'slate',
  CANCELLED:        'red',
}

// ── SLA severity → color mapping ─────────────────────────────────────────────
export const slaTierColor: Record<string, BadgeColor> = {
  green:  'green',
  yellow: 'yellow',
  red:    'red',
}

// ── Stock alert → color mapping ───────────────────────────────────────────────
export const stockAlertColor = {
  NORMAL:    'green',
  LOW:       'yellow',
  STOCKOUT:  'red',
  OVERSTOCK: 'blue',
} as const satisfies Record<string, BadgeColor>
