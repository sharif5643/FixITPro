'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wrench, ShoppingCart, Package, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/staff/home',      icon: Home,         label: 'หน้าแรก'   },
  { href: '/staff/repairs',   icon: Wrench,       label: 'งานซ่อม'   },
  { href: '/staff/pos',       icon: ShoppingCart, label: 'POS'        },
  { href: '/staff/stock',     icon: Package,      label: 'สต็อก'     },
  { href: '/staff/more',      icon: LayoutGrid,   label: 'เพิ่มเติม'  },
]

export function StaffBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)] border-t border-slate-100">
      <div className="flex h-[70px] items-center">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-1"
            >
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                active ? 'bg-brand-yellow' : 'bg-transparent',
              )}>
                <Icon
                  className={cn('h-5 w-5', active ? 'text-brand-black' : 'text-slate-400')}
                  strokeWidth={active ? 2.5 : 1.8}
                />
              </div>
              <span className={cn(
                'text-[10px] font-semibold leading-none',
                active ? 'text-brand-black' : 'text-slate-400',
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
