'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Home, ShoppingCart, Wrench, Package, Bell, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const ITEMS = [
  { href: '/sunmi',               icon: Home,         label: 'หน้าหลัก',  exact: true },
  { href: '/sunmi/sales',         icon: ShoppingCart, label: 'ขาย',        exact: false },
  { href: '/sunmi/repairs',       icon: Wrench,       label: 'งานซ่อม',   exact: false },
  { href: '/sunmi/stock',         icon: Package,      label: 'สต็อก',      exact: false },
  { href: '/sunmi/transfers',     icon: ArrowRightLeft, label: 'โอนสต็อก',  exact: false },
  { href: '/sunmi/notifications', icon: Bell,           label: 'แจ้งเตือน', exact: false },
]

export function MobileBottomNav() {
  const pathname = usePathname()

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      try {
        const res = await api.get('/notifications', { params: { unread: true, limit: 1 } })
        return res.data?.total ?? res.data?.unreadCount ?? 0
      } catch {
        return 0
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  return (
    <nav
      className="flex items-stretch bg-slate-900 border-t border-slate-700/50 shrink-0 select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {ITEMS.map(({ href, icon: Icon, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        const isBell = href === '/sunmi/notifications'

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              // Minimum 44 px tall touch target (WCAG)
              'flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2',
              'transition-colors duration-150 relative',
              // Active: brighter + slightly lifted icon area
              active
                ? 'text-blue-400'
                : 'text-slate-500 active:bg-slate-800/60',
            )}
          >
            {/* Active indicator pill above icon */}
            <span className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-200',
              active ? 'w-8 bg-blue-400' : 'w-0 bg-transparent',
            )} />

            {/* Icon wrapper — larger hit area */}
            <div className={cn(
              'relative flex items-center justify-center rounded-xl transition-all duration-150',
              active
                ? 'bg-blue-500/15 w-10 h-7'
                : 'w-10 h-7',
            )}>
              <Icon className={cn('transition-all duration-150', active ? 'h-5 w-5 text-blue-400' : 'h-5 w-5')} />

              {/* Notification badge */}
              {isBell && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>

            <span className={cn(
              'text-[9px] font-semibold leading-none transition-colors duration-150',
              active ? 'text-blue-400' : 'text-slate-500',
            )}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export { MobileBottomNav as SunmiBottomNav }
