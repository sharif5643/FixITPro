'use client'

import Link from 'next/link'
import { Wrench, ShoppingCart, BarChart2, Package, Users, Bell, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { PCard, CardHeader } from './primitives'

const ALL_ACTIONS = [
  {
    label: 'รับงานซ่อม', href: '/repairs', icon: Wrench, module: 'repair',
    color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  },
  {
    label: 'เปิด POS', href: '/sales', icon: ShoppingCart, module: 'pos',
    color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  },
  {
    label: 'รายงานวันนี้', href: '/reports/daily-closing', icon: BarChart2, module: 'report',
    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  },
  {
    label: 'สต็อกสินค้า', href: '/products', icon: Package, module: 'stock',
    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  },
  {
    label: 'ลูกค้า', href: '/customers', icon: Users, module: 'crm',
    color: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400',
  },
  {
    label: 'แจ้งเตือน', href: '/notifications', icon: Bell, module: null,
    color: 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400',
  },
] as const

export function QuickActions() {
  const hasModule = useAuthStore(s => s.hasModule)
  const visible = ALL_ACTIONS.filter(a => !a.module || hasModule(a.module))

  return (
    <PCard className="p-5">
      <CardHeader
        icon={Zap}
        iconBg="bg-violet-50 dark:bg-violet-900/20"
        iconColor="text-violet-600 dark:text-violet-400"
        title="Quick Actions"
      />
      <nav aria-label="ทางลัด">
        <div className="grid grid-cols-2 gap-2">
          {visible.map(a => (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 p-3',
                'hover:border-slate-200 dark:hover:border-slate-600 hover:-translate-y-0.5 hover:shadow-sm',
                'transition-all group motion-safe:transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                'min-h-[44px]',
              )}
            >
              <div className={cn('flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0', a.color)}>
                <a.icon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white leading-tight">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </PCard>
  )
}
