'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Wrench, Users, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
  { href: '/repairs',   icon: Wrench,          label: 'ซ่อม'    },
  { href: '/sales',     icon: ShoppingCart,    label: 'POS'     },
  { href: '/customers', icon: Users,           label: 'ลูกค้า'  },
  { href: '/reports',   icon: BarChart2,       label: 'รายงาน' },
]

export function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-700/60 flex items-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2.5 min-h-[56px] relative"
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-blue-600" />
            )}
            <Icon className={cn(
              'h-5 w-5 transition-colors',
              active ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500',
            )} />
            <span className={cn(
              'text-[10px] font-semibold mt-1 leading-none transition-colors',
              active ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500',
            )}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
