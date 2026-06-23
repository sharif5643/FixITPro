'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wrench, ShoppingCart, Users, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าหลัก' },
  { href: '/repairs',   icon: Wrench,          label: 'งานซ่อม'  },
  { href: '/sales',     icon: ShoppingCart,    label: 'POS'       },
  { href: '/customers', icon: Users,           label: 'ลูกค้า'    },
  { href: '/reports',   icon: BarChart2,       label: 'รายงาน'   },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex h-[60px]">
        {ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                active ? 'text-blue-600' : 'text-slate-400 active:text-slate-600',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
              <span className={cn('text-[10px] font-medium leading-none', active ? 'text-blue-600' : 'text-slate-500')}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
